package appointment

import (
	"strings"
	"testing"
	"time"
)

func ip(n int) *int       { return &n }
func sp(s string) *string { return &s }

// Friday 9 Oct 2026, 10:30 at -06:00 (16:30 UTC).
var starts = time.Date(2026, 10, 9, 16, 30, 0, 0, time.UTC)

const offset = -360

func TestFireAt(t *testing.T) {
	cases := []struct {
		name string
		n    NoticeInput
		want string
	}{
		{"one day before", NoticeInput{Kind: KindBefore, LeadMinutes: ip(1440)}, "2026-10-08 16:30"},
		{"two hours before", NoticeInput{Kind: KindBefore, LeadMinutes: ip(120)}, "2026-10-09 14:30"},
		{"same day at 07:00 local", NoticeInput{Kind: KindAtTime, DaysBefore: ip(0), AtTime: sp("07:00")}, "2026-10-09 13:00"},
		{"one day before at 20:00 local", NoticeInput{Kind: KindAtTime, DaysBefore: ip(1), AtTime: sp("20:00")}, "2026-10-09 02:00"},
	}
	for _, c := range cases {
		got, ok := FireAt(starts, offset, c.n)
		if !ok || got.UTC().Format("2006-01-02 15:04") != c.want {
			t.Errorf("%s: got %v %v, want %s", c.name, got, ok, c.want)
		}
	}
	for _, bad := range []NoticeInput{{Kind: KindBefore}, {Kind: KindAtTime, DaysBefore: ip(1)}, {Kind: KindAtTime, DaysBefore: ip(1), AtTime: sp("xx")}, {Kind: "other"}} {
		if _, ok := FireAt(starts, offset, bad); ok {
			t.Errorf("%+v should not compute", bad)
		}
	}
}

func TestLabel(t *testing.T) {
	cases := map[string]string{
		Label(KindBefore, 1440, 0, ""):   "1 día antes",
		Label(KindBefore, 2880, 0, ""):   "2 días antes",
		Label(KindBefore, 60, 0, ""):     "1 hora antes",
		Label(KindBefore, 120, 0, ""):    "2 horas antes",
		Label(KindBefore, 30, 0, ""):     "30 minutos antes",
		Label(KindBefore, 1, 0, ""):      "1 minuto antes",
		Label(KindAtTime, 0, 0, "07:00"): "El mismo día a las 07:00",
		Label(KindAtTime, 0, 1, "20:00"): "Un día antes a las 20:00",
		Label(KindAtTime, 0, 3, "09:30"): "3 días antes a las 09:30",
	}
	for got, want := range cases {
		if got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	}
}

func fields(errs ValidationErrors) map[string]string {
	out := map[string]string{}
	for _, e := range errs {
		out[e.Field] = e.Message
	}
	return out
}

func TestValidateInput_DefaultsAndNormalization(t *testing.T) {
	got, errs := ValidateInput(Input{StartsAt: starts, UtcOffsetMinutes: offset, Note: "  revisión  "}, "2026-09-28")
	if errs.HasErrors() {
		t.Fatalf("unexpected: %v", errs)
	}
	if got.Note != "revisión" || len(got.Notices) != 2 || len(got.FireAts) != 2 {
		t.Fatalf("defaults missing: %+v", got)
	}
	if *got.Notices[0].LeadMinutes != 1440 || *got.Notices[1].LeadMinutes != 120 {
		t.Fatalf("wrong defaults: %+v", got.Notices)
	}

	empty := []NoticeInput{}
	got, errs = ValidateInput(Input{StartsAt: starts, UtcOffsetMinutes: offset, Notices: &empty}, "2026-10-09")
	if errs.HasErrors() || len(got.Notices) != 0 {
		t.Fatalf("an empty list is respected, and the same day as the consultation is fine: %v %+v", errs, got)
	}

	mixed := []NoticeInput{{Kind: KindAtTime, DaysBefore: ip(1), AtTime: sp("8:00")}}
	_, errs = ValidateInput(Input{StartsAt: starts, UtcOffsetMinutes: offset, Notices: &mixed}, "2026-10-01")
	if fields(errs)["notices"] == "" {
		t.Fatal("8:00 is not HH:MM")
	}
	ok := []NoticeInput{{Kind: KindAtTime, DaysBefore: ip(1), AtTime: sp("20:00"), LeadMinutes: ip(5)}}
	got, errs = ValidateInput(Input{StartsAt: starts, UtcOffsetMinutes: offset, Notices: &ok}, "2026-10-01")
	if errs.HasErrors() || got.Notices[0].LeadMinutes != nil {
		t.Fatalf("the fields of the other kind are dropped: %v %+v", errs, got.Notices)
	}
}

