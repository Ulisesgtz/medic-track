package payments

import "time"

// Service is filled in by the next phase of specs/045.
type Service struct{ now func() time.Time }
