package supplement

import (
	"testing"
	"time"
)

func TestStatusAt(t *testing.T) {
	at := utc("2026-10-05 08:00")
	next := utc("2026-10-05 20:00")
	cases := []struct {
		name  string
		taken bool
		next  *time.Time
		now   string
		want  DoseStatus
	}{
		{"before its time", false, &next, "2026-10-05 07:59", DosePending},
		{"exactly its time", false, &next, "2026-10-05 08:00", DoseDue},
		{"just before the next one", false, &next, "2026-10-05 19:59", DoseDue},
		{"exactly the next one", false, &next, "2026-10-05 20:00", DoseUnregistered},
		{"long after the next one", false, &next, "2026-10-07 00:00", DoseUnregistered},
		{"no next, 23:59 later", false, nil, "2026-10-06 07:59", DoseDue},
		{"no next, exactly 24 h", false, nil, "2026-10-06 08:00", DoseUnregistered},
		{"taken is always taken", true, &next, "2026-10-09 00:00", DoseTaken},
		{"taken before its time", true, nil, "2026-10-05 07:00", DoseTaken},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := StatusAt(at, c.taken, c.next, utc(c.now)); got != c.want {
				t.Fatalf("got %s, want %s", got, c.want)
			}
		})
	}
}
