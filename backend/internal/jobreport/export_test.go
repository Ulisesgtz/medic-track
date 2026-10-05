package jobreport

import "time"

// Test-only hooks, compiled only with the tests of this package.

// SetClock fixes the reporter's clock.
func SetClock(r *Reporter, now func() time.Time) { r.now = now }

// RunInline makes the background write run before Report returns, so a test can look at it right away.
func RunInline(r *Reporter) { r.spawn = func(f func()) { f() } }
