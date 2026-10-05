package consultation_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// Ending the treatment early cancels the unmarked doses whose time came after it (specs/016).
func TestStatusAt_EndedEarly(t *testing.T) {
	ended := time.Date(2026, 9, 29, 10, 0, 0, 0, time.UTC)
	at := func(h int) time.Time { return time.Date(2026, 9, 29, h, 0, 0, 0, time.UTC) }
	later := ended.AddDate(0, 0, 5)

	// A dose exactly at the moment it ended had come: it keeps its own status; one after it is canceled.
	require.Equal(t, consultation.DoseStatusUnregistered, consultation.StatusAt(at(10), false, 8, &ended, later))
	require.Equal(t, consultation.DoseStatusCanceled, consultation.StatusAt(ended.Add(time.Nanosecond), false, 8, &ended, later))
	require.Equal(t, consultation.DoseStatusCanceled, consultation.StatusAt(at(16), false, 8, &ended, ended))
	// Already-come doses keep their status.
	require.Equal(t, consultation.DoseStatusUnregistered, consultation.StatusAt(at(0), false, 8, &ended, later))
	require.Equal(t, consultation.DoseStatusDue, consultation.StatusAt(at(8), false, 8, &ended, at(12)))
	// A marked dose stays taken, even one after the end.
	require.Equal(t, consultation.DoseStatusTaken, consultation.StatusAt(at(16), true, 8, &ended, later))
	// Without an end, nothing is canceled.
	require.Equal(t, consultation.DoseStatusUnregistered, consultation.StatusAt(at(16), false, 8, nil, later))
}

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
			require.Equal(t, tc.want, consultation.StatusAt(at, tc.taken, tc.frequency, nil, tc.now))
		})
	}
}
