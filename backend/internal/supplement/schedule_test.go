package supplement

import (
	"reflect"
	"testing"
	"time"
)

func utc(s string) time.Time {
	t, err := time.Parse("2006-01-02 15:04", s)
	if err != nil {
		panic(err)
	}
	return t
}

func fmtAll(ts []time.Time) []string {
	out := make([]string, 0, len(ts))
	for _, t := range ts {
		out = append(out, t.UTC().Format("2006-01-02 15:04"))
	}
	return out
}

func TestGenerate(t *testing.T) {
	// 2026-10-05 is a Monday.
	cases := []struct {
		name     string
		r        Routine
		from, to string
		want     []string
	}{
		{
			name: "daily with two times",
			r:    Routine{Period: PeriodDaily, Times: []string{"20:00", "08:00"}, FirstDate: "2026-10-05"},
			from: "2026-10-05 00:00", to: "2026-10-07 00:00",
			want: []string{"2026-10-05 08:00", "2026-10-05 20:00", "2026-10-06 08:00", "2026-10-06 20:00"},
		},
		{
			name: "weekdays monday wednesday friday",
			r:    Routine{Period: PeriodWeekdays, Times: []string{"09:00"}, Weekdays: []int{0, 2, 4}, FirstDate: "2026-10-05"},
			from: "2026-10-05 00:00", to: "2026-10-12 00:00",
			want: []string{"2026-10-05 09:00", "2026-10-07 09:00", "2026-10-09 09:00"},
		},
		{
			name: "weekdays sunday is 6",
			r:    Routine{Period: PeriodWeekdays, Times: []string{"09:00"}, Weekdays: []int{6}, FirstDate: "2026-10-05"},
			from: "2026-10-05 00:00", to: "2026-10-12 00:00",
			want: []string{"2026-10-11 09:00"},
		},
		{
			name: "every 8 hours from 06:00",
			r:    Routine{Period: PeriodInterval, IntervalHours: 8, FirstTime: "06:00", FirstDate: "2026-10-05"},
			from: "2026-10-05 00:00", to: "2026-10-06 12:00",
			want: []string{"2026-10-05 06:00", "2026-10-05 14:00", "2026-10-05 22:00", "2026-10-06 06:00"},
		},
		{
			name: "interval crosses midnight without restarting each day",
			r:    Routine{Period: PeriodInterval, IntervalHours: 10, FirstTime: "20:00", FirstDate: "2026-10-05"},
			from: "2026-10-05 00:00", to: "2026-10-07 00:00",
			want: []string{"2026-10-05 20:00", "2026-10-06 06:00", "2026-10-06 16:00"},
		},
		{
			name: "interval window starting after the first dose skips to the next multiple",
			r:    Routine{Period: PeriodInterval, IntervalHours: 8, FirstTime: "06:00", FirstDate: "2026-10-05"},
			from: "2026-10-05 15:00", to: "2026-10-06 07:00",
			want: []string{"2026-10-05 22:00", "2026-10-06 06:00"},
		},
		{
			name: "end date is included to the end of that day",
			r:    Routine{Period: PeriodDaily, Times: []string{"08:00", "23:30"}, FirstDate: "2026-10-05", EndDate: "2026-10-06"},
			from: "2026-10-05 00:00", to: "2026-10-10 00:00",
			want: []string{"2026-10-05 08:00", "2026-10-05 23:30", "2026-10-06 08:00", "2026-10-06 23:30"},
		},
		{
			name: "window after the end date is empty",
			r:    Routine{Period: PeriodDaily, Times: []string{"08:00"}, FirstDate: "2026-10-01", EndDate: "2026-10-03"},
			from: "2026-10-05 00:00", to: "2026-10-09 00:00",
			want: nil,
		},
		{
			name: "never before the first day",
			r:    Routine{Period: PeriodDaily, Times: []string{"08:00"}, FirstDate: "2026-10-07"},
			from: "2026-10-05 00:00", to: "2026-10-08 12:00",
			want: []string{"2026-10-07 08:00", "2026-10-08 08:00"},
		},
		{
			name: "local zone behind utc (-360) reads times in local hours",
			r:    Routine{Period: PeriodDaily, Times: []string{"08:00"}, FirstDate: "2026-10-05", UtcOffsetMinutes: -360},
			from: "2026-10-05 00:00", to: "2026-10-07 00:00",
			want: []string{"2026-10-05 14:00", "2026-10-06 14:00"},
		},
		{
			name: "local zone ahead of utc (+60) can land on the previous utc day",
			r:    Routine{Period: PeriodDaily, Times: []string{"00:30"}, FirstDate: "2026-10-05", UtcOffsetMinutes: 60},
			from: "2026-10-04 00:00", to: "2026-10-06 12:00",
			want: []string{"2026-10-04 23:30", "2026-10-05 23:30"},
		},
		{
			name: "empty window",
			r:    Routine{Period: PeriodDaily, Times: []string{"08:00"}, FirstDate: "2026-10-05"},
			from: "2026-10-06 00:00", to: "2026-10-06 00:00",
			want: nil,
		},
		{
			name: "window starts mid day: earlier times that day are left out",
			r:    Routine{Period: PeriodDaily, Times: []string{"08:00", "20:00"}, FirstDate: "2026-10-05"},
			from: "2026-10-05 12:00", to: "2026-10-06 00:00",
			want: []string{"2026-10-05 20:00"},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := fmtAll(Generate(c.r, utc(c.from), utc(c.to)))
			if len(got) == 0 && len(c.want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Fatalf("got %v, want %v", got, c.want)
			}
		})
	}
}

func TestGenerateBadData(t *testing.T) {
	from, to := utc("2026-10-05 00:00"), utc("2026-10-07 00:00")
	for name, r := range map[string]Routine{
		"bad first date":    {Period: PeriodDaily, Times: []string{"08:00"}, FirstDate: "nope"},
		"bad end date":      {Period: PeriodDaily, Times: []string{"08:00"}, FirstDate: "2026-10-05", EndDate: "nope"},
		"bad interval time": {Period: PeriodInterval, IntervalHours: 8, FirstTime: "xx", FirstDate: "2026-10-05"},
		"no interval hours": {Period: PeriodInterval, FirstTime: "06:00", FirstDate: "2026-10-05"},
	} {
		if got := Generate(r, from, to); len(got) != 0 {
			t.Errorf("%s: want nothing, got %v", name, got)
		}
	}
	// A bad time inside the list is skipped, the good ones stay.
	r := Routine{Period: PeriodDaily, Times: []string{"08:00", "bad"}, FirstDate: "2026-10-05"}
	if got := fmtAll(Generate(r, from, to)); len(got) != 2 {
		t.Errorf("want 2 doses, got %v", got)
	}
}

func TestParseClock(t *testing.T) {
	for s, ok := range map[string]bool{"08:00": true, "08:00:00": true, "23:59": true, "24:00": false, "8:00": false, "08:60": false, "ab:cd": false, "08": false, "08:00:00:00": false} {
		if _, _, got := parseClock(s); got != ok {
			t.Errorf("parseClock(%q) = %v, want %v", s, got, ok)
		}
	}
}
