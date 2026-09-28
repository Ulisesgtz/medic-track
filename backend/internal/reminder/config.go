package reminder

import (
	"os"
	"strings"
)

// Config is what sending reminders needs. Without it the rest of the API still works: the
// reminders are just "not available" (research.md R3).
type Config struct {
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	// VAPIDSubject is a contact e-mail (or an https URL) the push services can reach.
	VAPIDSubject string
	// ActionSecret signs the "Tomada" tokens (research.md R7).
	ActionSecret string
}

// Available reports whether every value is set.
func (c Config) Available() bool {
	return c.VAPIDPublicKey != "" && c.VAPIDPrivateKey != "" && c.VAPIDSubject != "" && c.ActionSecret != ""
}

// ConfigFromEnv reads VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT and
// REMINDER_ACTION_SECRET. A "mailto:" prefix on the subject is dropped: the push library adds
// it itself, and "mailto:mailto:…" would be rejected by the push services.
func ConfigFromEnv() Config {
	return Config{
		VAPIDPublicKey:  strings.TrimSpace(os.Getenv("VAPID_PUBLIC_KEY")),
		VAPIDPrivateKey: strings.TrimSpace(os.Getenv("VAPID_PRIVATE_KEY")),
		VAPIDSubject:    strings.TrimPrefix(strings.TrimSpace(os.Getenv("VAPID_SUBJECT")), "mailto:"),
		ActionSecret:    strings.TrimSpace(os.Getenv("REMINDER_ACTION_SECRET")),
	}
}
