package payments_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/payments"
)

const webhookSecret = "whsec_handler_test"

// logCapture is the error_logs recorder of the tests: it keeps what the Responder logs.
type logCapture struct {
	mu      sync.Mutex
	entries []errorlog.Entry
}

func (c *logCapture) Create(_ context.Context, e *errorlog.Entry) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = append(c.entries, *e)
	return nil
}

func (c *logCapture) all() []errorlog.Entry {
	// The Responder writes in the background: give it a moment.
	time.Sleep(50 * time.Millisecond)
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]errorlog.Entry(nil), c.entries...)
}

// api is the handler on a router of its own (the guards are tested in the server's router test).
type api struct {
	*world
	router http.Handler
	logs   *logCapture
	cfg    payments.Config
}

func newAPI(t *testing.T, cfg payments.Config, provider func(*payments.Fake) payments.Provider) *api {
	t.Helper()
	pool := testPool(t)
	repo := newRepo(t, pool)
	fake := payments.NewFake(cfg.FrontendOrigin)
	var p payments.Provider = fake
	if provider != nil {
		p = provider(fake)
	}
	w := build(t, pool, repo, p, cfg)
	w.fake = fake
	logs := &logCapture{}
	h := payments.NewHandler(w.svc, httpx.NewResponder(logs), cfg)
	if cfg.Fake() {
		h = h.WithFake(fake)
	}
	r := chi.NewRouter()
	r.Get("/accounts/{accountId}/subscription", h.GetSubscription)
	r.Post("/accounts/{accountId}/subscription", h.Subscribe)
	r.Post("/accounts/{accountId}/subscription/cancel", h.Cancel)
	r.Post("/payments/webhooks/mercadopago", h.Webhook)
	r.Post("/payments/fake/{subscriptionId}/{action}", h.FakeAction)
	return &api{world: w, router: r, logs: logs, cfg: cfg}
}

func withSecret() payments.Config {
	c := fakeConfig
	c.WebhookSecret = webhookSecret
	return c
}

func (a *api) do(t *testing.T, method, path, body string, headers map[string]string) (int, map[string]any, string) {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	a.router.ServeHTTP(rec, req)
	out := map[string]any{}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out, rec.Body.String()
}

// signed builds the headers of a notice the provider signed at `ts` (milliseconds).
func signed(secret, dataID, requestID string, ts time.Time) map[string]string {
	t := fmt.Sprint(ts.UnixMilli())
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("id:" + strings.ToLower(dataID) + ";request-id:" + requestID + ";ts:" + t + ";"))
	return map[string]string{"x-signature": "ts=" + t + ",v1=" + hex.EncodeToString(mac.Sum(nil)), "x-request-id": requestID}
}

func (a *api) notice(t *testing.T, topic, dataID string, headers map[string]string) (int, string) {
	t.Helper()
	code, _, raw := a.do(t, http.MethodPost, "/payments/webhooks/mercadopago?type="+topic+"&data.id="+dataID, "{}", headers)
	return code, raw
}

func TestAPI_TheStateOfAFreeAccountAndWhatItNeverShows(t *testing.T) {
	a := newAPI(t, fakeConfig, nil)
	id := newAccount(t, a.pool, "Ana", account.PlanFree)

	code, body, raw := a.do(t, http.MethodGet, "/accounts/"+id.String()+"/subscription", "", nil)

	require.Equal(t, http.StatusOK, code)
	require.Equal(t, true, body["available"])
	require.Equal(t, true, body["canSubscribe"])
	require.Nil(t, body["blockedReason"])
	require.Equal(t, map[string]any{"amount": float64(499), "currency": "MXN", "period": "year"}, body["price"])
	require.Nil(t, body["subscription"])
	require.NotContains(t, raw, "@example.com")
}

func TestAPI_SubscribeThenReuseThenTheStateShowsThePaymentPageOnlyWhilePending(t *testing.T) {
	a := newAPI(t, fakeConfig, nil)
	id := newAccount(t, a.pool, "Ana", account.PlanFree)
	path := "/accounts/" + id.String() + "/subscription"

	code, body, raw := a.do(t, http.MethodPost, path, "", nil)
	require.Equal(t, http.StatusCreated, code)
	require.Equal(t, "pending", body["status"])
	require.Contains(t, body["checkoutUrl"], "/planes/pago-de-prueba?sub=")
	require.NotContains(t, raw, "@example.com", "the e-mail is never given back")

	code, again, _ := a.do(t, http.MethodPost, path, "", nil)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, body["checkoutUrl"], again["checkoutUrl"])

	_, state, _ := a.do(t, http.MethodGet, path, "", nil)
	sub := state["subscription"].(map[string]any)
	require.Equal(t, "pending", sub["status"])
	require.Equal(t, body["checkoutUrl"], sub["checkoutUrl"])
	require.Equal(t, "pending", state["blockedReason"])
	for _, entry := range a.logs.all() {
		t.Fatalf("nothing should be in error_logs: %+v", entry)
	}
}

