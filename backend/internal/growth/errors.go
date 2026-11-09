package growth

import (
	"errors"
	"strings"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

var (
	// ErrNotFound is a measurement that doesn't exist or belongs to another child.
	ErrNotFound = errors.New("measurement not found")
	// ErrChildNotFound is a child that doesn't exist.
	ErrChildNotFound = errors.New("child not found")
	// ErrLimit is a child that already keeps MaxPerChild measurements.
	ErrLimit = errors.New("the child reached its limit of measurements")
	// ErrPlanRequired is the chart asked by a family without the paid plan.
	ErrPlanRequired = errors.New("the growth chart needs the paid plan")
)

// ValidationErrors are the invalid fields of an input, with fixed messages that never repeat what was written.
type ValidationErrors []httpx.FieldError

func (v ValidationErrors) Error() string {
	fields := make([]string, 0, len(v))
	for _, e := range v {
		fields = append(fields, e.Field)
	}
	return "invalid fields: " + strings.Join(fields, ", ")
}
