package errordigest

import (
	"context"
	"fmt"
	"time"
)

// Claimer is the durable record of which weeks were already sent (satisfied by *Repository, specs/039 research R2).
type Claimer interface {
	// Claim takes the week for this process; false means someone else has it or it is already done.
	Claim(ctx context.Context, weekKey string, lease time.Duration) (bool, error)
	MarkSent(ctx context.Context, weekKey string) error
	MarkFailed(ctx context.Context, weekKey string) error
}

// Service builds the weekly digest and sends it.
type Service struct {
	src           Source
	sender        Sender
	claims        Claimer
	cfg           Config
	retentionDays int
}

// NewService creates the digest service. `retentionDays` is how long error_logs keeps its entries (it decides whether the
// comparison with the previous week can be offered).
func NewService(src Source, sender Sender, claims Claimer, cfg Config, retentionDays int) *Service {
	return &Service{src: src, sender: sender, claims: claims, cfg: cfg, retentionDays: retentionDays}
}

// SendWeek builds the digest of the week that ends at `now` and hands it to the provider, once: no claim, no retries (those are
// Tick's). Its idempotency key is the week's, so asking the provider twice for the same week sends one e-mail.
func (s *Service) SendWeek(ctx context.Context, now time.Time) error {
	d, err := Build(ctx, s.src, now, s.retentionDays)
	if err != nil {
		return fmt.Errorf("building the digest: %w", err)
	}
	subject, text := Render(d, s.cfg.EnvLabel)
	return s.sender.Send(ctx, Message{
		From:           s.cfg.From,
		To:             s.cfg.To,
		Subject:        subject,
		Text:           text,
		IdempotencyKey: "error-digest-" + WeekKey(now),
	})
}
