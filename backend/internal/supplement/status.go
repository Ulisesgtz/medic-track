package supplement

import "time"

// StatusAt is the one rule for a dose's state (research R5, the same idea as the medications' spec 013): taken; else
// pending before its time; else unregistered from the moment the routine's next dose arrives (`next`), or 24 h after
// when no dose follows; else due. Derived with the server's clock, never stored.
func StatusAt(scheduledAt time.Time, taken bool, next *time.Time, now time.Time) DoseStatus {
	if taken {
		return DoseTaken
	}
	if now.Before(scheduledAt) {
		return DosePending
	}
	limit := scheduledAt.Add(UnregisteredAfterNoNext)
	if next != nil {
		limit = *next
	}
	if !now.Before(limit) {
		return DoseUnregistered
	}
	return DoseDue
}
