// Package errorlog persists a record of every error response the backend
// sends to a client, so production issues are visible without an app-store
// review channel to surface them (specs/002-registro-log-errores).
package errorlog

import (
	"time"

	"github.com/google/uuid"
)

// Entry represents a single logged error. It is append-only: this scope
// exposes no update/delete operation (FR-007/FR-008).
type Entry struct {
	ID         uuid.UUID
	Message    string
	HTTPStatus *int
	Endpoint   string
	File       string
	Line       int
	AccountID  *uuid.UUID
	CreatedAt  time.Time
}
