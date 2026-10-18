package payments

import "time"

// SetNow fixes the repository clock in tests.
func SetNow(r *Repository, now func() time.Time) { r.now = now }

// SetServiceNow fixes the service clock in tests.
func SetServiceNow(s *Service, now func() time.Time) { s.now = now }
