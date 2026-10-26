package account

import "time"

// ShortenClerkRateLimitWaits makes the waits after a Clerk 429 short for a test and returns how to put them back.
func ShortenClerkRateLimitWaits() (restore func()) {
	saved := clerkRateLimitWaits
	clerkRateLimitWaits = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	return func() { clerkRateLimitWaits = saved }
}
