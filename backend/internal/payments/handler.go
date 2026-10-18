package payments

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

const maxWebhookBody = 64 << 10

// Handler exposes the subscription endpoints (contracts/api.md) and the provider's notices (contracts/webhook.md). Everything is
// written through the Responder. `fake` is only set when PAYMENTS_DRIVER=fake: it moves the in-memory provider's state.
type Handler struct {
	service   *Service
	responder *httpx.Responder
	cfg       Config
	fake      *Fake
}

// NewHandler creates the Handler.
func NewHandler(service *Service, responder *httpx.Responder, cfg Config) *Handler {
	return &Handler{service: service, responder: responder, cfg: cfg}
}

// WithFake enables the helper routes of the fake provider.
func (h *Handler) WithFake(fake *Fake) *Handler {
	h.fake = fake
	return h
}

// Fake reports whether the helper routes of the fake provider exist.
func (h *Handler) Fake() bool { return h.fake != nil }

type priceResponse struct {
	Amount   int    `json:"amount" example:"499"`
	Currency string `json:"currency" example:"MXN"`
	Period   string `json:"period" example:"year"`
} // @name SubscriptionPrice

type subscriptionResponse struct {
	Status        string  `json:"status" enums:"pending,active,grace,canceled,ended" example:"active"`
	PaidThrough   *string `json:"paidThrough" example:"2027-10-15T18:00:00Z"`
	Renews        bool    `json:"renews" example:"true"`
	NextRenewalAt *string `json:"nextRenewalAt" example:"2027-10-15T18:00:00Z"`
	GraceUntil    *string `json:"graceUntil" example:"2026-10-22T18:00:00Z"`
	EndedAt       *string `json:"endedAt" example:"2026-10-22T18:00:00Z"`
	// CheckoutUrl: the provider's page where the person pays, only while the subscription is pending.
	CheckoutUrl *string `json:"checkoutUrl"`
} // @name SubscriptionInfo

type subscriptionStateResponse struct {
	Available     bool                  `json:"available" example:"true"`
	Price         priceResponse         `json:"price"`
	CanSubscribe  bool                  `json:"canSubscribe" example:"true"`
	BlockedReason *string               `json:"blockedReason" enums:"already_paid,covered_by_family,pending,unavailable"`
	CoveredBy     *string               `json:"coveredBy" example:"Ana"`
	Subscription  *subscriptionResponse `json:"subscription"`
} // @name SubscriptionStateResponse

type subscribeResponse struct {
	CheckoutUrl string `json:"checkoutUrl" example:"https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=2c93808"`
	Status      string `json:"status" example:"pending"`
} // @name SubscribeResponse

type errorDoc struct {
	Error     string `json:"error" example:"subscription_not_allowed"`
	Message   string `json:"message"`
	Reason    string `json:"reason,omitempty" example:"covered_by_family"`
	CoveredBy string `json:"coveredBy,omitempty" example:"Ana"`
} // @name PaymentsErrorResponse

func timeString(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.UTC().Format(time.RFC3339)
	return &s
}

func toResponse(st State) subscriptionStateResponse {
	out := subscriptionStateResponse{
		Available:    st.Available,
		Price:        priceResponse{Amount: st.PriceMXN, Currency: "MXN", Period: "year"},
		CanSubscribe: st.CanSubscribe,
	}
	if st.BlockedReason != "" {
		reason := st.BlockedReason
		out.BlockedReason = &reason
	}
	if st.CoveredBy != "" {
		by := st.CoveredBy
		out.CoveredBy = &by
	}
	if sub := st.Subscription; sub != nil {
		r := &subscriptionResponse{
			Status: string(sub.Status), PaidThrough: timeString(sub.PaidThrough), Renews: sub.Renews,
			NextRenewalAt: timeString(sub.NextRenewalAt), GraceUntil: timeString(sub.GraceUntil), EndedAt: timeString(sub.EndedAt),
		}
		if sub.CheckoutURL != "" {
			url := sub.CheckoutURL
			r.CheckoutUrl = &url
		}
		out.Subscription = r
	}
	return out
}

func (h *Handler) accountParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, "accountId"))
	if err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusNotFound, "account_not_found", "Account not found", nil)
		return uuid.Nil, false
	}
	return id, true
}

