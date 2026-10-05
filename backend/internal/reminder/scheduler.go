package reminder

import (
	"context"
	"log"
	"time"
)

// TickInterval: how often the due doses are looked up. 30 s leaves room for SC-001 (95% of the
// reminders within 2 minutes of the dose).
const TickInterval = 30 * time.Second

// Ticker is what Run drives (the Service; a fake in tests).
type Ticker interface {
	Tick(ctx context.Context) (int, error)
}

// Run ticks right away and then every interval until ctx is done. It must run in the always-on
// API process: reminders only go out while it runs (research.md R5).
func Run(ctx context.Context, t Ticker, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if _, err := t.Tick(ctx); err != nil && ctx.Err() == nil {
			log.Printf("reminder: tick failed: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// RunScheduler is Run with this service and the production interval, only if reminders are
// available — the wiring cmd/api calls.
func (s *Service) RunScheduler(ctx context.Context) {
	if !s.Available() {
		return
	}
	Run(ctx, s, TickInterval)
}
