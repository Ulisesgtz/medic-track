package appointment

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

func zone(offsetMinutes int) *time.Location { return time.FixedZone("", offsetMinutes*60) }

// FireAt is the instant a notice goes off: «tiempo antes» is the appointment's start minus that time; «a una hora fija» is
// that local hour, some days before, read in the appointment's own zone. Pure.
func FireAt(startsAt time.Time, offsetMinutes int, n NoticeInput) (time.Time, bool) {
	switch n.Kind {
	case KindBefore:
		if n.LeadMinutes == nil {
			return time.Time{}, false
		}
		return startsAt.Add(-time.Duration(*n.LeadMinutes) * time.Minute), true
	case KindAtTime:
		if n.DaysBefore == nil || n.AtTime == nil {
			return time.Time{}, false
		}
		h, m, ok := parseClock(*n.AtTime)
		if !ok {
			return time.Time{}, false
		}
		local := startsAt.In(zone(offsetMinutes))
		return time.Date(local.Year(), local.Month(), local.Day()-*n.DaysBefore, h, m, 0, 0, zone(offsetMinutes)), true
	}
	return time.Time{}, false
}

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

func plural(n int, one, many string) string {
	if n == 1 {
		return fmt.Sprintf("1 %s", one)
	}
	return fmt.Sprintf("%d %s", n, many)
}

// Label says a notice in words: «1 día antes», «2 horas antes», «30 minutos antes», «El mismo día a las 07:00», «Un día antes a las 20:00».
func Label(kind NoticeKind, leadMinutes, daysBefore int, atTime string) string {
	if kind == KindBefore {
		switch {
		case leadMinutes%1440 == 0:
			return plural(leadMinutes/1440, "día", "días") + " antes"
		case leadMinutes%60 == 0:
			return plural(leadMinutes/60, "hora", "horas") + " antes"
		}
		return plural(leadMinutes, "minuto", "minutos") + " antes"
	}
	switch daysBefore {
	case 0:
		return "El mismo día a las " + atTime
	case 1:
		return "Un día antes a las " + atTime
	}
	return fmt.Sprintf("%d días antes a las %s", daysBefore, atTime)
}

// Normalized is a validated appointment: the notices already carry the instant they fire.
type Normalized struct {
	StartsAt         time.Time
	UtcOffsetMinutes int
	Note             string
	Notices          []NoticeInput
	FireAts          []time.Time
}

// ValidateInput checks every rule of parte2/plan.md: the offset, the note, the date (its local day can't be before the
// consultation's), and the notices (at most 5, no repeats, each before the appointment). A missing `Notices` is the two
// default ones. `consultDate` is the consultation's "YYYY-MM-DD".
func ValidateInput(in Input, consultDate string) (Normalized, ValidationErrors) {
	var errs ValidationErrors
	add := func(field, msg string) { errs = append(errs, ValidationError{Field: field, Message: msg}) }

	out := Normalized{StartsAt: in.StartsAt, UtcOffsetMinutes: in.UtcOffsetMinutes, Note: strings.TrimSpace(in.Note)}
	if in.UtcOffsetMinutes < -840 || in.UtcOffsetMinutes > 840 {
		add("utcOffsetMinutes", "must be between -840 and 840")
	}
	if utf8.RuneCountInString(out.Note) > MaxNoteLength {
		add("note", fmt.Sprintf("note must be at most %d characters", MaxNoteLength))
	}
	if in.StartsAt.IsZero() {
		add("startsAt", "the date and time are required")
	} else if local := in.StartsAt.In(zone(in.UtcOffsetMinutes)).Format("2006-01-02"); local < consultDate {
		add("startsAt", "the appointment can't be before the consultation")
	}

	notices := DefaultNotices()
	if in.Notices != nil {
		notices = *in.Notices
	}
	if len(notices) > MaxNotices {
		add("notices", fmt.Sprintf("at most %d notices", MaxNotices))
		return out, errs
	}
	seen := map[string]bool{}
	for _, n := range notices {
		norm, msg := normalizeNotice(n)
		if msg != "" {
			add("notices", msg)
			continue
		}
		key := fmt.Sprintf("%s/%d/%d/%s", norm.Kind, deref(norm.LeadMinutes), deref(norm.DaysBefore), derefS(norm.AtTime))
		if seen[key] {
			add("notices", "notices can't repeat")
			continue
		}
		seen[key] = true
		if in.StartsAt.IsZero() {
			continue
		}
		fire, _ := FireAt(in.StartsAt, in.UtcOffsetMinutes, norm)
		if !fire.Before(in.StartsAt) {
			add("notices", "a notice can't fall after the appointment")
			continue
		}
		out.Notices = append(out.Notices, norm)
		out.FireAts = append(out.FireAts, fire)
	}
	return out, errs
}

func deref(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

func derefS(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// normalizeNotice keeps only the fields of the notice's kind and checks their ranges; the second result is the error, if any.
func normalizeNotice(n NoticeInput) (NoticeInput, string) {
	switch n.Kind {
	case KindBefore:
		if n.LeadMinutes == nil || *n.LeadMinutes < 1 || *n.LeadMinutes > MaxLeadMinutes {
			return n, fmt.Sprintf("the time before must be between 1 and %d minutes", MaxLeadMinutes)
		}
		return NoticeInput{Kind: KindBefore, LeadMinutes: n.LeadMinutes}, ""
	case KindAtTime:
		if n.DaysBefore == nil || *n.DaysBefore < 0 || *n.DaysBefore > MaxDaysBefore {
			return n, fmt.Sprintf("the days before must be between 0 and %d", MaxDaysBefore)
		}
		if n.AtTime == nil {
			return n, "the hour is required"
		}
		h, m, ok := parseClock(*n.AtTime)
		if !ok {
			return n, "the hour must be HH:MM"
		}
		clock := fmt.Sprintf("%02d:%02d", h, m)
		return NoticeInput{Kind: KindAtTime, DaysBefore: n.DaysBefore, AtTime: &clock}, ""
	}
	return n, "the kind must be before or at_time"
}

// DerivedStatus is the status as the parent sees it: a scheduled appointment whose local day ended is «Pasó sin marcar».
func DerivedStatus(stored Status, startsAt time.Time, offsetMinutes int, now time.Time) Status {
	if stored != StatusScheduled {
		return stored
	}
	local := startsAt.In(zone(offsetMinutes))
	endOfDay := time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, zone(offsetMinutes))
	if !now.Before(endOfDay) {
		return StatusUnmarked
	}
	return stored
}