func TestAPI_WhoCannotSubscribeGets409WithAWordingThatNamesOnlyTheOwnersFirstName(t *testing.T) {
	a := newAPI(t, fakeConfig, nil)
	paid := newAccount(t, a.pool, "Pagada", account.PlanPaid)
	code, body, _ := a.do(t, http.MethodPost, "/accounts/"+paid.String()+"/subscription", "", nil)
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "subscription_not_allowed", body["error"])
	require.Equal(t, "already_paid", body["reason"])
	require.Equal(t, "Tu cuenta ya tiene el plan completo.", body["message"])

	owner := newAccount(t, a.pool, "Ana", account.PlanPaid)
	guest := newAccount(t, a.pool, "Invitada", account.PlanFree)
	join(t, a.pool, owner, guest, "tutor")
	code, body, raw := a.do(t, http.MethodPost, "/accounts/"+guest.String()+"/subscription", "", nil)
	require.Equal(t, http.StatusConflict, code)
	require.Equal(t, "covered_by_family", body["reason"])
	require.Equal(t, "Ana", body["coveredBy"])
	require.Equal(t, "Tu plan es el de la familia de Ana.", body["message"])
	require.NotContains(t, raw, "Prueba", "no last name, no e-mail")
	require.Zero(t, a.fake.Count())

	// The state says the same.
	_, state, _ := a.do(t, http.MethodGet, "/accounts/"+guest.String()+"/subscription", "", nil)
	require.Equal(t, "covered_by_family", state["blockedReason"])
	require.Equal(t, "Ana", state["coveredBy"])
	require.Equal(t, false, state["canSubscribe"])
}

func TestAPI_ErrorsOfTheServiceMapToTheirStatuses(t *testing.T) {
	// Not configured: 503.
	a := newAPI(t, payments.Config{Driver: payments.DriverMercadoPago, PriceMXN: 499}, nil)
	id := newAccount(t, a.pool, "Ana", account.PlanFree)
	code, body, _ := a.do(t, http.MethodPost, "/accounts/"+id.String()+"/subscription", "", nil)
	require.Equal(t, http.StatusServiceUnavailable, code)
	require.Equal(t, "payments_unavailable", body["error"])

	// An id that is not a UUID, and an account that does not exist: 404.
	a = newAPI(t, fakeConfig, nil)
	code, _, _ = a.do(t, http.MethodGet, "/accounts/not-a-uuid/subscription", "", nil)
	require.Equal(t, http.StatusNotFound, code)
	code, _, _ = a.do(t, http.MethodPost, "/accounts/"+uuid.NewString()+"/subscription", "", nil)
	require.Equal(t, http.StatusNotFound, code)
	code, _, _ = a.do(t, http.MethodGet, "/accounts/"+uuid.NewString()+"/subscription", "", nil)
	require.Equal(t, http.StatusNotFound, code)
	code, _, _ = a.do(t, http.MethodPost, "/accounts/"+uuid.NewString()+"/subscription/cancel", "", nil)
	require.Equal(t, http.StatusNotFound, code)
}

func TestAPI_CancelAnswersWithTheStateAndAProviderFailureWith502(t *testing.T) {
	a := newAPI(t, fakeConfig, nil)
	id := newAccount(t, a.pool, "Ana", account.PlanPaid)
	insertSub(t, a.pool, id, subOpts{status: payments.StatusActive, paidThrough: at(fixedNow.Add(24 * time.Hour))})

	code, body, _ := a.do(t, http.MethodPost, "/accounts/"+id.String()+"/subscription/cancel", "", nil)

	require.Equal(t, http.StatusOK, code)
	sub := body["subscription"].(map[string]any)
	require.Equal(t, "canceled", sub["status"])
	require.Equal(t, false, sub["renews"])

	b := newAPI(t, fakeConfig, func(f *payments.Fake) payments.Provider {
		return failingProvider{Provider: f, cancel: fmt.Errorf("boom")}
	})
	id2 := newAccount(t, b.pool, "Ana", account.PlanPaid)
	insertSub(t, b.pool, id2, subOpts{status: payments.StatusActive, paidThrough: at(fixedNow.Add(24 * time.Hour))})
	code, body, _ = b.do(t, http.MethodPost, "/accounts/"+id2.String()+"/subscription/cancel", "", nil)
	require.Equal(t, http.StatusBadGateway, code)
	require.Equal(t, "provider_error", body["error"])
}

