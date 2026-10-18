package payments

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
)

const testToken = "APP_USR-test-token-123"

// fakeMP is a Mercado Pago that records what it received and answers what the test says.
type fakeMP struct {
	t        *testing.T
	mu       sync.Mutex
	requests []recorded
	answer   func(r *http.Request, body string) (int, string)
}

type recorded struct {
	method, path, auth, body string
}

func newFakeMP(t *testing.T, answer func(r *http.Request, body string) (int, string)) (*MercadoPago, *fakeMP) {
	t.Helper()
	f := &fakeMP{t: t, answer: answer}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		f.mu.Lock()
		f.requests = append(f.requests, recorded{r.Method, r.URL.Path, r.Header.Get("Authorization"), string(raw)})
		f.mu.Unlock()
		status, body := f.answer(r, string(raw))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return NewMercadoPago(testToken, srv.URL), f
}

func TestMercadoPago_CreateSubscriptionSendsExactlyWhatIsNeededAndNothingAboutChildren(t *testing.T) {
	mp, f := newFakeMP(t, func(r *http.Request, body string) (int, string) {
		return 201, `{"id":"2c93808","init_point":"https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=2c93808","status":"pending"}`
	})

	created, err := mp.CreateSubscription(context.Background(), CreateRequest{
		Reason: "PediTrack: plan completo (anual)", ExternalReference: "acc-1", PayerEmail: "ana@example.com", AmountMXN: 499, FrequencyMonths: 12,
		BackURL: "https://dev.pedi-track.com/planes/regreso", NotificationURL: "https://api-dev.pedi-track.com/payments/webhooks/mercadopago",
	})

	require.NoError(t, err)
	require.Equal(t, "2c93808", created.ID)
	require.Equal(t, "https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=2c93808", created.CheckoutURL)
	require.Len(t, f.requests, 1)
	got := f.requests[0]
	require.Equal(t, "POST", got.method)
	require.Equal(t, "/preapproval", got.path)
	require.Equal(t, "Bearer "+testToken, got.auth)
	var sent map[string]any
	require.NoError(t, json.Unmarshal([]byte(got.body), &sent))
	require.Equal(t, "pending", sent["status"])
	require.Equal(t, "acc-1", sent["external_reference"])
	require.Equal(t, "ana@example.com", sent["payer_email"])
	require.Equal(t, "https://dev.pedi-track.com/planes/regreso", sent["back_url"])
	recurring := sent["auto_recurring"].(map[string]any)
	require.EqualValues(t, 12, recurring["frequency"])
	require.Equal(t, "months", recurring["frequency_type"])
	require.EqualValues(t, 499, recurring["transaction_amount"])
	require.Equal(t, "MXN", recurring["currency_id"])
	// Nothing but those fields: no child, no health data, no card.
	require.ElementsMatch(t, []string{"reason", "external_reference", "payer_email", "back_url", "notification_url", "status", "auto_recurring"}, keys(sent))
	require.NotContains(t, got.body, "card")
}

func keys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func TestMercadoPago_CreateSubscriptionNeedsTheIdAndThePaymentPage(t *testing.T) {
	mp, _ := newFakeMP(t, func(*http.Request, string) (int, string) { return 201, `{"id":"1"}` })

	_, err := mp.CreateSubscription(context.Background(), CreateRequest{})

	require.Error(t, err)
}

func TestMercadoPago_GetSubscriptionReadsItsRealState(t *testing.T) {
	mp, f := newFakeMP(t, func(r *http.Request, _ string) (int, string) {
		return 200, `{"id":"2c93808","status":"authorized","next_payment_date":"2027-10-15T08:00:00.000-04:00","last_modified":"2026-10-15T08:00:00.000-04:00","external_reference":"acc-1"}`
	})

	got, err := mp.GetSubscription(context.Background(), "2c93808")

	require.NoError(t, err)
	require.Equal(t, "authorized", got.Status)
	require.Equal(t, "acc-1", got.ExternalReference)
	require.NotNil(t, got.NextPaymentDate)
	require.Equal(t, 2027, got.NextPaymentDate.Year())
	require.False(t, got.LastModified.IsZero())
	require.Equal(t, "/preapproval/2c93808", f.requests[0].path)
	require.Equal(t, "GET", f.requests[0].method)
}

