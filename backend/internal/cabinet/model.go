// Package cabinet is the family's medicine cabinet (specs/062-botiquin): the medicines a family keeps at home, shared like the
// children. It belongs to the family's owner account; who may see or change it is the family rule of access.OnAccount. The
// expiry date is only a datum the parent typed: nothing here ever says a medicine expired or can be used (Principio I).
package cabinet

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// MaxItems is how many medicines a family keeps (a storage safeguard, not a feature of a plan).
const MaxItems = 200

// Units a quantity is counted in.
var Units = []string{"box", "tablet", "bottle", "ml"}

var (
	// ErrItemNotFound: no medicine with that id in this family's cabinet.
	ErrItemNotFound = errors.New("medicine not found")
	// ErrPlanRequired: adding is the paid plan's (the family owner's plan); seeing, editing and removing never ask it.
	ErrPlanRequired = errors.New("the plan is not paid")
	// ErrLimit: the family already keeps MaxItems medicines.
	ErrLimit = errors.New("cabinet limit reached")
)

// ValidationErrors are the fields of an invalid medicine, each with a fixed Spanish message (never the value written).
type ValidationErrors []httpx.FieldError

func (v ValidationErrors) Error() string {
	fields := make([]string, 0, len(v))
	for _, e := range v {
		fields = append(fields, e.Field)
	}
	return "invalid fields: " + strings.Join(fields, ", ")
}

// Expires is the expiry date as the parent typed it: month and year, the day only if they wrote it.
type Expires struct {
	Year  int
	Month int
	Day   *int
}

// Input is a medicine as the form sends it.
type Input struct {
	Name     string
	Strength string
	Quantity int
	Unit     string
	Expires  Expires
	Note     string
}

// Item is a saved medicine. The photo itself is only read on its own (Repository.Photo).
type Item struct {
	ID        uuid.UUID
	Name      string
	Strength  string
	Quantity  int
	Unit      string
	Expires   Expires
	Note      string
	HasPhoto  bool
	CreatedBy string
	CreatedAt time.Time
	UpdatedBy *string
	UpdatedAt *time.Time
}
