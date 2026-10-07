package supplement

import (
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

// Input is a routine as the form sends it (create and edit send the whole routine). Pointers say "not sent".
type Input struct {
	Name             string   `json:"name"`
	Note             string   `json:"note"`
	Period           string   `json:"period"`
	Times            []string `json:"times"`
	Weekdays         []int    `json:"weekdays"`
	IntervalHours    *int     `json:"intervalHours"`
	FirstDate        string   `json:"firstDate"`
	FirstTime        *string  `json:"firstTime"`
	EndDate          *string  `json:"endDate"`
	UtcOffsetMinutes int      `json:"utcOffsetMinutes"`
}

// ValidateInput checks every rule of data-model.md and returns the routine's schedule normalized: name trimmed, times
// as sorted "HH:MM", weekdays sorted, and only the fields of its period (the others are dropped). `now` is the
// server's clock: the first day can't be before yesterday in the routine's own zone.
func ValidateInput(in Input, now time.Time) (Routine, ValidationErrors) {
	var errs ValidationErrors
	add := func(field, msg string) { errs = append(errs, ValidationError{Field: field, Message: msg}) }

	r := Routine{Name: strings.TrimSpace(in.Name), Note: strings.TrimSpace(in.Note), Period: Period(in.Period), UtcOffsetMinutes: in.UtcOffsetMinutes}
	if n := utf8.RuneCountInString(r.Name); n == 0 {
		add("name", "name is required")
	} else if n > MaxNameLength {
		add("name", fmt.Sprintf("name must be at most %d characters", MaxNameLength))
	}
	if utf8.RuneCountInString(r.Note) > MaxNoteLength {
		add("note", fmt.Sprintf("note must be at most %d characters", MaxNoteLength))
	}
	if in.UtcOffsetMinutes < -840 || in.UtcOffsetMinutes > 840 {
		add("utcOffsetMinutes", "must be between -840 and 840")
	}

	switch r.Period {
	case PeriodDaily, PeriodWeekdays:
		r.Times = validTimes(in.Times, add)
		if r.Period == PeriodWeekdays {
			r.Weekdays = validWeekdays(in.Weekdays, add)
		}
	case PeriodInterval:
		if in.IntervalHours == nil || *in.IntervalHours < 1 || *in.IntervalHours > 24 {
			add("intervalHours", "must be between 1 and 24")
		} else {
			r.IntervalHours = *in.IntervalHours
		}
		if in.FirstTime == nil {
			add("firstTime", "first time is required")
		} else if h, m, ok := parseClock(*in.FirstTime); !ok {
			add("firstTime", "must be HH:MM")
		} else {
			r.FirstTime = fmt.Sprintf("%02d:%02d", h, m)
		}
	default:
		add("period", "must be daily, weekdays or interval")
	}

	loc := localZone(in.UtcOffsetMinutes)
	first, err := time.ParseInLocation(dateLayout, in.FirstDate, loc)
	switch {
	case err != nil:
		add("firstDate", "must be a date (YYYY-MM-DD)")
	default:
		local := now.In(loc)
		yesterday := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, -1)
		if first.Before(yesterday) {
			add("firstDate", "can't be before yesterday")
		}
		r.FirstDate = in.FirstDate
	}
	if in.EndDate != nil && *in.EndDate != "" {
		end, endErr := time.ParseInLocation(dateLayout, *in.EndDate, loc)
		switch {
		case endErr != nil:
			add("endDate", "must be a date (YYYY-MM-DD)")
		case err == nil && end.Before(first):
			add("endDate", "can't be before the first day")
		default:
			r.EndDate = *in.EndDate
		}
	}
	return r, errs
}

// validTimes checks 1–6 distinct "HH:MM" and returns them sorted.
func validTimes(in []string, add func(field, msg string)) []string {
	if len(in) < 1 || len(in) > MaxTimes {
		add("times", fmt.Sprintf("must have between 1 and %d times", MaxTimes))
		return nil
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, t := range in {
		h, m, ok := parseClock(t)
		if !ok {
			add("times", "each time must be HH:MM")
			return nil
		}
		norm := fmt.Sprintf("%02d:%02d", h, m)
		if seen[norm] {
			add("times", "times can't repeat")
			return nil
		}
		seen[norm] = true
		out = append(out, norm)
	}
	sort.Strings(out)
	return out
}

// validWeekdays checks 1–7 distinct days in 0–6 (0 = Monday) and returns them sorted.
func validWeekdays(in []int, add func(field, msg string)) []int {
	if len(in) < 1 || len(in) > 7 {
		add("weekdays", "must have between 1 and 7 days")
		return nil
	}
	seen := map[int]bool{}
	out := make([]int, 0, len(in))
	for _, d := range in {
		if d < 0 || d > 6 || seen[d] {
			add("weekdays", "days must be distinct values from 0 (Monday) to 6 (Sunday)")
			return nil
		}
		seen[d] = true
		out = append(out, d)
	}
	sort.Ints(out)
	return out
}
