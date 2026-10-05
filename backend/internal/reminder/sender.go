package reminder

import (
	"context"
	"io"
	"net/http"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// SendResult is what the push service answered.
type SendResult int

const (
	// Delivered: the push service accepted the message.
	Delivered SendResult = iota
	// Gone: the subscription no longer exists (404/410) — the device must be turned off.
	Gone
	// Failed: rate limited, a server error or a network error. The device stays on; the
	// reminder is not retried (the dose was already claimed).
	Failed
)

// Sender delivers an encrypted reminder to one device.
type Sender interface {
	Send(ctx context.Context, device Device, payload []byte) (SendResult, error)
}

// ttlSeconds: a reminder the push service couldn't deliver within an hour is dropped, the same
// hour after which a dose is no longer reminded at all (research.md R8).
const ttlSeconds = 3600

// WebPushSender sends with the Web Push protocol: VAPID-signed, encrypted with RFC 8291.
type WebPushSender struct {
	config Config
	client webpush.HTTPClient
}

// sendTimeout bounds each push: a push service that never answers must not hold the tick — and with it
// every later reminder — forever.
const sendTimeout = 10 * time.Second

// NewWebPushSender creates a sender. With a nil client it uses one with sendTimeout (the library's own
// default has no timeout at all).
func NewWebPushSender(config Config, client webpush.HTTPClient) *WebPushSender {
	if client == nil {
		client = &http.Client{Timeout: sendTimeout}
	}
	return &WebPushSender{config: config, client: client}
}

// Send encrypts payload for the device and posts it to its push service.
func (s *WebPushSender) Send(ctx context.Context, device Device, payload []byte) (SendResult, error) {
	res, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: device.Endpoint,
		Keys:     webpush.Keys{P256dh: device.P256dh, Auth: device.Auth},
	}, &webpush.Options{
		HTTPClient:      s.client,
		Subscriber:      s.config.VAPIDSubject,
		VAPIDPublicKey:  s.config.VAPIDPublicKey,
		VAPIDPrivateKey: s.config.VAPIDPrivateKey,
		TTL:             ttlSeconds,
		Urgency:         webpush.UrgencyHigh,
	})
	if err != nil {
		return Failed, err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, res.Body)

	switch {
	case res.StatusCode >= 200 && res.StatusCode < 300:
		return Delivered, nil
	case res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone:
		return Gone, nil
	default:
		return Failed, nil
	}
}
