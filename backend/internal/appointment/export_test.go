package appointment

import "time"

// SetNow fixes the repository's clock.
func SetNow(r *Repository, now func() time.Time) { r.now = now }

// SetServiceNow fixes the service's clock.
func SetServiceNow(s *Service, now func() time.Time) { s.now = now }
