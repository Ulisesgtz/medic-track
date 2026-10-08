package supplement

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func ptr[T any](v T) *T { return &v }

var now = utc("2026-10-05 15:00")

func valid() Input {
	return Input{Name: "  Vitamina D ", Period: "daily", Times: []string{"20:00", "08:00"}, FirstDate: "2026-10-05"}
}

func activity() Input {
	return Input{Kind: "activity", Name: "Tomar agua", Period: "window", WindowStart: ptr("08:00"), WindowEnd: ptr("20:00"), IntervalMinutes: ptr(60), FirstDate: "2026-10-05"}
}

func fields(errs ValidationErrors) map[string]string {
	out := map[string]string{}
	for _, e := range errs {
		out[e.Field] = e.Message
	}
	return out
}

func TestValidateInput_NormalizesAValidRoutine(t *testing.T) {
	r, errs := ValidateInput(valid(), now)
	if errs.HasErrors() {
		t.Fatalf("unexpected errors: %v", errs)
	}
	if r.Name != "Vitamina D" || r.Period != PeriodDaily || len(r.Times) != 2 || r.Times[0] != "08:00" || r.Times[1] != "20:00" {
		t.Fatalf("not normalized: %+v", r)
	}
}

func TestValidateInput_OnlyTheFieldsOfItsPeriodStay(t *testing.T) {
	in := valid()
	in.Weekdays = []int{1, 2}
	in.WindowStart = ptr("06:00")
	in.WindowEnd = ptr("07:00")
	in.IntervalMinutes = ptr(30)
	r, errs := ValidateInput(in, now)
	if errs.HasErrors() || r.Weekdays != nil || r.IntervalMinutes != 0 || r.WindowStart != "" || r.WindowEnd != "" {
		t.Fatalf("daily kept foreign fields: %+v %v", r, errs)
	}

	w := Input{Name: "x", Period: "weekdays", Times: []string{"09:00"}, Weekdays: []int{4, 0, 2}, FirstDate: "2026-10-05", IntervalMinutes: ptr(30)}
	r, errs = ValidateInput(w, now)
	if errs.HasErrors() || len(r.Weekdays) != 3 || r.Weekdays[0] != 0 || r.Weekdays[2] != 4 || r.IntervalMinutes != 0 {
		t.Fatalf("weekdays: %+v %v", r, errs)
	}

	act := Input{Kind: "activity", Name: "x", Period: "window", WindowStart: ptr("6:00"), WindowEnd: ptr("20:00"), IntervalMinutes: ptr(60), FirstDate: "2026-10-05", Times: []string{"08:00"}, Weekdays: []int{4, 0}}
	if _, errs = ValidateInput(act, now); fields(errs)["windowStart"] == "" {
		t.Fatalf("6:00 isn't HH:MM: %v", errs)
	}
	act.WindowStart = ptr("06:00")
	r, errs = ValidateInput(act, now)
	if errs.HasErrors() || r.Kind != KindActivity || r.Period != PeriodWindow || r.Times != nil || r.WindowStart != "06:00" || r.WindowEnd != "20:00" || r.IntervalMinutes != 60 || len(r.Weekdays) != 2 || r.Weekdays[0] != 0 {
		t.Fatalf("activity: %+v %v", r, errs)
	}
	act.Weekdays = nil
	if r, errs = ValidateInput(act, now); errs.HasErrors() || r.Weekdays != nil {
		t.Fatalf("an activity with no weekdays happens every day: %+v %v", r, errs)
	}
}

