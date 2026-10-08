package supplement

import (
	"sort"
	"strconv"
	"strings"
	"time"
)

const dateLayout = "2006-01-02"

// parseClock reads "HH:MM" (or "HH:MM:SS", as the database prints a TIME) into hour and minute.
func parseClock(s string) (int, int, bool) {
	parts := strings.Split(s, ":")
	if len(parts) < 2 || len(parts) > 3 || len(parts[0]) != 2 || len(parts[1]) != 2 {
		return 0, 0, false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, 0, false
	}
	return h, m, true
}

// localZone is the fixed zone a routine's times are read in (research R3).
func localZone(offsetMinutes int) *time.Location {
	return time.FixedZone("", offsetMinutes*60)
}

// Generate returns the instants of the routine's doses in [from, to), in order and without repeats: the routine's
// times (a supplement's fixed hours, or an activity's window every N minutes) read in its local zone, never before its
// first day and never after its end day (included, up to the end of that local day). Pure: no clock, no database.
func Generate(r Routine, from, to time.Time) []time.Time {
	loc := localZone(r.UtcOffsetMinutes)
	first, err := time.ParseInLocation(dateLayout, r.FirstDate, loc)
	if err != nil {
		return nil
	}
	lo, hi := from, to
	if r.EndDate != "" {
		end, err := time.ParseInLocation(dateLayout, r.EndDate, loc)
		if err != nil {
			return nil
		}
		if limit := end.AddDate(0, 0, 1); limit.Before(hi) {
			hi = limit
		}
	}
	if first.After(lo) {
		lo = first
	}
	if !lo.Before(hi) {
		return nil
	}
	if r.Period == PeriodWindow {
		return generateWindow(r, loc, lo, hi)
	}
	return generateDays(r, loc, lo, hi)
}

func generateDays(r Routine, loc *time.Location, lo, hi time.Time) []time.Time {
	type clock struct{ h, m int }
	clocks := make([]clock, 0, len(r.Times))
	for _, t := range r.Times {
		if h, m, ok := parseClock(t); ok {
			clocks = append(clocks, clock{h, m})
		}
	}
	sort.Slice(clocks, func(i, j int) bool {
		return clocks[i].h*60+clocks[i].m < clocks[j].h*60+clocks[j].m
	})
	onDay := map[int]bool{}
	for _, d := range r.Weekdays {
		onDay[d] = true
	}
	var out []time.Time
	start := lo.In(loc)
	day := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, loc)
	for ; day.Before(hi); day = day.AddDate(0, 0, 1) {
		if r.Period == PeriodWeekdays && !onDay[(int(day.Weekday())+6)%7] {
			continue
		}
		for _, c := range clocks {
			t := time.Date(day.Year(), day.Month(), day.Day(), c.h, c.m, 0, 0, loc)
			if !t.Before(lo) && t.Before(hi) {
				out = append(out, t)
			}
		}
	}
	return out
}

// generateWindow lists, for each chosen local day (all days when none is chosen), the instants from WindowStart to
// WindowEnd (both included) every IntervalMinutes: the last one is the last that fits.
func generateWindow(r Routine, loc *time.Location, lo, hi time.Time) []time.Time {
	sh, sm, ok1 := parseClock(r.WindowStart)
	eh, em, ok2 := parseClock(r.WindowEnd)
	if !ok1 || !ok2 || r.IntervalMinutes < 1 {
		return nil
	}
	startMin, endMin := sh*60+sm, eh*60+em
	onDay := map[int]bool{}
	for _, d := range r.Weekdays {
		onDay[d] = true
	}
	var out []time.Time
	start := lo.In(loc)
	day := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, loc)
	for ; day.Before(hi); day = day.AddDate(0, 0, 1) {
		if len(onDay) > 0 && !onDay[(int(day.Weekday())+6)%7] {
			continue
		}
		for m := startMin; m <= endMin; m += r.IntervalMinutes {
			t := time.Date(day.Year(), day.Month(), day.Day(), m/60, m%60, 0, 0, loc)
			if !t.Before(lo) && t.Before(hi) {
				out = append(out, t)
			}
		}
	}
	return out
}
