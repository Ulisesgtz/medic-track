package family

import (
	"context"
	"time"
)

// FailTokens makes the service's token generator fail, as a broken random source would.
func (s *Service) FailTokens(err error) {
	s.newToken = func() (string, []byte, error) { return "", nil, err }
}

// Deliver runs one job as a worker would.
func (d *EmailDispatcher) Deliver(ctx context.Context, job EmailJob) { d.deliver(ctx, job) }

// Fast makes the dispatcher not wait between tries and sweep at the given interval.
func (d *EmailDispatcher) Fast(sweepEvery time.Duration) {
	d.sleep = func(context.Context, time.Duration) error { return nil }
	d.sweepEvery = sweepEvery
}

// Take removes the next queued job, if there is one (a dispatcher that was never started).
func (d *EmailDispatcher) Take() (EmailJob, bool) {
	select {
	case job := <-d.queue:
		return job, true
	default:
		return EmailJob{}, false
	}
}

// QueueSize is how many jobs fit in the queue.
const QueueSize = emailQueueSize