func TestValidateInput_Rules(t *testing.T) {
	too := make([]NoticeInput, 6)
	for i := range too {
		too[i] = NoticeInput{Kind: KindBefore, LeadMinutes: ip(10 + i)}
	}
	cases := []struct {
		name  string
		in    Input
		field string
	}{
		{"no date", Input{UtcOffsetMinutes: offset}, "startsAt"},
		{"before the consultation", Input{StartsAt: starts, UtcOffsetMinutes: offset}, "startsAt"},
		{"offset out of range", Input{StartsAt: starts, UtcOffsetMinutes: 900}, "utcOffsetMinutes"},
		{"note too long", Input{StartsAt: starts, UtcOffsetMinutes: offset, Note: strings.Repeat("n", 501)}, "note"},
		{"six notices", Input{StartsAt: starts, UtcOffsetMinutes: offset, Notices: &too}, "notices"},
		{"repeated notice", Input{StartsAt: starts, UtcOffsetMinutes: offset, Notices: &[]NoticeInput{{Kind: KindBefore, LeadMinutes: ip(60)}, {Kind: KindBefore, LeadMinutes: ip(60)}}}, "notices"},
		{"lead too long", Input{StartsAt: starts, UtcOffsetMinutes: offset, Notices: &[]NoticeInput{{Kind: KindBefore, LeadMinutes: ip(43201)}}}, "notices"},
		{"lead zero", Input{StartsAt: starts, UtcOffsetMinutes: offset, Notices: &[]NoticeInput{{Kind: KindBefore, LeadMinutes: ip(0)}}}, "notices"},
		{"days too many", Input{StartsAt: starts, UtcOffsetMinutes: offset, Notices: &[]NoticeInput{{Kind: KindAtTime, DaysBefore: ip(31), AtTime: sp("08:00")}}}, "notices"},
		{"no hour", Input{StartsAt: starts, UtcOffsetMinutes: offset, Notices: &[]NoticeInput{{Kind: KindAtTime, DaysBefore: ip(1)}}}, "notices"},
		{"unknown kind", Input{StartsAt: starts, UtcOffsetMinutes: offset, Notices: &[]NoticeInput{{Kind: "x"}}}, "notices"},
		{"after the appointment", Input{StartsAt: starts, UtcOffsetMinutes: offset, Notices: &[]NoticeInput{{Kind: KindAtTime, DaysBefore: ip(0), AtTime: sp("23:00")}}}, "notices"},
	}
	for _, c := range cases {
		consult := "2026-10-01"
		if c.name == "before the consultation" {
			consult = "2026-10-20"
		}
		_, errs := ValidateInput(c.in, consult)
		if fields(errs)[c.field] == "" {
			t.Errorf("%s: want an error on %q, got %v", c.name, c.field, errs)
		}
	}
}

func TestDerivedStatus(t *testing.T) {
	// The appointment day (local) is Oct 9; it ends at Oct 10 00:00 local = 06:00 UTC.
	if DerivedStatus(StatusScheduled, starts, offset, time.Date(2026, 10, 10, 5, 59, 0, 0, time.UTC)) != StatusScheduled {
		t.Fatal("still the same local day")
	}
	if DerivedStatus(StatusScheduled, starts, offset, time.Date(2026, 10, 10, 6, 0, 0, 0, time.UTC)) != StatusUnmarked {
		t.Fatal("the day ended")
	}
	if DerivedStatus(StatusDone, starts, offset, time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)) != StatusDone {
		t.Fatal("a marked one stays")
	}
}

func TestValidationErrors(t *testing.T) {
	if (ValidationErrors{}).Error() != "validation error" || (ValidationErrors{}).HasErrors() {
		t.Fatal("empty")
	}
	e := ValidationErrors{{Field: "note", Message: "x"}}
	if e.Error() != "note: x" || !e.HasErrors() {
		t.Fatal("one")
	}
	var p error = &PlanLimitError{Reason: PlanLimitAppointments}
	if p.Error() == "" || p.(*PlanLimitError).Unwrap() != ErrPlanRequired {
		t.Fatal("plan")
	}
}
