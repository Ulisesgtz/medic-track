// Package reminder sends a Web Push reminder at the scheduled time of every dose that
// hasn't been marked as taken, to every device on which the tutor turned reminders on
// (specs/011-recordatorios-push). It only repeats the schedule the tutor registered —
// never an indication, a dose or a medical judgement (constitution, Principio I).
package reminder

import (
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// DetailMode is what a reminder shows: the medication and child, or a generic text.
type DetailMode string

const (
	DetailDetailed DetailMode = "detailed"
	DetailGeneric  DetailMode = "generic"
)

// Source tells which kind of dose a reminder is for.
type Source string

const (
	SourceMedication  Source = "medication"
	SourceSupplement  Source = "supplement"
	SourceActivity    Source = "activity"
	SourceAppointment Source = "appointment"
)

// Device is a browser or installed PWA on which a tutor turned reminders on.
type Device struct {
	ID          uuid.UUID
	AccountID   uuid.UUID
	Endpoint    string
	P256dh      string
	Auth        string
	Active      bool
	ActivatedAt time.Time
}

// DueDose is a dose claimed for the reminder of ONE person (specs/032: a dose is reminded to each person with access and
// an active device, once each), with what that reminder needs to say.
type DueDose struct {
	DoseID uuid.UUID
	// Source is where the dose comes from: SourceMedication (a consultation's), SourceSupplement (a routine's, specs/033) or
	// SourceActivity (an activity's, specs/035: it is reminded like a supplement but its button says «Realizado»).
	Source Source
	// ConsultationID is set for a medication's dose, RoutineID for a supplement's.
	ConsultationID uuid.UUID
	RoutineID      uuid.UUID
	// For an appointment's notice (specs/033, part 2): the appointment, when it starts, how long before it this notice goes off,
	// its doctor and its note (the last two only reach a "detailed" reminder). `ScheduledAt` is then the instant the notice fires.
	AppointmentID uuid.UUID
	StartsAt      time.Time
	LeadMinutes   int
	DoctorName    string
	Note          string
	// AccountID is the person this reminder is for (the account whose devices receive it), not the child's owner.
	AccountID      uuid.UUID
	ScheduledAt    time.Time
	MedicationName string
	ChildFirstName string
	// Detail is that person's own choice; nil while they haven't chosen (treated as generic,
	// the most private option).
	Detail *DetailMode
}

// Payload is the JSON encrypted and pushed to a device; the service worker turns it into the
// notification. In generic mode Medication and Child are not sent at all, not even encrypted.
type Payload struct {
	Kind   DetailMode `json:"kind"`
	DoseID string     `json:"doseId,omitempty"`
	// ConsultationID is only for a medication's dose; RoutineID and Source "supplement" only for a supplement's (specs/033).
	ConsultationID string `json:"consultationId,omitempty"`
	RoutineID      string `json:"routineId,omitempty"`
	Source         string `json:"source,omitempty"`
	ScheduledAt    string `json:"scheduledAt"`
	Medication     string `json:"medication,omitempty"`
	Child          string `json:"child,omitempty"`
	ActionToken    string `json:"actionToken,omitempty"`
	// An appointment's reminder (specs/033, part 2): `scheduledAt` is when the appointment starts and `leadMinutes` how long before it this goes off.
	AppointmentID string `json:"appointmentId,omitempty"`
	LeadMinutes   *int   `json:"leadMinutes,omitempty"`
	Doctor        string `json:"doctor,omitempty"`
	Note          string `json:"note,omitempty"`
}

var (
	// ErrRemindersUnavailable: the backend has no VAPID keys, so no device can be subscribed.
	ErrRemindersUnavailable = errors.New("reminders are not available on this server")
	// ErrInvalidActionToken covers every reason a "Tomada" token is refused: bad signature,
	// expired, device inactive or not the dose's account. One error on purpose, so a caller
	// learns nothing about which one it was.
	ErrInvalidActionToken = errors.New("invalid action token")
)

// FieldError is a request field that failed validation (the API-wide shape, httpx).
type FieldError = httpx.FieldError

// ValidationErrors is every field that failed, returned together.
type ValidationErrors []FieldError

func (v ValidationErrors) Error() string {
	if len(v) == 0 {
		return "validation error"
	}
	return v[0].Field + ": " + v[0].Message
}
