// Package historyexport gives the history's PDF (specs/050) everything it shows, in one read-only answer: the child, the
// consultations of the period with the record of their doses, the treatment still running, the next appointments and the whole
// vaccination card. The document itself is made on the phone; nothing here stores it. The paid plan is decided first.
package historyexport

import (
	"time"

	"github.com/google/uuid"
)

// Period kinds.
const (
	PeriodAll     = "all"
	PeriodRange   = "range"
	PeriodFilters = "filters"
)

// Request is what the parent chose in the panel. It only travels in the request body (the filters can be health information).
type Request struct {
	PeriodKind string
	From, To   *time.Time
	Filters    Filters
	// Sections chosen; at least one of Consultations and Vaccinations.
	Consultations, Vaccinations, Photos bool
}

// Filters are the history's criteria (specs/031), for «Usar los filtros del historial».
type Filters struct {
	Q, Doctor, Medication, Kind string
	From, To                    *time.Time
	SymptomCodes                []string
}

// Child is who the document is about. Height and weight come without the date they were written down (it isn't kept).
type Child struct {
	FirstName, LastName string
	BirthDate           time.Time
	Height, Weight      *float64
}

// ActiveTreatment is the running medication whose last dose is furthest ahead, with the doctor of its consultation.
type ActiveTreatment struct {
	MedicationName string
	FrequencyHours int
	Since          time.Time
	DoctorName     string
}

// Appointment is a scheduled appointment that hasn't come yet.
type Appointment struct {
	ScheduledAt time.Time
	DoctorName  string
	Location    string
}

// Mark is the last time a dose of a medication was marked, and by whom (first name).
type Mark struct {
	At time.Time
	By string
}

// DoseCounts is the record of a medication's doses — only counts, never a judgement (Principio I). Canceled doses (a treatment
// ended early) are not part of Total.
type DoseCounts struct {
	Taken, Unregistered, Due, Pending, Total int
	// Sequence is each counted dose's status in schedule order, one letter per dose (SequenceTaken…), so the document draws
	// the record as it happened and not grouped by status.
	Sequence string
}

// The letters of DoseCounts.Sequence.
const (
	SequenceTaken        = 't'
	SequenceUnregistered = 'u'
	SequenceDue          = 'd'
	SequencePending      = 'p'
)

// Medication is one medication of a consultation as the document shows it.
type Medication struct {
	Name           string
	FrequencyHours int
	DurationDays   int
	StartTime      *string
	EndedAt        *time.Time
	Extensions     []Extension
	Doses          DoseCounts
	FirstDoseAt    *time.Time
	LastDoseAt     *time.Time
	LastMark       *Mark
}

// Extension is one time the treatment was extended («Se recorrió el 15 sep · +2 tomas»).
type Extension struct {
	CreatedAt  time.Time
	AddedDoses int
}

// Symptom is a marked symptom.
type Symptom struct {
	Code, Name string
}

// Consultation is one consultation of the period.
type Consultation struct {
	ID          uuid.UUID
	ConsultDate time.Time
	DoctorName  string
	RecordOnly  bool
	Notes       string
	Symptoms    []Symptom
	HasPhoto    bool
	Medications []Medication
	Appointment *Appointment
}

// Vaccination is one registered dose of the card.
type Vaccination struct {
	ID          uuid.UUID
	Name        string
	Custom      bool
	DoseNumber  *int
	AppliedOn   string
	Lot, Place  *string
	Notes       *string
	CorrectedAt *time.Time
	CorrectedBy *string
}

// ConsultationPhoto is a consultation of the period that has a prescription photo.
type ConsultationPhoto struct {
	ConsultationID uuid.UUID
	ConsultDate    time.Time
	DoctorName     string
}

// CardPhoto is a photo of the paper card.
type CardPhoto struct {
	ID        uuid.UUID
	CreatedAt time.Time
}

// Photos lists the photos to ask for one by one (nil when they weren't asked for).
type Photos struct {
	Consultations []ConsultationPhoto
	Card          []CardPhoto
}

// Document is everything the PDF shows.
type Document struct {
	Child           Child
	ActiveTreatment *ActiveTreatment
	NextAppointment *Appointment
	Consultations   []Consultation
	Vaccinations    []Vaccination
	Photos          *Photos
}
