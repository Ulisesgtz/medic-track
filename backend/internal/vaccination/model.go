// Package vaccination is the child's vaccination card (specs/046-cartilla-vacunacion): the doses a parent records by hand and the
// photos of the paper card. The app registers what the parent captured and never interprets it (Principio I): it does not say what
// is due, late or complete. Free text (a name of the parent's own, the lot, the place, the notes) travels only in JSON bodies,
// never in an address, a message or error_logs.
package vaccination

import (
	"time"

	"github.com/google/uuid"
)

// Input is what a parent sends to record or correct a dose. Exactly one of VaccineCode (a vaccine of the catalog) and CustomName
// (the parent's own words) is given.
type Input struct {
	VaccineCode string
	CustomName  string
	AppliedOn   string // YYYY-MM-DD
	DoseNumber  *int
	Lot         string
	Place       string
	Notes       string
	// AllowDuplicate confirms recording a dose that matches one already there (same vaccine, dose and date).
	AllowDuplicate bool
}

// Cleaned is an Input that passed validation: trimmed, parsed, with the empty optionals as nil.
type Cleaned struct {
	VaccineCode *string
	CustomName  *string
	AppliedOn   time.Time
	DoseNumber  *int
	Lot         *string
	Place       *string
	Notes       *string
}

// Vaccination is one dose applied to a child, as it is read back. Name is the catalog's name (even if the vaccine was retired since)
// or the parent's own words.
type Vaccination struct {
	ID              uuid.UUID
	ChildID         uuid.UUID
	VaccineCode     *string
	Name            string
	CustomName      *string
	AppliedOn       string // YYYY-MM-DD
	DoseNumber      *int
	Lot             *string
	Place           *string
	Notes           *string
	CreatedByName   string
	CreatedAt       time.Time
	CorrectedByName *string
	CorrectedAt     *time.Time
}