func TestValidateInput_Rules(t *testing.T) {
	long := strings.Repeat("a", MaxNameLength+1)
	cases := []struct {
		name  string
		mod   func(*Input)
		field string
	}{
		{"empty name", func(i *Input) { i.Name = "   " }, "name"},
		{"name too long", func(i *Input) { i.Name = long }, "name"},
		{"note too long", func(i *Input) { i.Note = strings.Repeat("n", MaxNoteLength+1) }, "note"},
		{"unknown period", func(i *Input) { i.Period = "monthly" }, "period"},
		{"no times", func(i *Input) { i.Times = nil }, "times"},
		{"seven times", func(i *Input) { i.Times = []string{"01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00"} }, "times"},
		{"repeated times", func(i *Input) { i.Times = []string{"08:00", "08:00"} }, "times"},
		{"bad time", func(i *Input) { i.Times = []string{"25:00"} }, "times"},
		{"weekdays empty", func(i *Input) { i.Period = "weekdays"; i.Weekdays = nil }, "weekdays"},
		{"weekdays out of range", func(i *Input) { i.Period = "weekdays"; i.Weekdays = []int{7} }, "weekdays"},
		{"weekdays repeated", func(i *Input) { i.Period = "weekdays"; i.Weekdays = []int{1, 1} }, "weekdays"},
		{"weekdays too many", func(i *Input) { i.Period = "weekdays"; i.Weekdays = []int{0, 1, 2, 3, 4, 5, 6, 0} }, "weekdays"},
		{"supplement can't be a window", func(i *Input) { i.Period = "window" }, "period"},
		{"supplement can't be every N hours", func(i *Input) { i.Period = "interval" }, "period"},
		{"unknown kind", func(i *Input) { i.Kind = "routine" }, "kind"},
		{"activity must be a window", func(i *Input) { i.Kind = "activity"; i.Period = "daily" }, "period"},
		{"activity without start", func(i *Input) { *i = activity(); i.WindowStart = nil }, "windowStart"},
		{"activity without end", func(i *Input) { *i = activity(); i.WindowEnd = nil }, "windowEnd"},
		{"activity bad end", func(i *Input) { *i = activity(); i.WindowEnd = ptr("25:00") }, "windowEnd"},
		{"activity end not after start", func(i *Input) { *i = activity(); i.WindowEnd = ptr("08:00") }, "windowEnd"},
		{"activity without interval", func(i *Input) { *i = activity(); i.IntervalMinutes = nil }, "intervalMinutes"},
		{"activity every 4 minutes", func(i *Input) { *i = activity(); i.IntervalMinutes = ptr(4) }, "intervalMinutes"},
		{"activity every 24 hours", func(i *Input) { *i = activity(); i.IntervalMinutes = ptr(24 * 60) }, "intervalMinutes"},
		{"activity weekdays out of range", func(i *Input) { *i = activity(); i.Weekdays = []int{7} }, "weekdays"},
		{"bad first date", func(i *Input) { i.FirstDate = "5/10/2026" }, "firstDate"},
		{"first date two days ago", func(i *Input) { i.FirstDate = "2026-10-03" }, "firstDate"},
		{"bad end date", func(i *Input) { i.EndDate = ptr("nope") }, "endDate"},
		{"end before first", func(i *Input) { i.EndDate = ptr("2026-10-04") }, "endDate"},
		{"offset out of range", func(i *Input) { i.UtcOffsetMinutes = 900 }, "utcOffsetMinutes"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			in := valid()
			c.mod(&in)
			_, errs := ValidateInput(in, now)
			if fields(errs)[c.field] == "" {
				t.Fatalf("want an error on %q, got %v", c.field, errs)
			}
		})
	}
}

func TestValidateInput_Boundaries(t *testing.T) {
	in := valid()
	in.FirstDate = "2026-10-04" // yesterday: allowed
	in.Name = strings.Repeat("ñ", MaxNameLength)
	in.EndDate = ptr("2026-10-04") // same day as the first: allowed
	if r, errs := ValidateInput(in, now); errs.HasErrors() || r.EndDate != "2026-10-04" {
		t.Fatalf("boundaries rejected: %v", errs)
	}
	in.EndDate = ptr("") // empty = no end
	if r, errs := ValidateInput(in, now); errs.HasErrors() || r.EndDate != "" {
		t.Fatalf("empty end: %v", errs)
	}
	// "Yesterday" is the routine's local one: at 02:00 UTC it is still the 4th at -360, so the 3rd is yesterday.
	late := time.Date(2026, 10, 5, 2, 0, 0, 0, time.UTC)
	in = valid()
	in.UtcOffsetMinutes = -360
	in.FirstDate = "2026-10-03"
	if _, errs := ValidateInput(in, late); errs.HasErrors() {
		t.Fatalf("local yesterday rejected: %v", errs)
	}
}

func TestValidationErrors(t *testing.T) {
	if (ValidationErrors{}).Error() != "validation error" || (ValidationErrors{}).HasErrors() {
		t.Fatal("empty")
	}
	e := ValidationErrors{{Field: "name", Message: "name is required"}}
	if e.Error() != "name: name is required" || !e.HasErrors() {
		t.Fatalf("got %q", e.Error())
	}
}

func TestDomainErrorsUnwrap(t *testing.T) {
	var l error = &RoutineLimitError{Limit: 10}
	if !errors.Is(l, ErrRoutineLimit) || l.Error() == "" {
		t.Fatal("limit")
	}
	var p error = &PlanLimitError{Reason: PlanLimitSupplements}
	if !errors.Is(p, ErrPlanRequired) || p.Error() == "" {
		t.Fatal("plan")
	}
}
