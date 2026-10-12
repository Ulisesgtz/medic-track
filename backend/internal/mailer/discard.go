package mailer

import (
	"context"
	"net/http"
)

// DiscardSender sends nothing and answers success (MAIL_DRIVER=discard).
type DiscardSender struct{}

// Send does nothing.
func (DiscardSender) Send(context.Context, Message) error { return nil }

// NewSender is the sender the configuration asks for: the discard one, Resend when there is a key, and nil when there is neither.
func NewSender(cfg Config, client *http.Client) Sender {
	switch {
	case cfg.Driver == DriverDiscard:
		return DiscardSender{}
	case cfg.APIKey != "":
		return NewResendSender(cfg.APIKey, client, "")
	default:
		return nil
	}
}
