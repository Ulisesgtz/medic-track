package errordigest

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// Interval is how often the process checks whether the digest is due. The check costs nothing until the scheduled time of the
// week arrives (it is a comparison of clocks), and then one claim.
const Interval = time.Minute

// Claimer is the durable record of which weeks were already sent (satisfied by *Repository, specs/039 research R2).
type Claimer interface {
	// Claim takes the week for this process: Claimed (send it), Busy (someone else is sending it) or Done (already finished).
	Claim(ctx context.Context, weekKey string, lease time.Duration) (ClaimResult, error)
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

	mu sync.Mutex
	// doneWeek is the last week this process knows to be finished, so it stops asking the database about it every minute.
	doneWeek string
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

// Tick does what is due at `now`: nothing before the scheduled time of the week; from then on, claim the week and send it, once.
// A week finished by this process, by another copy or before a restart is never sent again; a week whose scheduled time passed
// while the service was off is sent as soon as it is back, as long as it is still the same week.
func (s *Service) Tick(ctx context.Context, now time.Time) error {
	if !Due(now, s.cfg) {
		return nil
	}
	week := WeekKey(now)
	if s.isDone(week) {
		return nil
	}

	result, err := s.claims.Claim(ctx, week, LeaseDuration)
	if err != nil {
		return fmt.Errorf("claiming the week: %w", err)
	}
	switch result {
	case Done:
		s.markDone(week)
		return nil
	case Busy:
		return nil
	}

	if err := s.SendWeek(ctx, now); err != nil {
		return err
	}
	if err := s.claims.MarkSent(ctx, week); err != nil {
		return fmt.Errorf("recording the sent week: %w", err)
	}
	s.markDone(week)
	return nil
}

func (s *Service) isDone(week string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.doneWeek == week
}

func (s *Service) markDone(week string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.doneWeek = week
}

// Run checks every minute whether the digest is due, until ctx is done.
func (s *Service) Run(ctx context.Context) { s.RunEvery(ctx, Interval) }

// RunEvery is Run with its own interval (tests).
func (s *Service) RunEvery(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if err := s.Tick(ctx, time.Now()); err != nil && ctx.Err() == nil {
			log.Printf("errordigest: the weekly digest could not be sent this time")
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
