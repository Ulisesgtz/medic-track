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
)

// StatusAt returns a dose's status at `now`. A medication's doses are generated exactly frequencyHours apart
// (generateDoseSchedule), so the next dose always comes at scheduledAt + frequencyHours — also for the last one,
// where that is when the next would have come (specs/013 research R1).
func StatusAt(scheduledAt time.Time, taken bool, frequencyHours int, now time.Time) DoseStatus {
	switch {
	case taken:
		return DoseStatusTaken
	case now.Before(scheduledAt):
		return DoseStatusPending
	case !now.Before(scheduledAt.Add(time.Duration(frequencyHours) * time.Hour)):
		return DoseStatusUnregistered
	default:
		return DoseStatusDue
	}
}
