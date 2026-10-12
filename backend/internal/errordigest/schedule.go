package errordigest

import (
	"fmt"
	"time"
	// The zone database is embedded in the binary: the distroless image and a Windows machine don't have one, and without it
	// LoadLocation("America/Mexico_City") would fail (specs/039 research R3).
	_ "time/tzdata"
)

// zoneName is the time zone the digest keeps: the schedule, the week and the hours in the e-mail are Mexico City's. It is
// not configurable (YAGNI): the team works in it.
const zoneName = "America/Mexico_City"

var location = loadLocation(zoneName)

// loadLocation loads the zone, and if it somehow can't, uses a fixed UTC−6: Mexico City has had no daylight saving time since 2022.
func loadLocation(name string) *time.Location {
	if loc, err := time.LoadLocation(name); err == nil {
		return loc
	}
	return time.FixedZone("CST", -6*60*60)
}

// Location is the zone the digest works in.
func Location() *time.Location { return location }

// WeekKey identifies the week of `now` by its ISO week in Mexico City time: "2026-W42". It is the key of error_digest_runs: one
// digest per key, whatever restarts or copies of the API there are.
func WeekKey(now time.Time) string {
	year, week := now.In(location).ISOWeek()
	return fmt.Sprintf("%04d-W%02d", year, week)
}

// Scheduled is the instant the digest of the ISO week of `now` is due: `weekday` (ISO, 1 = Monday … 7 = Sunday) at `hour`
// sharp, Mexico City time.
func Scheduled(now time.Time, weekday, hour int) time.Time {
	local := now.In(location)
	isoWeekday := int(local.Weekday())
	if isoWeekday == 0 { // Go counts Sunday as 0
		isoWeekday = 7
	}
	monday := time.Date(local.Year(), local.Month(), local.Day()-(isoWeekday-1), hour, 0, 0, 0, location)
	return monday.AddDate(0, 0, weekday-1)
}

// Due says whether the digest of the current week is due: its scheduled time has come. Because the week is the one `now` is
// in, a service that was off at the scheduled time and starts later in the same week still finds it due (recovery), and one
// that starts the next week finds that week's schedule instead — a week that was missed is never recovered.
func Due(now time.Time, cfg Config) bool {
	return !now.Before(Scheduled(now, cfg.Weekday, cfg.Hour))
}

// Window is the period the digest covers: the 7 days before `now` — [since, until) — and the 7 before those, which start at
// previousSince, for the comparison.
func Window(now time.Time) (since, until, previousSince time.Time) {
	return now.Add(-7 * 24 * time.Hour), now, now.Add(-14 * 24 * time.Hour)
}
