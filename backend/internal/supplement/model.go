// Package supplement is the parents' supplement routines (specs/033-recordatorios-suplementos-citas, part 1): a routine
// the parent writes, its doses (markable, with an author), and the plan/cap rules. A routine is not medical record, so —
// unlike consultations — it can be edited, paused and finished.
package supplement

import (
	"time"

	"github.com/google/uuid"
)

// Kind says what a routine is (specs/035): a supplement is taken at fixed hours; an activity is done every so often
// between two hours of the day. It is fixed when the routine is created.
type Kind string

const (
	KindSupplement Kind = "supplement"
	KindActivity   Kind = "activity"
)

// Period is how a routine repeats: a supplement is daily or on some weekdays (at fixed times); an activity is a
// window of the day (from WindowStart to WindowEnd every IntervalMinutes), on all days or on some weekdays.
type Period string

const (
	PeriodDaily    Period = "daily"
	PeriodWeekdays Period = "weekdays"
	PeriodWindow   Period = "window"
)

// Status is the life of a routine: active -> paused -> active; active|paused -> ended (terminal).
type Status string

const (
	StatusActive Status = "active"
	StatusPaused Status = "paused"
	StatusEnded  Status = "ended"
)

// DoseStatus is derived, never stored (research R5).
type DoseStatus string

const (
	DosePending      DoseStatus = "pending"
	DoseDue          DoseStatus = "due"
	DoseTaken        DoseStatus = "taken"
	DoseUnregistered DoseStatus = "unregistered"
)

const (
	// MaxActivePerChild is the cap of active routines of one kind of one child (paused ones don't count); the same for a
	// person's own.
	MaxActivePerChild = 10
	// MinIntervalMinutes and MaxIntervalMinutes bound «cada N» of an activity: 5 to 59 minutes or 1 to 23 hours.
	MinIntervalMinutes = 5
	MaxIntervalMinutes = 23 * 60
	// MaxTimes is the most times a day a daily/weekdays routine can have.
	MaxTimes = 6
	// HorizonDays is how far ahead doses are generated; RefillBelowDays is when the planner extends them (research R2).
	HorizonDays     = 14
	RefillBelowDays = 7
	// MaxNameLength and MaxNoteLength are in characters.
	MaxNameLength = 100
	MaxNoteLength = 500
	// UnregisteredAfterNoNext is how long an unmarked dose waits to read «sin registrar» when no dose follows it.
	UnregisteredAfterNoNext = 24 * time.Hour
)

// Routine is the schedule part of a routine plus its identity. Times and dates are local to UtcOffsetMinutes (research R3).
type Routine struct {
	ID               uuid.UUID
	AccountID        uuid.UUID
	ChildID          *uuid.UUID
	Kind             Kind
	Name             string
	Note             string
	Period           Period
	Times            []string // "HH:MM", supplements
	Weekdays         []int    // 0 = Monday … 6 = Sunday; supplements on weekdays, activities on some days (empty = all)
	WindowStart      string   // "HH:MM", activities
	WindowEnd        string   // "HH:MM", activities, after WindowStart
	IntervalMinutes  int      // activities: 5–1380 (legacy rows up to 1440)
	FirstDate        string   // "YYYY-MM-DD"
	EndDate          string   // "YYYY-MM-DD", empty = no end
	UtcOffsetMinutes int
	Status           Status
}

// Dose is one scheduled intake of a routine.
type Dose struct {
	ID          uuid.UUID
	RoutineID   uuid.UUID
	ScheduledAt time.Time
	Taken       bool
	Status      DoseStatus
	TakenBy     *TakenBy
}

// TakenBy says who marked a dose.
type TakenBy struct {
	AccountID uuid.UUID
	Name      string
	At        time.Time
}

// Actor is who changes a dose mark: the session's own account and whether it can do everything (the owner or a Tutor)
// or only see and mark.
type Actor struct {
	AccountID uuid.UUID
	Full      bool
}

// Progress counts a routine's doses: marked, already come (elapsed) and, when it has an end, all up to it.
type Progress struct {
	Taken   int
	Elapsed int
	Total   int
}

// RoutineView is a routine as it is read: with who created it, its progress and the doses of the asked window.
type RoutineView struct {
	Routine
	CreatedBy string
	CreatedAt time.Time
	PausedAt  *time.Time
	EndedAt   *time.Time
	Progress  Progress
	Doses     []Dose
	// NextDose is the next dose ahead of the window, only for an active routine with no dose in it ("hoy no le toca").
	NextDose *Dose
	// PaidPlan is the owner account's plan: whether creating, editing and resuming are open (the plan is the server's).
	PaidPlan bool
	// MyReminders: the session has not turned this routine's reminders off («Tus avisos»); filled by the service.
	MyReminders bool
}

// RoutineList is a child's routines with the numbers the section needs.
type RoutineList struct {
	Routines    []RoutineView
	ActiveCount int
	PaidPlan    bool
}
