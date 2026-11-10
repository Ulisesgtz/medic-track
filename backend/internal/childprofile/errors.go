package childprofile

import (
	"errors"
	"strings"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

var (
	// ErrNotFound is a child that doesn't exist.
	ErrNotFound = errors.New("child not found")
	// ErrPlanRequired is a change of the identity (names or birth date) of a child whose family doesn't have the paid plan.
	ErrPlanRequired = errors.New("correcting the identity of a child needs the paid plan")
)

// ValidationErrors are the invalid fields of an Input, with fixed messages that never repeat what was written.
type ValidationErrors []httpx.FieldError

func (v ValidationErrors) Error() string {
	fields := make([]string, 0, len(v))
	for _, e := range v {
		fields = append(fields, e.Field)
	}
	return "invalid fields: " + strings.Join(fields, ", ")
}

// ConflictError is a new birth date after measurements or vaccinations already written down: nothing is saved and the parent is
// told how many and on which dates (YYYY-MM-DD, ascending, at most MaxConflictDates of each), to correct them first.
type ConflictError struct {
	MeasurementCount int
	Measurements     []string
	VaccinationCount int
	Vaccinations     []string
}

func (c *ConflictError) Error() string { return "the new birth date is after records already written down" }
