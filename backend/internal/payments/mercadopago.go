package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/Ulisesgtz/medic-track/backend/internal/mailer"
)

const mercadoPagoBase = "https://api.mercadopago.com"

// MercadoPago is the Provider that talks to Mercado Pago's API. The access token travels only in the Authorization header: it is
// never put in an address, an error, a log or a response. It does not follow redirects and has a short timeout.
type MercadoPago struct {
	token  string
	base   string
	client *http.Client
}

// NewMercadoPago creates the client. `base` is empty in production (the tests point it at an httptest server).
func NewMercadoPago(token, base string) *MercadoPago {
	if base == "" {
		base = mercadoPagoBase
	}
	return &MercadoPago{
		token: token,
		base:  base,
		client: &http.Client{
			Timeout:       10 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
}

// Name is what subscriptions.provider holds.
func (m *MercadoPago) Name() string { return DriverMercadoPago }

// call runs one request. A 404 is ErrRemoteNotFound, a network error, a 429 or a 5xx is ErrTemporary, any other non-2xx is a
// plain error that carries only the status number: the body of the answer is never read into an error.
func (m *MercadoPago) call(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("encoding the request: %w", err)
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, m.base+path, reader)
	if err != nil {
		return fmt.Errorf("building the request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+m.token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := m.client.Do(req)
	if err != nil {
		// The error of net/http may carry the address; the address has no secret, but keep it out anyway.
		return fmt.Errorf("%w: the request failed", ErrTemporary)
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound:
		return ErrRemoteNotFound
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return fmt.Errorf("%w: status %d", ErrTemporary, resp.StatusCode)
	case resp.StatusCode < 200 || resp.StatusCode > 299:
		return refusal(resp.StatusCode, resp.Body)
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out); err != nil {
		return errors.New("the provider's answer could not be read")
	}
	return nil
}

// RefusedError is a request the provider refused (a 4xx other than «not found»). It carries only what is safe to write in a log: the
// status, the provider's short error slug and the numeric/alphanumeric codes of its causes. The provider's descriptions are NOT kept:
// they can echo what was sent (an e-mail, an address).
type RefusedError struct {
	Status int
	Slug   string
	Codes  []string
	// Message is the provider's own short explanation, cleaned (e-mails, ids and tokens replaced) and cut at 120 characters.
	Message string
}

func (e *RefusedError) Error() string {
	return fmt.Sprintf("the provider refused the request: status %d", e.Status)
}

// Detail is the fixed-shape text added to a report so the reason of a refusal can be read in error_logs: «status 400 bad_request, causes 1,2».
func (e *RefusedError) Detail() string {
	out := fmt.Sprintf("status %d", e.Status)
	if e.Slug != "" {
		out += " " + e.Slug
	}
	if len(e.Codes) > 0 {
		out += ", causes " + strings.Join(e.Codes, ",")
	}
	if e.Message != "" {
		out += `: "` + e.Message + `"`
	}
	return out
}

var safeToken = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,40}$`)

// refusal reads the small error body of the provider keeping only safe tokens (see RefusedError).
func refusal(status int, body io.Reader) error {
	e := &RefusedError{Status: status}
	var parsed struct {
		Message string `json:"message"`
		Error   string `json:"error"`
		Cause []struct {
			Code any `json:"code"`
		} `json:"cause"`
	}
	if json.NewDecoder(io.LimitReader(body, 8<<10)).Decode(&parsed) != nil {
		return e
	}
	e.Message = mailer.Clean(parsed.Message, 120)
	if safeToken.MatchString(parsed.Error) {
		e.Slug = parsed.Error
	}
	for _, c := range parsed.Cause {
		code := fmt.Sprint(c.Code)
		if safeToken.MatchString(code) && len(e.Codes) < 5 {
			e.Codes = append(e.Codes, code)
		}
	}
	return e
}

type createBody struct {
	Reason            string        `json:"reason"`
	ExternalReference string        `json:"external_reference"`
	PayerEmail        string        `json:"payer_email"`
	BackURL           string        `json:"back_url"`
	NotificationURL   string        `json:"notification_url,omitempty"`
	Status            string        `json:"status"`
	AutoRecurring     autoRecurring `json:"auto_recurring"`
}

type autoRecurring struct {
	Frequency         int    `json:"frequency"`
	FrequencyType     string `json:"frequency_type"`
	TransactionAmount int    `json:"transaction_amount"`
	CurrencyID        string `json:"currency_id"`
}

// CreateSubscription creates the subscription pending, without a card: the person leaves theirs on Mercado Pago's own page.
// Nothing about children or health is sent: the reason is a fixed text.
func (m *MercadoPago) CreateSubscription(ctx context.Context, req CreateRequest) (Created, error) {
	var out struct {
		ID        string `json:"id"`
		InitPoint string `json:"init_point"`
	}
	body := createBody{
		Reason:            req.Reason,
		ExternalReference: req.ExternalReference,
		PayerEmail:        req.PayerEmail,
		BackURL:           req.BackURL,
		NotificationURL:   req.NotificationURL,
		Status:            "pending",
		AutoRecurring:     autoRecurring{Frequency: req.FrequencyMonths, FrequencyType: "months", TransactionAmount: req.AmountMXN, CurrencyID: "MXN"},
	}
	if err := m.call(ctx, http.MethodPost, "/preapproval", body, &out); err != nil {
		return Created{}, err
	}
	if out.ID == "" || out.InitPoint == "" {
		return Created{}, errors.New("the provider's answer has no subscription or no payment page")
	}
	return Created{ID: out.ID, CheckoutURL: out.InitPoint}, nil
}

// GetSubscription reads the subscription's real state.
func (m *MercadoPago) GetSubscription(ctx context.Context, id string) (Remote, error) {
	var out struct {
		ID                string `json:"id"`
		Status            string `json:"status"`
		NextPaymentDate   string `json:"next_payment_date"`
		LastModified      string `json:"last_modified"`
		ExternalReference string `json:"external_reference"`
	}
	if err := m.call(ctx, http.MethodGet, "/preapproval/"+url.PathEscape(id), nil, &out); err != nil {
		return Remote{}, err
	}
	return Remote{ID: out.ID, Status: out.Status, NextPaymentDate: parseTime(out.NextPaymentDate), LastModified: derefTime(parseTime(out.LastModified)), ExternalReference: out.ExternalReference}, nil
}

// GetAuthorizedPayment reads one recurring charge. Its status is the payment's when it has one (approved, rejected…), else the
// charge's own (scheduled, processed, recycling, cancelled).
func (m *MercadoPago) GetAuthorizedPayment(ctx context.Context, id string) (RemotePayment, error) {
	var out struct {
		ID            any    `json:"id"`
		PreapprovalID string `json:"preapproval_id"`
		Status        string `json:"status"`
		LastModified  string `json:"last_modified"`
		Payment       struct {
			Status string `json:"status"`
		} `json:"payment"`
	}
	if err := m.call(ctx, http.MethodGet, "/authorized_payments/"+url.PathEscape(id), nil, &out); err != nil {
		return RemotePayment{}, err
	}
	status := out.Status
	if out.Payment.Status != "" {
		status = out.Payment.Status
	}
	return RemotePayment{ID: fmt.Sprint(out.ID), SubscriptionID: out.PreapprovalID, Status: status, LastModified: derefTime(parseTime(out.LastModified))}, nil
}

// GetPayment reads one payment. Its subscription is only known when the provider says so; otherwise it is empty and the notice
// is ignored.
func (m *MercadoPago) GetPayment(ctx context.Context, id string) (RemotePayment, error) {
	var out struct {
		ID              any    `json:"id"`
		Status          string `json:"status"`
		DateLastUpdated string `json:"date_last_updated"`
		Metadata        struct {
			PreapprovalID string `json:"preapproval_id"`
		} `json:"metadata"`
	}
	if err := m.call(ctx, http.MethodGet, "/v1/payments/"+url.PathEscape(id), nil, &out); err != nil {
		return RemotePayment{}, err
	}
	return RemotePayment{ID: fmt.Sprint(out.ID), SubscriptionID: out.Metadata.PreapprovalID, Status: out.Status, LastModified: derefTime(parseTime(out.DateLastUpdated))}, nil
}

// CancelSubscription stops the renewals.
func (m *MercadoPago) CancelSubscription(ctx context.Context, id string) error {
	return m.call(ctx, http.MethodPut, "/preapproval/"+url.PathEscape(id), map[string]string{"status": "cancelled"}, nil)
}

// parseTime reads the provider's dates (RFC 3339 with or without fractions); nil if empty or unreadable.
func parseTime(s string) *time.Time {
	if s == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.000-07:00", "2006-01-02T15:04:05.000Z0700", "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

func derefTime(t *time.Time) time.Time {
	if t == nil {
		return time.Time{}
	}
	return *t
}
