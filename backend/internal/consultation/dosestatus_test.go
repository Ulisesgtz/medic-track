package consultation_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

func TestStatusAt(t *testing.T) {
	at := time.Date(2026, 9, 29, 8, 0, 0, 0, time.UTC)

	for name, tc := range map[string]struct {
		taken     bool
		frequency int
		now       time.Time
		want      consultation.DoseStatus
	}{
		"before its time":                        {false, 8, at.Add(-time.Minute), consultation.DoseStatusPending},
		"exactly at its time":                    {false, 8, at, consultation.DoseStatusDue},
		"just before the next dose":              {false, 8, at.Add(8*time.Hour - time.Nanosecond), consultation.DoseStatusDue},
		"exactly when the next dose comes":       {false, 8, at.Add(8 * time.Hour), consultation.DoseStatusUnregistered},
		"days later":                             {false, 8, at.AddDate(0, 0, 3), consultation.DoseStatusUnregistered},
		"every hour: unregistered after an hour": {false, 1, at.Add(time.Hour), consultation.DoseStatusUnregistered},
		"once a day: still due at 23 h":          {false, 24, at.Add(23 * time.Hour), consultation.DoseStatusDue},
		"marked before its time":                 {true, 8, at.Add(-time.Hour), consultation.DoseStatusTaken},
		"marked long after":                      {true, 8, at.AddDate(0, 0, 3), consultation.DoseStatusTaken},
	} {
		t.Run(name, func(t *testing.T) {
			require.Equal(t, tc.want, consultation.StatusAt(at, tc.taken, tc.frequency, tc.now))
		})
	}
}