func TestMercadoPago_AuthorizedPaymentUsesThePaymentsStatusWhenThereIsOne(t *testing.T) {
	mp, _ := newFakeMP(t, func(r *http.Request, _ string) (int, string) {
		return 200, `{"id":77,"preapproval_id":"2c93808","status":"processed","last_modified":"2026-10-15T08:00:00.000-04:00","payment":{"id":5,"status":"rejected"}}`
	})
	got, err := mp.GetAuthorizedPayment(context.Background(), "77")
	require.NoError(t, err)
	require.Equal(t, "rejected", got.Status)
	require.Equal(t, "2c93808", got.SubscriptionID)
	require.Equal(t, "77", got.ID)

	mp, _ = newFakeMP(t, func(r *http.Request, _ string) (int, string) {
		return 200, `{"id":78,"preapproval_id":"2c93808","status":"scheduled"}`
	})
	got, err = mp.GetAuthorizedPayment(context.Background(), "78")
	require.NoError(t, err)
	require.Equal(t, "scheduled", got.Status)
}

func TestMercadoPago_GetPayment(t *testing.T) {
	mp, f := newFakeMP(t, func(r *http.Request, _ string) (int, string) {
		return 200, `{"id":123,"status":"approved","date_last_updated":"2026-10-15T08:00:00.000-04:00","metadata":{"preapproval_id":"2c93808"}}`
	})

	got, err := mp.GetPayment(context.Background(), "123")

	require.NoError(t, err)
	require.Equal(t, "approved", got.Status)
	require.Equal(t, "2c93808", got.SubscriptionID)
	require.Equal(t, "/v1/payments/123", f.requests[0].path)
}

func TestMercadoPago_CancelSubscription(t *testing.T) {
	mp, f := newFakeMP(t, func(*http.Request, string) (int, string) { return 200, `{"id":"2c93808","status":"cancelled"}` })

	require.NoError(t, mp.CancelSubscription(context.Background(), "2c93808"))

	require.Equal(t, "PUT", f.requests[0].method)
	require.Equal(t, "/preapproval/2c93808", f.requests[0].path)
	require.JSONEq(t, `{"status":"cancelled"}`, f.requests[0].body)
}

func TestMercadoPago_ErrorsNeverCarryTheTokenTheEmailOrTheBody(t *testing.T) {
	cases := []struct {
		status int
		check  func(t *testing.T, err error)
	}{
		{404, func(t *testing.T, err error) { require.ErrorIs(t, err, ErrRemoteNotFound) }},
		{429, func(t *testing.T, err error) { require.ErrorIs(t, err, ErrTemporary) }},
		{500, func(t *testing.T, err error) { require.ErrorIs(t, err, ErrTemporary) }},
		{503, func(t *testing.T, err error) { require.ErrorIs(t, err, ErrTemporary) }},
		{400, func(t *testing.T, err error) {
			require.Error(t, err)
			require.NotErrorIs(t, err, ErrTemporary)
			require.NotErrorIs(t, err, ErrRemoteNotFound)
		}},
		{401, func(t *testing.T, err error) { require.NotErrorIs(t, err, ErrTemporary) }},
	}
	for _, c := range cases {
		mp, _ := newFakeMP(t, func(*http.Request, string) (int, string) {
			return c.status, `{"message":"bad token ` + testToken + ` for ana@example.com"}`
		})
		_, err := mp.CreateSubscription(context.Background(), CreateRequest{PayerEmail: "ana@example.com"})
		c.check(t, err)
		require.NotContains(t, err.Error(), testToken)
		require.NotContains(t, err.Error(), "ana@example.com")
		require.NotContains(t, err.Error(), "bad token")
	}
}

func TestMercadoPago_ANetworkFailureIsTemporaryAndLeaksNothing(t *testing.T) {
	mp := NewMercadoPago(testToken, "http://127.0.0.1:1")

	_, err := mp.GetSubscription(context.Background(), "x")

	require.ErrorIs(t, err, ErrTemporary)
	require.NotContains(t, err.Error(), testToken)
}

func TestMercadoPago_DoesNotFollowRedirects(t *testing.T) {
	var hits int
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits++ }))
	defer other.Close()
	mp, _ := newFakeMP(t, func(*http.Request, string) (int, string) { return 302, "" })
	// A 302 with no Location is a refusal; with a Location it still must not be followed.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL, http.StatusFound)
	}))
	defer srv.Close()
	mp.base = srv.URL

	_, err := mp.GetSubscription(context.Background(), "x")

	require.Error(t, err)
	require.Zero(t, hits, "the redirect was not followed")
}

func TestMercadoPago_AnUnreadableAnswerIsAnError(t *testing.T) {
	mp, _ := newFakeMP(t, func(*http.Request, string) (int, string) { return 200, "not json" })

	_, err := mp.GetSubscription(context.Background(), "x")

	require.EqualError(t, err, "the provider's answer could not be read")
}