func TestAPI_AProviderFailureWhileSubscribingIs503AndLeavesNothing(t *testing.T) {
	a := newAPI(t, fakeConfig, func(f *payments.Fake) payments.Provider {
		return failingProvider{Provider: f, create: payments.ErrTemporary}
	})
	id := newAccount(t, a.pool, "Ana", account.PlanFree)

	code, body, _ := a.do(t, http.MethodPost, "/accounts/"+id.String()+"/subscription", "", nil)

	require.Equal(t, http.StatusServiceUnavailable, code)
	require.Equal(t, "payments_unavailable", body["error"])
	_, count := a.subOf(t, id)
	require.Zero(t, count)
}

// ---- the notices

func TestAPI_AValidNoticeAppliesThePayment(t *testing.T) {
	a := newAPI(t, withSecret(), nil)
	id, pid := a.contract(t)
	_, err := a.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)

	code, raw := a.notice(t, "subscription_preapproval", pid, signed(webhookSecret, pid, "req-1", fixedNow))

	require.Equal(t, http.StatusOK, code, raw)
	status, _ := a.subOf(t, id)
	require.Equal(t, "active", status)
	plan, _ := planOf(t, a.pool, id)
	require.Equal(t, "paid", plan)
}

func TestAPI_ABadSignatureIs401AndIsNotWrittenToErrorLogs(t *testing.T) {
	a := newAPI(t, withSecret(), nil)
	id, pid := a.contract(t)
	_, err := a.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)

	cases := map[string]map[string]string{
		"no headers":      nil,
		"another secret":  signed("another", pid, "req-1", fixedNow),
		"an old notice":   signed(webhookSecret, pid, "req-1", fixedNow.Add(-10*time.Minute)),
		"another request": {"x-signature": signed(webhookSecret, pid, "req-1", fixedNow)["x-signature"], "x-request-id": "req-2"},
	}
	for name, headers := range cases {
		code, raw := a.notice(t, "subscription_preapproval", pid, headers)
		require.Equal(t, http.StatusUnauthorized, code, name)
		require.Contains(t, raw, "invalid_signature", name)
		require.NotContains(t, raw, webhookSecret, name)
	}

	status, _ := a.subOf(t, id)
	require.Equal(t, "pending", status, "nothing was applied")
	require.Empty(t, a.logs.all(), "a bad signature can be sent by anyone: it must not fill error_logs")
}

func TestAPI_WithoutASecretTheNoticeIsAcceptedAndTheProviderIsStillAsked(t *testing.T) {
	a := newAPI(t, fakeConfig, nil) // no WebhookSecret
	id, pid := a.contract(t)
	_, err := a.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)

	code, _ := a.notice(t, "subscription_preapproval", pid, nil)

	require.Equal(t, http.StatusOK, code)
	status, _ := a.subOf(t, id)
	require.Equal(t, "active", status)
}

func TestAPI_ANoticeWhoseIdAndTopicComeInTheBody(t *testing.T) {
	a := newAPI(t, fakeConfig, nil)
	id, pid := a.contract(t)
	_, err := a.fake.Approve(pid, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)

	code, _, _ := a.do(t, http.MethodPost, "/payments/webhooks/mercadopago", fmt.Sprintf(`{"type":"subscription_preapproval","data":{"id":%q}}`, pid), nil)
	require.Equal(t, http.StatusOK, code)
	status, _ := a.subOf(t, id)
	require.Equal(t, "active", status)

	// The old «topic» spelling in the query.
	id2, pid2 := a.contract(t)
	_, err = a.fake.Approve(pid2, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)
	code, _, _ = a.do(t, http.MethodPost, "/payments/webhooks/mercadopago?topic=subscription_preapproval&data.id="+pid2, "", nil)
	require.Equal(t, http.StatusOK, code)
	status, _ = a.subOf(t, id2)
	require.Equal(t, "active", status)

	// Or the topic in the body's older field.
	id3, pid3 := a.contract(t)
	_, err = a.fake.Approve(pid3, fixedNow.AddDate(1, 0, 0))
	require.NoError(t, err)
	code, _, _ = a.do(t, http.MethodPost, "/payments/webhooks/mercadopago", fmt.Sprintf(`{"topic":"subscription_preapproval","data":{"id":%q}}`, pid3), nil)
	require.Equal(t, http.StatusOK, code)
	status, _ = a.subOf(t, id3)
	require.Equal(t, "active", status)
}

