package supplement

import "testing"

func TestValidateEdit_AllowsAFirstDayLongPast(t *testing.T) {
	in := valid()
	in.FirstDate = "2026-01-01"
	if _, errs := ValidateInput(in, now); fields(errs)["firstDate"] == "" {
		t.Fatal("creating can not start long ago")
	}
	r, errs := ValidateEdit(in, now)
	if errs.HasErrors() || r.FirstDate != "2026-01-01" {
		t.Fatalf("editing keeps the original first day: %v", errs)
	}
	in.EndDate = ptr("2025-12-31")
	if _, errs := ValidateEdit(in, now); fields(errs)["endDate"] == "" {
		t.Fatal("the end is still checked")
	}
}
