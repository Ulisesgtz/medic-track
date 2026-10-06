package consultation

import "time"

// Test-only hooks, compiled only with the tests of this package.

// FoldSpanish and SQLFold expose the two halves of the history search's text folding, so a test can check they agree
// (specs/031).
var (
	FoldSpanish = foldSpanish
	SQLFold     = sqlFold
)

// SetNow fixes the repository's clock, to read a treatment as it will be days from now.
func SetNow(r *Repository, now func() time.Time) { r.now = now }