// writeError maps the domain errors to the contract's answers.
func (h *Handler) writeError(ctx context.Context, w http.ResponseWriter, err error, accountID uuid.UUID, internal string) {
	var notAllowed *NotAllowedError
	switch {
	case errors.As(err, &notAllowed):
		message := "Tu cuenta ya tiene el plan completo."
		if notAllowed.Reason == ReasonCoveredByFamily {
			message = "Tu plan es el de la familia de " + notAllowed.CoveredBy + "."
		}
		h.responder.WriteJSON(ctx, w, http.StatusConflict, errorDoc{Error: "subscription_not_allowed", Message: message, Reason: notAllowed.Reason, CoveredBy: notAllowed.CoveredBy}, &accountID)
	case errors.Is(err, ErrUnavailable):
		h.responder.WriteJSONError(ctx, w, http.StatusServiceUnavailable, "payments_unavailable", "Payments are not available right now", &accountID)
	case errors.Is(err, ErrProvider):
		h.responder.WriteJSONError(ctx, w, http.StatusBadGateway, "provider_error", "The payment provider could not complete the request", &accountID)
	case errors.Is(err, ErrNotFound):
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "account_not_found", "Account not found", &accountID)
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", internal, &accountID)
	}
}

// GetSubscription handles GET /accounts/{accountId}/subscription.
//
//	@Summary		The state of the account's subscription and whether it can subscribe
//	@Description	What /planes needs: whether the charge is available in this environment, the price, whether the account can subscribe and, if
//	@Description	not, why (`already_paid`, `covered_by_family` with the owner's first name, `pending`, `unavailable`), and the subscription's
//	@Description	public state (no provider id, no card). Reading never depends on the plan.
//	@Tags			payments
//	@Produce		json
//	@Param			accountId	path		string	true	"Account UUID"
//	@Success		200			{object}	subscriptionStateResponse
//	@Failure		404			{object}	errorDoc	"No account exists for this id"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The account is not the session's own"
//	@Router			/accounts/{accountId}/subscription [get]
func (h *Handler) GetSubscription(w http.ResponseWriter, r *http.Request) {
	accountID, ok := h.accountParam(w, r)
	if !ok {
		return
	}
	st, err := h.service.State(r.Context(), accountID)
	if err != nil {
		h.writeError(r.Context(), w, err, accountID, "Could not read the subscription")
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toResponse(st), &accountID)
}

// Subscribe handles POST /accounts/{accountId}/subscription.
//
//	@Summary		Start paying the full plan
//	@Description	Creates a pending subscription at the payment provider and returns the provider's page, where the person leaves their card
//	@Description	(PediTrack never sees it). Reuses a pending one of the last 24 hours (200). 409 `subscription_not_allowed` when the account
//	@Description	already has the full plan or is covered by another account's family (`covered_by_family` with the owner's first name).
//	@Tags			payments
//	@Produce		json
//	@Param			accountId	path		string	true	"Account UUID"
//	@Success		201			{object}	subscribeResponse
//	@Success		200			{object}	subscribeResponse	"A pending subscription was reused"
//	@Failure		409			{object}	errorDoc			"The account cannot subscribe"
//	@Failure		503			{object}	errorDoc			"Payments are not available"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The account is not the session's own"
//	@Router			/accounts/{accountId}/subscription [post]
func (h *Handler) Subscribe(w http.ResponseWriter, r *http.Request) {
	accountID, ok := h.accountParam(w, r)
	if !ok {
		return
	}
	res, err := h.service.Subscribe(r.Context(), accountID)
	if err != nil {
		h.writeError(r.Context(), w, err, accountID, "Could not start the subscription")
		return
	}
	status := http.StatusCreated
	if res.Reused {
		status = http.StatusOK
	}
	h.responder.WriteJSON(r.Context(), w, status, subscribeResponse{CheckoutUrl: res.CheckoutURL, Status: string(StatusPending)}, &accountID)
}

// Cancel handles POST /accounts/{accountId}/subscription/cancel.
//
//	@Summary		Cancel the renewal
//	@Description	An active or grace subscription is canceled at the provider and the plan lasts until the end of what was paid; one that never
//	@Description	paid ends. Idempotent. If the provider fails nothing changes (502).
//	@Tags			payments
//	@Produce		json
//	@Param			accountId	path		string	true	"Account UUID"
//	@Success		200			{object}	subscriptionStateResponse
//	@Failure		502			{object}	errorDoc	"The provider did not cancel it"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The account is not the session's own"
//	@Router			/accounts/{accountId}/subscription/cancel [post]
func (h *Handler) Cancel(w http.ResponseWriter, r *http.Request) {
	accountID, ok := h.accountParam(w, r)
	if !ok {
		return
	}
	if err := h.service.Cancel(r.Context(), accountID); err != nil {
		h.writeError(r.Context(), w, err, accountID, "Could not cancel the subscription")
		return
	}
	st, err := h.service.State(r.Context(), accountID)
	if err != nil {
		h.writeError(r.Context(), w, err, accountID, "Could not read the subscription")
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toResponse(st), &accountID)
}

