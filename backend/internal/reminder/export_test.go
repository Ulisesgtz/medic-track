package reminder

import (
	"encoding/base64"
	"time"
)

// Test-only hooks, compiled only with the tests of this package.

// AllowLocalEndpoints lets a test register an http://127.0.0.1 push service (an httptest server).
func AllowLocalEndpoints(s *Service) { s.allowLocalEndpoints = true }

// SetNow fixes the service's clock.
func SetNow(s *Service, now func() time.Time) { s.now = now }

// BuildPayload exposes buildPayload.
var BuildPayload = buildPayload

// SignRawForTests signs an arbitrary body with the real signing scheme, to test content checks.
func SignRawForTests(secret, raw string) string {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(raw))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac(secret, encoded))
}

// SenderClient exposes the HTTP client a WebPushSender posts with.
func SenderClient(s *WebPushSender) any { return s.client }