func TestMercadoPago_NameAndDefaultBase(t *testing.T) {
	mp := NewMercadoPago("t", "")

	require.Equal(t, "mercadopago", mp.Name())
	require.True(t, strings.HasPrefix(mp.base, "https://"))
}

func TestParseTime(t *testing.T) {
	require.Nil(t, parseTime(""))
	require.Nil(t, parseTime("garbage"))
	require.NotNil(t, parseTime("2026-10-15T08:00:00Z"))
	require.NotNil(t, parseTime("2026-10-15T08:00:00.000-04:00"))
	require.NotNil(t, parseTime("2026-10-15T08:00:00"))
	require.True(t, derefTime(nil).IsZero())
}

func TestMercadoPago_ReadingAPaymentThatDoesNotExist(t *testing.T) {
	mp, _ := newFakeMP(t, func(*http.Request, string) (int, string) { return 404, `{}` })

	_, err := mp.GetAuthorizedPayment(context.Background(), "1")
	require.ErrorIs(t, err, ErrRemoteNotFound)
	_, err = mp.GetPayment(context.Background(), "1")
	require.ErrorIs(t, err, ErrRemoteNotFound)
	_, err = mp.GetSubscription(context.Background(), "1")
	require.ErrorIs(t, err, ErrRemoteNotFound)
	require.ErrorIs(t, mp.CancelSubscription(context.Background(), "1"), ErrRemoteNotFound)
}

func TestMercadoPago_APathWithSpecialCharactersIsEscaped(t *testing.T) {
	mp, f := newFakeMP(t, func(*http.Request, string) (int, string) { return 200, `{"id":"x"}` })

	_, err := mp.GetSubscription(context.Background(), "a/b?c")

	require.NoError(t, err)
	require.Equal(t, "/preapproval/a/b?c", f.requests[0].path, "the server decodes the escaped path; the slash cannot leave the resource")
}

func TestMercadoPago_ARefusalKeepsTheStatusTheSlugTheCodesAndACleanedMessageNotTheDescriptions(t *testing.T) {
	mp, _ := newFakeMP(t, func(r *http.Request, body string) (int, string) {
		return 400, `{"message":"Invalid value for payer_email ana@example.com","error":"bad_request","status":400,"cause":[{"code":"2001","description":"payer ana@example.com is not a test user"},{"code":7,"description":"x"},{"code":"has spaces and @","description":"y"}]}`
	})

	_, err := mp.CreateSubscription(context.Background(), CreateRequest{PayerEmail: "ana@example.com", AmountMXN: 499, FrequencyMonths: 12})

	var refused *RefusedError
	require.ErrorAs(t, err, &refused)
	require.Equal(t, 400, refused.Status)
	require.Equal(t, "bad_request", refused.Slug)
	require.Equal(t, []string{"2001", "7"}, refused.Codes, "a cause code with odd characters is dropped")
	require.Equal(t, `status 400 bad_request, causes 2001,7: "Invalid value for payer_email [correo]"`, refused.Detail(), "the message is kept with the e-mail replaced")
	require.NotContains(t, err.Error()+refused.Detail(), "ana@example.com")
}

func TestMercadoPago_ARefusalWithAnUnreadableBodyStillSaysTheStatus(t *testing.T) {
	mp, _ := newFakeMP(t, func(r *http.Request, body string) (int, string) { return 401, `<html>nope</html>` })

	_, err := mp.CreateSubscription(context.Background(), CreateRequest{})

	var refused *RefusedError
	require.ErrorAs(t, err, &refused)
	require.Equal(t, "status 401", refused.Detail())
}

func TestMercadoPago_AMessageOnlyBodyAndALongMessageAreKeptCleanedAndCut(t *testing.T) {
	long := strings.Repeat("palabra ", 40)
	mp, _ := newFakeMP(t, func(r *http.Request, body string) (int, string) {
		return 400, `{"message":"Cannot operate between different countries ` + long + `","status":400}`
	})

	_, err := mp.CreateSubscription(context.Background(), CreateRequest{})

	var refused *RefusedError
	require.ErrorAs(t, err, &refused)
	require.Equal(t, "", refused.Slug)
	require.Empty(t, refused.Codes)
	require.True(t, strings.HasPrefix(refused.Message, "Cannot operate between different countries"))
	require.LessOrEqual(t, len([]rune(refused.Message)), 120)
	require.True(t, strings.HasSuffix(refused.Message, "…"))
}
