package consultation

import "time"

// Test-only hooks, compiled only with the tests of this package.

// SetNow fixes the repository's clock, to read a treatment as it will be days from now.
func SetNow(r *Repository, now func() time.Time) { r.now = now }
