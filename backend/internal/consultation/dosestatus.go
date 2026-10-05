package consultation

import "time"

// DoseStatus is what a dose looks like to the parent (specs/013). It is derived, never stored: the only thing the
// parent changes is whether the dose is marked (Dose.Taken).
type DoseStatus string

const (
	// DoseStatusPending: its time hasn't come yet.
	DoseStatusPending DoseStatus = "pending"
	// DoseStatusDue: its time came, it isn't marked and the next dose of its medication hasn't come yet ("por marcar").
	DoseStatusDue DoseStatus = "due"
	// DoseStatusTaken: the parent marked it.
	DoseStatusTaken DoseStatus = "taken"
	// DoseStatusUnregistered: not marked and the next dose of its medication already came ("sin registrar"). It only
	// says nobody marked it — never that it wasn't given (Principio I).
	DoseStatusUnregistered DoseStatus = "unregistered"
	// DoseStatusCanceled: not marked, and the parent ended the treatment before its time came (specs/016).
	DoseStatusCanceled DoseStatus = "canceled"
)

// StatusAt returns a dose's status at `now`. A medication's doses are generated exactly frequencyHours apart
// (generateDoseSchedule), so the next dose always comes at scheduledAt + frequencyHours — also for the last one,
// where that is when the next would have come (specs/013 research R1). A treatment ended early (endedAt, specs/016)
// cancels the unmarked doses whose time was after that moment; the ones that had already come keep their status.
func StatusAt(scheduledAt time.Time, taken bool, frequencyHours int, endedAt *time.Time, now time.Time) DoseStatus {
	switch {
	case taken:
		return DoseStatusTaken
	case endedAt != nil && scheduledAt.After(*endedAt):
		return DoseStatusCanceled
	case now.Before(scheduledAt):
		return DoseStatusPending
	case !now.Before(scheduledAt.Add(time.Duration(frequencyHours) * time.Hour)):
		return DoseStatusUnregistered
	default:
		return DoseStatusDue
	}
}
