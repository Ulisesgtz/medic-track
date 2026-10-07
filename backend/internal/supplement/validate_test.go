package supplement

import (
	"strings"
	"testing"
	"time"
)

func ptr[T any](v T) *T { return &v }

var now = utc("2026-10-05 15:00")

func valid() Input {
	return Input{Name: "  Vitamina D ", Period: "daily", Times: []string{"20:00", "08:00"}, FirstDate: "2026-10-05"}
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
	in.IntervalHours = ptr(8)
	in.FirstTime = ptr("06:00")
	r, errs := ValidateInput(in, now)
	if errs.HasErrors() || r.Weekdays != nil || r.IntervalHours != 0 || r.FirstTime != "" {
		t.Fatalf("daily kept foreign fields: %+v %v", r, errs)
	}

	w := Input{Name: "x", Period: "weekdays", Times: []string{"09:00"}, Weekdays: []int{4, 0, 2}, FirstDate: "2026-10-05", IntervalHours: ptr(3)}
	r, errs = ValidateInput(w, now)
	if errs.HasErrors() || len(r.Weekdays) != 3 || r.Weekdays[0] != 0 || r.Weekdays[2] != 4 || r.IntervalHours != 0 {
		t.Fatalf("weekdays: %+v %v", r, errs)
	}

	iv := Input{Name: "x", Period: "interval", IntervalHours: ptr(8), FirstTime: ptr("6:00"), FirstDate: "2026-10-05", Times: []string{"08:00"}}
	if _, errs = ValidateInput(iv, now); fields(errs)["firstTime"] == "" {
		t.Fatalf("6:00 isn't HH:MM: %v", errs)
	}
	iv.FirstTime = ptr("06:00")
	r, errs = ValidateInput(iv, now)
	if errs.HasErrors() || r.Times != nil || r.IntervalHours != 8 || r.FirstTime != "06:00" {
		t.Fatalf("interval: %+v %v", r, errs)
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
		{"interval without hours", func(i *Input) { i.Period = "interval"; i.FirstTime = ptr("06:00") }, "intervalHours"},
		{"interval 25 hours", func(i *Input) { i.Period = "interval"; i.IntervalHours = ptr(25); i.FirstTime = ptr("06:00") }, "intervalHours"},
		{"interval without first time", func(i *Input) { i.Period = "interval"; i.IntervalHours = ptr(8) }, "firstTime"},
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
	if !isErr(l, ErrRoutineLimit) || l.Error() == "" {
		t.Fatal("limit")
	}
	var p error = &PlanLimitError{Reason: PlanLimitSupplements}
	if !isErr(p, ErrPlanRequired) || p.Error() == "" {
		t.Fatal("plan")
	}
}

func isErr(err, target error) bool {
	for err != nil {
		if err == target {
			return true
		}
		u, ok := err.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}
