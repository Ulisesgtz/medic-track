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
	// ScheduleLocation is the time zone in which each medication's StartTime
	// ("08:00") is read when generating doses — the parent's, so the dose
	// instants are real. Nil means ConsultDate's own location (UTC).
	ScheduleLocation *time.Location
	// MedicationCount is filled only when listing (GetByChild), where the
	// medications themselves aren't loaded.
	MedicationCount int
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

// DoseOverview is one dose of any of a child's consultations, joined with its
// medication's name — what the child's "tomas de hoy" list shows.
type DoseOverview struct {
	ID             uuid.UUID
	ConsultationID uuid.UUID
	MedicationName string
	ScheduledAt    time.Time
	Taken          bool
}

// ActiveTreatment is the medication whose last scheduled dose is furthest in
// the future. It is derived only from the dose schedule (no clinical
// judgement, Principio I): OtherCount is how many more medications still
// have doses ahead.
type ActiveTreatment struct {
	MedicationName string
	EndsAt         time.Time
	OtherCount     int
}

// ChildOverview backs the child detail summary: the doses inside a time
// window (the parent's "today") and the treatment still running, if any.
type ChildOverview struct {
	Doses           []DoseOverview
	ActiveTreatment *ActiveTreatment
}
