// Package errordigest sends, once a week, one e-mail that summarizes what error_logs recorded in the last 7 days
// (specs/039-digest-semanal-errores). It is for the team that runs the service, never for the parents, and it runs inside the
// API process like the retention job (specs/021) and the reminders ticker (specs/011).
//
// Nothing that identifies a person leaves the service: the e-mail carries the fixed messages error_logs already stores,
// route names, statuses and counts — accounts only as a number (constitution, Principio II).
package errordigest

import (
	"os"
	"strconv"
	"strings"
)

const (
	// DefaultTo is who receives the digest when nothing says otherwise: the support address, which Cloudflare Email Routing
	// forwards to a mailbox of the team.
	DefaultTo = "soporte@pedi-track.com"
	// DefaultFrom is the sender. Its domain has to be verified in the provider.
	DefaultFrom = "PediTrack <alertas@pedi-track.com>"
	// DefaultWeekday is the day it is sent: ISO, 1 = Monday … 7 = Sunday.
	DefaultWeekday = 1
	// DefaultHour is the hour it is sent, Mexico City time.
	DefaultHour = 8
)

// Config is what the digest needs from the environment.
type Config struct {
	// APIKey is the provider's key. A secret: never printed, logged or put in an error.
	APIKey string
	// To and From are the recipient and the sender. Not secrets, but not logged either (specs/039 FR-013).
	To   string
	From string
	// Weekday is ISO (1 = Monday … 7 = Sunday) and Hour is 0–23, in Mexico City time.
	Weekday int
	Hour    int
	// EnvLabel names the environment in the subject ("DEV"); empty leaves it out.
	EnvLabel string
}

// ConfigFromEnv reads RESEND_API_KEY, ERROR_DIGEST_TO, ERROR_DIGEST_FROM, ERROR_DIGEST_WEEKDAY, ERROR_DIGEST_HOUR and
// APP_ENV_LABEL. Everything but the key has a default; an invalid day or hour goes back to its default instead of stopping
// the service.
func ConfigFromEnv() Config {
	return Config{
		APIKey:   strings.TrimSpace(os.Getenv("RESEND_API_KEY")),
		To:       valueOr(os.Getenv("ERROR_DIGEST_TO"), DefaultTo),
		From:     valueOr(os.Getenv("ERROR_DIGEST_FROM"), DefaultFrom),
		Weekday:  intInRange(os.Getenv("ERROR_DIGEST_WEEKDAY"), 1, 7, DefaultWeekday),
		Hour:     intInRange(os.Getenv("ERROR_DIGEST_HOUR"), 0, 23, DefaultHour),
		EnvLabel: strings.TrimSpace(os.Getenv("APP_ENV_LABEL")),
	}
}

// Available says whether the digest can run: it needs the provider's key and somewhere to send it from and to. Without the key
// the API still runs, the digest just doesn't (the same as the reminders without their keys).
func (c Config) Available() bool {
	return c.APIKey != "" && c.To != "" && c.From != ""
}

// UnavailableReason is the one sentence the console says at start-up when the digest can't run. It names the variable that is
// missing and never a value.
func (c Config) UnavailableReason() string {
	if c.APIKey == "" {
		return "error digest unavailable: RESEND_API_KEY is not set"
	}
	return "error digest unavailable: ERROR_DIGEST_TO and ERROR_DIGEST_FROM must not be empty"
}

func valueOr(v, def string) string {
	if v = strings.TrimSpace(v); v != "" {
		return v
	}
	return def
}

func intInRange(v string, min, max, def int) int {
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil || n < min || n > max {
		return def
	}
	return n
}
