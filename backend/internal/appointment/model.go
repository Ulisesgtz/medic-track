// Package appointment is the «próxima cita» of a consultation (specs/033-recordatorios-suplementos-citas, part 2): the date the
// pediatrician gave to come back, the notices before it, and its state. An appointment is not medical record: it is created,
// edited and marked without touching the consultation, and it is never deleted (a canceled one stays in the history).
package appointment

import (
	"time"

	"github.com/google/uuid"
)

// Status is where an appointment is. `scheduled`, `done` and `canceled` are stored; `unmarked` («Pasó sin marcar») is derived:
// a scheduled appointment whose local day already ended.
type Status string

const (
	StatusScheduled Status = "scheduled"
	StatusDone      Status = "done"
	StatusCanceled  Status = "canceled"
	StatusUnmarked  Status = "unmarked"
)

// NoticeKind is how a notice is placed: some time before the appointment, or at a fixed local hour some days before.
type NoticeKind string

const (
	KindBefore NoticeKind = "before"
	KindAtTime NoticeKind = "at_time"
)

const (
	// MaxNotices is the most notices one appointment can have.
	MaxNotices = 5
	// MaxLeadMinutes is the longest «tiempo antes» (30 days).
	MaxLeadMinutes = 43200
	// MaxDaysBefore is the most days before for a fixed hour.
	MaxDaysBefore = 30
	MaxNoteLength = 500
)

// DefaultNotices are the notices a new appointment gets when the request doesn't say: one day before and two hours before.
func DefaultNotices() []NoticeInput {
	day, hours := 24*60, 2*60
	return []NoticeInput{{Kind: KindBefore, LeadMinutes: &day}, {Kind: KindBefore, LeadMinutes: &hours}}
}

// NoticeInput is a notice as the form sends it.
type NoticeInput struct {
	Kind        NoticeKind `json:"kind"`
	LeadMinutes *int       `json:"leadMinutes"`
	DaysBefore  *int       `json:"daysBefore"`
	AtTime      *string    `json:"atTime"`
}

// Input is an appointment as the form sends it (create and edit send the whole thing). `Notices` nil means «the defaults»; an
// empty list is respected.
type Input struct {
	StartsAt         time.Time      `json:"startsAt"`
	UtcOffsetMinutes int            `json:"utcOffsetMinutes"`
	Note             string         `json:"note"`
	Notices          *[]NoticeInput `json:"notices"`
}

// Notice is a stored notice with the instant it fires.
type Notice struct {
	ID          uuid.UUID
	Kind        NoticeKind
	LeadMinutes int
	DaysBefore  int
	AtTime      string // "HH:MM"
	FireAt      time.Time
	CreatedAt   time.Time
}

// Appointment is a stored appointment with its consultation's doctor and date, for showing.
type Appointment struct {
	ID               uuid.UUID
	ConsultationID   uuid.UUID
	ChildID          uuid.UUID
	AccountID        uuid.UUID
	DoctorName       string
	ConsultDate      string // "YYYY-MM-DD"
	StartsAt         time.Time
	UtcOffsetMinutes int
	Note             string
	Status           Status // the stored status
	// Derived is the status the parent sees: Status, or «unmarked» when a scheduled one's day already ended; filled by the service.
	Derived   Status
	StatusBy  string // first name of who changed the status
	StatusAt  *time.Time
	CreatedBy string
	Notices   []Notice
	// PaidPlan is the owner account's plan (the plan is the server's).
	PaidPlan bool
	// MyReminders: the session has not turned this appointment's reminders off; filled by the service.
	MyReminders bool
}
