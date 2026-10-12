package mailer

import (
	"os"
	"strconv"
	"strings"
)

const (
	// DefaultFrom is the sender when nothing says otherwise. Its domain has to be verified in the provider.
	DefaultFrom = "PediTrack <alertas@pedi-track.com>"
	// DriverDiscard is the MAIL_DRIVER that sends nothing and answers success: the whole flow (queue, quota, states) runs for
	// real, for the E2E suite and local development. It is never set in production.
	DriverDiscard = "discard"

	DefaultDailyCap            = 100
	DefaultInvitationCap       = 95
	DefaultWarnAt              = 80
	DefaultPerInvitationPerDay = 3
	DefaultPerFamilyPerDay     = 10
)

// Config is what sending e-mail needs from the environment (specs/040 contracts/configuration.md).
type Config struct {
	// APIKey is the provider's key. A secret: never printed, logged or put in an error.
	APIKey string
	// From is the sender of the invitations.
	From string
	// Driver is "" (the real provider) or DriverDiscard.
	Driver string
	// DailyCap is the provider's own limit for a day; the digest may use all of it. InvitationCap is the cap of the invitations
	// (the rest is kept for the digest). WarnAt is the count at which the day is reported once.
	DailyCap, InvitationCap, WarnAt int
	// PerInvitationPerDay and PerFamilyPerDay limit the e-mails asked for an invitation and for a family in a day.
	PerInvitationPerDay, PerFamilyPerDay int
}

// ConfigFromEnv reads RESEND_API_KEY, MAIL_FROM (then ERROR_DIGEST_FROM, then the default), MAIL_DRIVER, MAIL_DAILY_CAP,
// MAIL_INVITATION_CAP, MAIL_WARN_AT, INVITATION_EMAIL_PER_INVITATION_PER_DAY and INVITATION_EMAIL_PER_FAMILY_PER_DAY. An invalid
// value goes back to its default instead of stopping the service; so do the three caps together when they break
// WarnAt <= InvitationCap <= DailyCap.
func ConfigFromEnv() Config {
	cfg := Config{
		APIKey:              strings.TrimSpace(os.Getenv("RESEND_API_KEY")),
		From:                firstNonEmpty(os.Getenv("MAIL_FROM"), os.Getenv("ERROR_DIGEST_FROM"), DefaultFrom),
		DailyCap:            positiveInt(os.Getenv("MAIL_DAILY_CAP"), DefaultDailyCap),
		InvitationCap:       positiveInt(os.Getenv("MAIL_INVITATION_CAP"), DefaultInvitationCap),
		WarnAt:              positiveInt(os.Getenv("MAIL_WARN_AT"), DefaultWarnAt),
		PerInvitationPerDay: positiveInt(os.Getenv("INVITATION_EMAIL_PER_INVITATION_PER_DAY"), DefaultPerInvitationPerDay),
		PerFamilyPerDay:     positiveInt(os.Getenv("INVITATION_EMAIL_PER_FAMILY_PER_DAY"), DefaultPerFamilyPerDay),
	}
	if strings.TrimSpace(os.Getenv("MAIL_DRIVER")) == DriverDiscard {
		cfg.Driver = DriverDiscard
	}
	if !(cfg.WarnAt <= cfg.InvitationCap && cfg.InvitationCap <= cfg.DailyCap) {
		cfg.DailyCap, cfg.InvitationCap, cfg.WarnAt = DefaultDailyCap, DefaultInvitationCap, DefaultWarnAt
	}
	return cfg
}

// Available says whether e-mail can be sent: there is the provider's key, or the discard driver.
func (c Config) Available() bool { return c.APIKey != "" || c.Driver == DriverDiscard }

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v = strings.TrimSpace(v); v != "" {
			return v
		}
	}
	return ""
}

func positiveInt(v string, def int) int {
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil || n < 1 {
		return def
	}
	return n
}
