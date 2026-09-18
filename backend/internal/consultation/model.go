// Package consultation implements the Consultation/Medication/Dose domain:
// registering a medical visit with its prescribed medications and marking
// each expected dose as taken.
package consultation

import (
	"time"

	"github.com/google/uuid"
)

// Consultation represents a single medical visit for a child. Immutable
// once created (FR-014) — there is no update/delete endpoint in this scope.
type Consultation struct {
	ID          uuid.UUID
	ChildID     uuid.UUID
	DoctorName  string
	ConsultDate time.Time
	Photo       []byte
	Symptoms    string
	CreatedAt   time.Time
	Medications []Medication
}

// Medication represents one medication prescribed within a Consultation.
type Medication struct {
	ID             uuid.UUID
	ConsultationID uuid.UUID
	Name           string
	FrequencyHours int
	DurationDays   int
	StartTime      *string // "HH:MM", nil when no start time was given (FR-010)
	CreatedAt      time.Time
	Doses          []Dose
}

// Dose represents one expected occurrence of a Medication, generated only
// when the Medication has a StartTime (FR-009/FR-010). Taken is the only
// mutable field in the whole domain (FR-016).
type Dose struct {
	ID           uuid.UUID
	MedicationID uuid.UUID
	ScheduledAt  time.Time
	Taken        bool
	CreatedAt    time.Time
}