func TestAPI_ANoticeWithoutAnIdOrAnUnknownTopicIsAcceptedAndIgnored(t *testing.T) {
	a := newAPI(t, fakeConfig, nil)

	code, _, _ := a.do(t, http.MethodPost, "/payments/webhooks/mercadopago", "not json", nil)
	require.Equal(t, http.StatusOK, code)
	code, _ = a.notice(t, "subscription_preapproval_plan", "x", nil)
	require.Equal(t, http.StatusOK, code)
}

func TestAPI_ATooLargeNoticeIsRefused(t *testing.T) {
	a := newAPI(t, fakeConfig, nil)

	code, _, _ := a.do(t, http.MethodPost, "/payments/webhooks/mercadopago", strings.Repeat("x", 70<<10), nil)

	require.Equal(t, http.StatusRequestEntityTooLarge, code)
}

func TestAPI_ATemporaryFailureOfTheProviderIs500SoItRetries(t *testing.T) {
	a := newAPI(t, fakeConfig, func(f *payments.Fake) payments.Provider {
		return failingProvider{Provider: f, read: payments.ErrTemporary}
	})

	code, raw := a.notice(t, "subscription_preapproval", "x", nil)

	require.Equal(t, http.StatusInternalServerError, code, raw)
	require.Contains(t, raw, "notice_not_processed")
}

func TestAPI_NothingSensitiveEverReachesErrorLogs(t *testing.T) {
	a := newAPI(t, withSecret(), func(f *payments.Fake) payments.Provider {
		return failingProvider{Provider: f, read: payments.ErrTemporary}
	})
	a.notice(t, "subscription_preapproval", "x", signed(webhookSecret, "x", "req-1", fixedNow))

	for _, entry := range a.logs.all() {
		line := fmt.Sprintf("%v %v %v", entry.Message, entry.Endpoint, entry.File)
		require.NotContains(t, line, webhookSecret)
		require.NotContains(t, line, "@")
	}
	// And what the service reported is a fixed sentence.
	require.Equal(t, []string{"verify: The payment provider could not be asked about a notice"}, a.rep.all())
}

// ---- the fake provider's helpers

func TestAPI_TheFakeHelpersMoveThePlanThroughTheSameProcessing(t *testing.T) {
	a := newAPI(t, fakeConfig, nil)
	id, pid := a.contract(t)

	code, _, _ := a.do(t, http.MethodPost, "/payments/fake/"+pid+"/approve", "", nil)
	require.Equal(t, http.StatusOK, code)
	status, _ := a.subOf(t, id)
	require.Equal(t, "active", status)

	code, _, _ = a.do(t, http.MethodPost, "/payments/fake/"+pid+"/reject", "", nil)
	require.Equal(t, http.StatusOK, code)
	status, _ = a.subOf(t, id)
	require.Equal(t, "grace", status)

	code, _, _ = a.do(t, http.MethodPost, "/payments/fake/"+pid+"/renew", "", nil)
	require.Equal(t, http.StatusOK, code)
	status, _ = a.subOf(t, id)
	require.Equal(t, "active", status)

	code, _, _ = a.do(t, http.MethodPost, "/payments/fake/"+pid+"/pause", "", nil)
	require.Equal(t, http.StatusOK, code)
	status, _ = a.subOf(t, id)
	require.Equal(t, "grace", status)

	code, _, _ = a.do(t, http.MethodPost, "/payments/fake/"+pid+"/cancel", "", nil)
	require.Equal(t, http.StatusOK, code)
	status, _ = a.subOf(t, id)
	require.Equal(t, "canceled", status)
}

func TestAPI_TheFakeHelpersRefuseUnknownThings(t *testing.T) {
	a := newAPI(t, fakeConfig, nil)
	_, pid := a.contract(t)

	code, body, _ := a.do(t, http.MethodPost, "/payments/fake/"+pid+"/explode", "", nil)
	require.Equal(t, http.StatusNotFound, code)
	require.Equal(t, "unknown_action", body["error"])
	code, body, _ = a.do(t, http.MethodPost, "/payments/fake/nope/approve", "", nil)
	require.Equal(t, http.StatusNotFound, code)
	require.Equal(t, "subscription_not_found", body["error"])
	require.True(t, a.cfg.Fake())
	_ = body
}

func TestHandler_FakeIsOnlyOnWhenItWasGivenTheFake(t *testing.T) {
	pool := testPool(t)
	w := build(t, pool, newRepo(t, pool), payments.NewFake("x"), fakeConfig)
	h := payments.NewHandler(w.svc, httpx.NewResponder(&logCapture{}), fakeConfig)

	require.False(t, h.Fake())
	require.True(t, h.WithFake(payments.NewFake("x")).Fake())
}

var _ *pgxpool.Pool
