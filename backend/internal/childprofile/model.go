// Package childprofile corrects a child's own data — first name, last name, birth date and the signup's height and weight —
// (specs/064-editar-datos-hijo). Height and weight on every plan; the identity (names and birth date) only on the paid plan, so a
// free account can't "recycle" its only child as another one (the reason of FR-006a of specs/001, which this replaces). A child is
// never deleted.
package childprofile

import (
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/growth"
)

// PlanLimitChildIdentity is the reason of the plan notice when a free family tries to correct the identity of a child.
const PlanLimitChildIdentity = "child_identity"

// MaxConflictDates is how many dates of each kind a birth_date_conflict lists (the counts are always the totals).
const MaxConflictDates = 20

// Input is the whole child as the form sends it. A nil Height or Weight empties it. Measurement, when set, also writes a growth
// measurement on that date with the non-empty height and weight (the form's «Anotarlo también como medida de hoy»).
type Input struct {
	FirstName   string
	LastName    string
	BirthDate   string // YYYY-MM-DD
	Height      *float64
	Weight      *float64
	Measurement *MeasurementInput
}

// MeasurementInput is the date of the measurement the correction also writes down (the parent's phone's today).
type MeasurementInput struct {
	MeasuredOn string // YYYY-MM-DD
}

// Cleaned is an Input that passed validation: trimmed names, the parsed birth date and, when asked, the growth measurement.
type Cleaned struct {
	FirstName   string
	LastName    string
	BirthDate   time.Time
	Height      *float64
	Weight      *float64
	Measurement *growth.Cleaned
}

// current is the child as it is saved, read with its row locked.
type current struct {
	accountID uuid.UUID
	firstName string
	lastName  string
	birthDate time.Time
	height    *float64
	weight    *float64
	paid      bool
}
