// Package consultation implements the Consultation/Medication/Dose domain:
// registering a medical visit with its prescribed medications and marking
// each expected dose as taken.
package consultation

import (
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/catalog"
)

// Consultation represents a single medical visit for a child. Immutable
// once created (FR-014) — there is no update/delete endpoint in this scope.
type Consultation struct {
	ID          uuid.UUID
	ChildID     uuid.UUID
	DoctorName  string
	ConsultDate time.Time
	Photo       []byte
	// Notes is the parent's free text before the visit ("notas previas a la
	// consulta"); consultations saved before specs/012 keep their old
	// symptoms text here.
	Notes       string
	CreatedAt   time.Time
	Medications []Medication
	// SymptomCodes are the catalog symptoms the parent marked, only when
	// creating; a repeated code is stored once.
	SymptomCodes []string
	// Symptoms are the marked symptoms in catalog order, retired ones
	// included — filled by Create and GetByID.
	Symptoms []Symptom
	// SymptomNames are the same names, filled only when listing (GetByChild).
	SymptomNames []string
	// ScheduleLocation is the time zone in which each medication's StartTime
	// ("08:00") is read when generating doses — the parent's, so the dose
	// instants are real. Nil means ConsultDate's own location (UTC).
	ScheduleLocation *time.Location
	// RecordOnly says the consultation was saved only as a record (specs/024): its medications have no start time and no
	// doses exist. Set when creating, never changed (consultations are immutable).
	RecordOnly bool
	// MedicationCount is filled only when listing (GetByChild), where the
	// medications themselves aren't loaded.
	MedicationCount int
}

// Symptom is one catalog symptom marked on a consultation: something the
// parent observed, never a diagnosis (specs/012, Principio I). The catalog's
// own type, so both describe a symptom the same way.
type Symptom = catalog.Symptom

// Medication represents one medication prescribed within a Consultation.
type Medication struct {
	ID             uuid.UUID
	ConsultationID uuid.UUID
	Name           string
	FrequencyHours int
	DurationDays   int
	StartTime      *string // "HH:MM", nil when no start time was given (FR-010)
	// EndedAt is when the parent ended the treatment early (specs/016); nil while it runs.
	EndedAt   *time.Time
	CreatedAt time.Time
	Doses     []Dose
	// ExtendableDoses is how many unregistered doses haven't been covered by an extension yet (specs/020): what the
	// app proposes adding. 0 when the treatment was ended. Derived when read, with the server's clock.
	ExtendableDoses int
	// Extensions are the parent's decisions to add doses to the end, oldest first.
	Extensions []Extension
}

// Extension is one time the parent decided to add doses to the end of a medication (specs/020). Append-only.
type Extension struct {
	ID            uuid.UUID
	CreatedAt     time.Time
	ProposedDoses int
	AddedDoses    int
}

// Manual says the parent changed the number the app proposed.
func (e Extension) Manual() bool { return e.AddedDoses != e.ProposedDoses }

// Dose represents one expected occurrence of a Medication, generated only
// when the Medication has a StartTime (FR-009/FR-010). Taken is the only
// mutable field in the whole domain (FR-016).
type Dose struct {
	ID           uuid.UUID
	MedicationID uuid.UUID
	ScheduledAt  time.Time
	Taken        bool
	CreatedAt    time.Time
	// Status is derived when read (specs/013): pending, due, taken or unregistered.
	Status DoseStatus
	// Covered: an extension already took this unregistered dose into account (specs/020); it is not proposed again.
	Covered bool
}

// DoseOverview is one dose of any of a child's consultations, joined with its
// medication's name — what the child's "tomas de hoy" list shows.
type DoseOverview struct {
	ID             uuid.UUID
	ConsultationID uuid.UUID
	MedicationName string
	ScheduledAt    time.Time
	Taken          bool
	// Status is derived when read (specs/013).
	Status DoseStatus
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
