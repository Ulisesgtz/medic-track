package payments

import (
	"net/url"
	"os"
	"strconv"
	"strings"
)

// Driver names for PAYMENTS_DRIVER.
const (
	DriverMercadoPago = "mercadopago"
	DriverFake        = "fake"
)

const (
	defaultGraceDays = 7
	defaultPriceMXN  = 499
)

// Config is the payments configuration (contracts/configuration.md). The access token and the webhook secret are never printed,
// logged or returned: only Missing() says what is absent, by name.
type Config struct {
	Driver         string
	AccessToken    string
	WebhookSecret  string
	WebhookURL     string
	FrontendOrigin string
	GraceDays      int
	PriceMXN       int
}

// ConfigFromEnv reads the variables. An invalid number goes back to its default.
func ConfigFromEnv() Config {
	return configFrom(os.Getenv)
}

func configFrom(get func(string) string) Config {
	c := Config{
		Driver:         strings.ToLower(strings.TrimSpace(get("PAYMENTS_DRIVER"))),
		AccessToken:    strings.TrimSpace(get("MERCADOPAGO_ACCESS_TOKEN")),
		WebhookSecret:  strings.TrimSpace(get("MERCADOPAGO_WEBHOOK_SECRET")),
		WebhookURL:     strings.TrimSpace(get("PAYMENTS_WEBHOOK_URL")),
		FrontendOrigin: strings.TrimRight(strings.TrimSpace(get("FRONTEND_ORIGIN")), "/"),
		GraceDays:      defaultGraceDays,
		PriceMXN:       defaultPriceMXN,
	}
	if c.Driver != DriverFake {
		c.Driver = DriverMercadoPago
	}
	if n, err := strconv.Atoi(strings.TrimSpace(get("PAYMENTS_GRACE_DAYS"))); err == nil && n >= 1 && n <= 30 {
		c.GraceDays = n
	}
	if n, err := strconv.Atoi(strings.TrimSpace(get("PAYMENTS_PRICE_MXN"))); err == nil && n > 0 {
		c.PriceMXN = n
	}
	return c
}

// Fake reports whether the in-memory provider is chosen (tests and development only).
func (c Config) Fake() bool { return c.Driver == DriverFake }

// Available reports whether the charge can run: the fake needs only the frontend's address; Mercado Pago needs the token, the
// public address of the notices (https) and the frontend's address (for the way back).
func (c Config) Available() bool { return len(c.Missing()) == 0 }

// Missing names what keeps the charge from running (empty when it can run). Names only, never values.
func (c Config) Missing() []string {
	var missing []string
	if c.FrontendOrigin == "" {
		missing = append(missing, "FRONTEND_ORIGIN")
	}
	if c.Fake() {
		// The fake's helper routes are public and approve payments: they only run against a local frontend, never in a deploy.
		if u, err := url.Parse(c.FrontendOrigin); c.FrontendOrigin != "" && (err != nil || u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") {
			missing = append(missing, "PAYMENTS_DRIVER=fake (only with a localhost FRONTEND_ORIGIN)")
		}
		return missing
	}
	if c.AccessToken == "" {
		missing = append(missing, "MERCADOPAGO_ACCESS_TOKEN")
	}
	if u, err := url.Parse(c.WebhookURL); err != nil || u.Scheme != "https" || u.Host == "" {
		missing = append(missing, "PAYMENTS_WEBHOOK_URL (https)")
	}
	return missing
}

// BackURL is where the provider sends the person after paying: the app's own return page.
func (c Config) BackURL() string { return c.FrontendOrigin + "/planes/regreso" }
