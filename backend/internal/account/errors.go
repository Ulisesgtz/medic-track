package account

import "errors"

// Domain errors returned by AccountService, mapped to HTTP status codes by Handler.
var (
	// ErrEmailAlreadyExists is returned when the requested email is already
	// in use by another account (FR-002).
	ErrEmailAlreadyExists = errors.New("email is already in use")

	// ErrFreemiumChildLimitExceeded is returned when a free-plan account
	// attempts to persist more than one child (FR-007).
	ErrFreemiumChildLimitExceeded = errors.New("the free plan includes only one child per account")

	// ErrInvalidNameFormat is returned when the database's name format/length
	// CHECK constraint rejects a row that passed service-layer validation —
	// defense in depth against drift between the two (FR-001a).
	ErrInvalidNameFormat = errors.New("name contains invalid characters or exceeds the maximum length")

	// ErrAccountNotFound is returned when no account exists for a given id —
	// e.g. an accountId saved in the browser that no longer corresponds to
	// any account server-side (specs/003-home-listado-hijos FR-002).
	ErrAccountNotFound = errors.New("account not found")
)

// ValidationError describes a single field-level validation failure.
type ValidationError struct {
	Field   string
	Message string
}

// ValidationErrors is a collection of field-level validation failures,
// returned together so the client can show all of them at once (FR-001, FR-004, FR-005).
type ValidationErrors []ValidationError

func (v ValidationErrors) Error() string {
	if len(v) == 0 {
		return "validation error"
	}
	return v[0].Field + ": " + v[0].Message
}

func (v ValidationErrors) HasErrors() bool {
	return len(v) > 0
}
