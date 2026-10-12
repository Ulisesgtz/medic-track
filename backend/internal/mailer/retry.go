package mailer

import (
	"context"
	"time"
)

// SleepContext waits d, or returns the context's error as soon as it is done. It is the `sleep` a service passes to
// SendWithRetries; a field of that service in tests, so they don't wait.
func SleepContext(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// SendWithRetries tries the send len(waits)+1 times, each bounded by attemptTimeout, with waits[i] between the (i+1)th and the
// next. It gives up at once on a refusal that asking again can't fix (an invalid key, an unverified domain, a rejected
// address) and when the context is done, which is the caller shutting down and not a failure of the provider.
func SendWithRetries(ctx context.Context, sender Sender, m Message, waits []time.Duration, attemptTimeout time.Duration, sleep func(context.Context, time.Duration) error) error {
	attempts := len(waits) + 1
	var err error
	for attempt := 1; attempt <= attempts; attempt++ {
		attemptCtx, cancel := context.WithTimeout(ctx, attemptTimeout)
		err = sender.Send(attemptCtx, m)
		cancel()
		if err == nil {
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if !IsRetryable(err) || attempt == attempts {
			return err
		}
		if waitErr := sleep(ctx, waits[attempt-1]); waitErr != nil {
			return waitErr
		}
	}
	return err
}
