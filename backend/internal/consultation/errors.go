package consultation

import "errors"

// Domain errors returned by Service, mapped to HTTP status codes by Handler.
var (
	// ErrChildNotFound is returned when no child exists for a given id
	// (specs/004-detalle-consulta-hijo FR-001/FR-004).
	ErrChildNotFound = errors.New("child not found")

	// ErrConsultationNotFound is returned when no consultation exists for a
	// given id (FR-013).
	ErrConsultationNotFound = errors.New("consultation not found")

	// ErrDoseNotFound is returned when no dose exists for a given id, or it
	// doesn't belong to the given consultation (FR-011).
	ErrDoseNotFound = errors.New("dose not found")
)

// ValidationError describes a single field-level validation failure.
type ValidationError struct {
	Field   string
	Message string
}

// ValidationErrors is a collection of field-level validation failures,
// returned together so the client can show all of them at once.
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