// Webhook handles POST /payments/webhooks/mercadopago: the provider's notice. Public (no session): it is verified by the signature
// (when the secret is configured), it only carries an id, and the real state is read from the provider. A bad signature is a 401
// that is NOT written to error_logs (anyone can send one).
//
//	@Summary		Notice of the payment provider
//	@Description	Mercado Pago tells us a subscription or a charge changed. The signature (`x-signature`) is verified, the resource is read from
//	@Description	the provider and the result applied idempotently. Always answers 200 for a verified notice (an unknown subscription is ignored);
//	@Description	500 if the provider could not be asked, so it retries.
//	@Tags			payments
//	@Accept			json
//	@Produce		json
//	@Param			type	query		string	false	"Topic of the notice"
//	@Param			data.id	query		string	false	"Id of the resource"
//	@Success		200		{object}	map[string]bool
//	@Failure		401		{object}	errorDoc	"Invalid signature"
//	@Router			/payments/webhooks/mercadopago [post]
func (h *Handler) Webhook(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxWebhookBody)
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		h.responder.WriteJSONErrorUnlogged(w, http.StatusRequestEntityTooLarge, "invalid_notice", "The notice is too large")
		return
	}
	var body struct {
		Type  string `json:"type"`
		Topic string `json:"topic"`
		Data  struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	_ = json.Unmarshal(raw, &body) // the body is optional: the query carries the same
	q := r.URL.Query()
	dataID := q.Get("data.id")
	if dataID == "" {
		dataID = body.Data.ID
	}
	topic := q.Get("type")
	if topic == "" {
		topic = q.Get("topic")
	}
	if topic == "" {
		topic = body.Type
	}
	if topic == "" {
		topic = body.Topic
	}

	if h.cfg.WebhookSecret != "" {
		if err := VerifySignature(h.cfg.WebhookSecret, r.Header.Get("x-signature"), r.Header.Get("x-request-id"), q.Get("data.id"), h.service.now()); err != nil {
			h.responder.WriteJSONErrorUnlogged(w, http.StatusUnauthorized, "invalid_signature", "Invalid signature")
			return
		}
	}
	if dataID == "" {
		h.responder.WriteJSON(r.Context(), w, http.StatusOK, map[string]bool{"ok": true}, nil)
		return
	}
	if err := h.service.ProcessNotification(r.Context(), topic, dataID); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "notice_not_processed", "The notice could not be processed", nil)
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, map[string]bool{"ok": true}, nil)
}

// FakeAction handles POST /payments/fake/{subscriptionId}/{action}: the helper of the fake provider (tests and development). It moves
// the fake's state and runs the same processing as the webhook. It is only registered with PAYMENTS_DRIVER=fake.
//
//	@Summary		Move the fake provider's state (testing only)
//	@Description	Only exists with PAYMENTS_DRIVER=fake. `approve`, `renew`, `reject`, `pause` or `cancel`.
//	@Tags			payments
//	@Produce		json
//	@Param			subscriptionId	path		string	true	"Fake subscription id"
//	@Param			action			path		string	true	"approve, renew, reject, pause or cancel"
//	@Success		200				{object}	map[string]bool
//	@Failure		404				{object}	errorDoc	"Unknown subscription or action"
//	@Router			/payments/fake/{subscriptionId}/{action} [post]
func (h *Handler) FakeAction(w http.ResponseWriter, r *http.Request) {
	id, action := chi.URLParam(r, "subscriptionId"), chi.URLParam(r, "action")
	ctx := r.Context()
	var topic, resource string
	var err error
	switch action {
	case "approve", "renew":
		resource, err = h.fake.Approve(id, h.service.now().AddDate(1, 0, 0))
		topic = TopicAuthorizedPayment
	case "reject":
		resource, err = h.fake.Reject(id)
		topic = TopicAuthorizedPayment
	case "pause":
		err = h.fake.Pause(id)
		topic, resource = TopicSubscription, id
	case "cancel":
		err = h.fake.CancelSubscription(ctx, id)
		topic, resource = TopicSubscription, id
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "unknown_action", "Unknown action", nil)
		return
	}
	if err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "subscription_not_found", "Subscription not found", nil)
		return
	}
	if err := h.service.ProcessNotification(ctx, topic, resource); err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "notice_not_processed", "The notice could not be processed", nil)
		return
	}
	h.responder.WriteJSON(ctx, w, http.StatusOK, map[string]bool{"ok": true}, nil)
}
