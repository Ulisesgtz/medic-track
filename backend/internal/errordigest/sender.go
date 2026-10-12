package errordigest

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// DefaultBaseURL is Resend's API.
const DefaultBaseURL = "https://api.resend.com"

// sendTimeout bounds one request: a provider that never answers must not hold the digest — or the shutdown — for long.
const sendTimeout = 15 * time.Second

// Message is one e-mail: plain text only (specs/039 research R5).
type Message struct {
	From    string
	To      string
	Subject string
	Text    string
	// IdempotencyKey makes a retry of the same digest not send a second e-mail: the provider answers the same thing for the
	// same key within 24 hours. It is "error-digest-<week>".
	IdempotencyKey string
}

// Sender hands an e-mail to the provider. It is an interface so the service can be tested with a fake one, and so another
// provider — or the family invitations by e-mail, a later task — can reuse the rest.
type Sender interface {
	Send(ctx context.Context, m Message) error
}

// SendError is a failure of the provider. It says only whether trying again can help and the HTTP status (0 when the request
// never got an answer): never the answer's body, the address or the key, which could be repeated there.
type SendError struct {
	Retryable bool
	Status    int
}

func (e *SendError) Error() string {
	return fmt.Sprintf("e-mail provider failure (retryable: %t, status: %d)", e.Retryable, e.Status)
}

// IsRetryable says whether it makes sense to try the send again. A failure that isn't a SendError is treated as retryable: it
// is something unexpected, and the attempts are bounded anyway.
func IsRetryable(err error) bool {
	var sendErr *SendError
	if errors.As(err, &sendErr) {
		return sendErr.Retryable
	}
	return true
}

// ResendSender sends through Resend's HTTP API (specs/039 contracts/resend-request.md), without an SDK.
type ResendSender struct {
	apiKey  string
	baseURL string
	client  *http.Client
}

// NewResendSender creates a sender. With a nil client it uses one with a timeout that does not follow redirects: an API that
// takes an e-mail never needs to send the request somewhere else (the same rule as the Web Push client, specs/037).
func NewResendSender(apiKey string, client *http.Client, baseURL string) *ResendSender {
	if client == nil {
		client = &http.Client{
			Timeout:       sendTimeout,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		}
	}
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	return &ResendSender{apiKey: apiKey, baseURL: baseURL, client: client}
}

// Send posts the e-mail. A 2xx is success, and so is a 409 (the idempotency key was already used: see below); a network error, a timeout, 408, 429 and any 5xx are retryable; any other answer is
// not (an invalid key, an unverified domain or a rejected address won't get better by asking again).
func (s *ResendSender) Send(ctx context.Context, m Message) error {
	payload, err := json.Marshal(map[string]any{
		"from":    m.From,
		"to":      []string{m.To},
		"subject": m.Subject,
		"text":    m.Text,
	})
	if err != nil {
		return &SendError{Retryable: false}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/emails", bytes.NewReader(payload))
	if err != nil {
		return &SendError{Retryable: false}
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	if m.IdempotencyKey != "" {
		req.Header.Set("Idempotency-Key", m.IdempotencyKey)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		// The error of the HTTP client is dropped on purpose: it carries the request's address, and nothing about this
		// failure is useful beyond "it didn't get through". A cancelled context is the caller's own doing, not a failure.
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return &SendError{Retryable: true}
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16)) // read and forget: the body is never kept or shown

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return nil
	case resp.StatusCode == http.StatusConflict:
		// Resend answers 409 when the idempotency key was already used: either that request is still being processed or it was
		// accepted earlier with a different body (a retaken week is rebuilt a few minutes later, so its text differs). In both
		// cases the e-mail of this week is already out or on its way, so this is not a failure and must not mark the week 'failed'.
		return nil
	case resp.StatusCode == http.StatusRequestTimeout || resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return &SendError{Retryable: true, Status: resp.StatusCode}
	default:
		return &SendError{Retryable: false, Status: resp.StatusCode}
	}
}
