package payments

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func env(values map[string]string) func(string) string {
	return func(k string) string { return values[k] }
}

func TestConfig_DefaultsAndTrimming(t *testing.T) {
	c := configFrom(env(map[string]string{"FRONTEND_ORIGIN": " https://dev.pedi-track.com/ "}))

	require.Equal(t, DriverMercadoPago, c.Driver)
	require.Equal(t, 7, c.GraceDays)
	require.Equal(t, 499, c.PriceMXN)
	require.Equal(t, "https://dev.pedi-track.com", c.FrontendOrigin)
	require.Equal(t, "https://dev.pedi-track.com/planes/regreso", c.BackURL())
	require.False(t, c.Fake())
}

func TestConfig_InvalidNumbersGoBackToTheirDefaults(t *testing.T) {
	for _, bad := range []string{"0", "-1", "x", ""} {
		c := configFrom(env(map[string]string{"PAYMENTS_GRACE_DAYS": bad, "PAYMENTS_PRICE_MXN": bad}))
		require.Equal(t, 7, c.GraceDays, bad)
		require.Equal(t, 499, c.PriceMXN, bad)
	}
	require.Equal(t, 7, configFrom(env(map[string]string{"PAYMENTS_GRACE_DAYS": "31"})).GraceDays, "more than 30 days is not a grace period")
	c := configFrom(env(map[string]string{"PAYMENTS_GRACE_DAYS": "10", "PAYMENTS_PRICE_MXN": "599"}))
	require.Equal(t, 10, c.GraceDays)
	require.Equal(t, 599, c.PriceMXN)
}

func TestConfig_AnUnknownDriverIsMercadoPago(t *testing.T) {
	require.Equal(t, DriverMercadoPago, configFrom(env(map[string]string{"PAYMENTS_DRIVER": "paypal"})).Driver)
	require.Equal(t, DriverFake, configFrom(env(map[string]string{"PAYMENTS_DRIVER": " FAKE "})).Driver)
}

func TestConfig_AvailableNeedsWhatEachDriverNeeds(t *testing.T) {
	require.False(t, configFrom(env(nil)).Available())

	fake := configFrom(env(map[string]string{"PAYMENTS_DRIVER": "fake"}))
	require.Equal(t, []string{"FRONTEND_ORIGIN"}, fake.Missing())
	fake = configFrom(env(map[string]string{"PAYMENTS_DRIVER": "fake", "FRONTEND_ORIGIN": "http://localhost:5173"}))
	require.True(t, fake.Available())
	require.True(t, fake.Fake())
	// The fake's helper routes approve payments with no session: a deploy's address never runs them.
	deployed := configFrom(env(map[string]string{"PAYMENTS_DRIVER": "fake", "FRONTEND_ORIGIN": "https://dev.pedi-track.com"}))
	require.False(t, deployed.Available())
	require.Contains(t, deployed.Missing()[0], "localhost")

	real := configFrom(env(map[string]string{"FRONTEND_ORIGIN": "https://dev.pedi-track.com", "MERCADOPAGO_ACCESS_TOKEN": "token"}))
	require.Equal(t, []string{"PAYMENTS_WEBHOOK_URL (https)"}, real.Missing())
	real = configFrom(env(map[string]string{"FRONTEND_ORIGIN": "https://dev.pedi-track.com", "MERCADOPAGO_ACCESS_TOKEN": "token", "PAYMENTS_WEBHOOK_URL": "http://api.example.com/x"}))
	require.False(t, real.Available(), "the address of the notices must be https")
	real = configFrom(env(map[string]string{"FRONTEND_ORIGIN": "https://dev.pedi-track.com", "MERCADOPAGO_ACCESS_TOKEN": "token", "PAYMENTS_WEBHOOK_URL": "https://api.example.com/payments/webhooks/mercadopago"}))
	require.True(t, real.Available())
	real = configFrom(env(map[string]string{"FRONTEND_ORIGIN": "https://dev.pedi-track.com", "PAYMENTS_WEBHOOK_URL": "https://api.example.com/x"}))
	require.Equal(t, []string{"MERCADOPAGO_ACCESS_TOKEN"}, real.Missing())
}

func TestConfig_MissingNeverPrintsAValue(t *testing.T) {
	c := configFrom(env(map[string]string{"MERCADOPAGO_ACCESS_TOKEN": "APP_USR-secret-value", "MERCADOPAGO_WEBHOOK_SECRET": "very-secret"}))

	for _, m := range c.Missing() {
		require.NotContains(t, m, "secret")
		require.NotContains(t, m, "APP_USR")
	}
}

func TestConfig_TheTestPayerEmailIsReadAndTrimmed(t *testing.T) {
	c := configFrom(env(map[string]string{"MERCADOPAGO_TEST_PAYER_EMAIL": "  test_user_1@testuser.com "}))

	require.Equal(t, "test_user_1@testuser.com", c.TestPayerEmail)
	require.Empty(t, configFrom(env(map[string]string{})).TestPayerEmail)
}
