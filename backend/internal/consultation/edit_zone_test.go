package consultation_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// bugfix/054: a consultation keeps the UTC offset its start times were read in, and an edit reads them in that same zone,
// whatever the zone of the device that edits.

const mexicoCity = -360 // minutes

// consultIn saves a consultation of w.day from a device at the given UTC offset: Amoxicilina every 6 h for 7 days from 08:00.
func (w *editWorld) consultIn(t *testing.T, offset int) *consultation.Consultation {
	t.Helper()
	c, err := w.svc.CreateConsultation(context.Background(), w.childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. Laura Cazares", ConsultDate: w.day, Photo: samplePhoto(), UTCOffsetMinutes: offset,
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 6, DurationDays: 7, StartTime: strPtr("08:00")}},
	})
	require.NoError(t, err)
	return w.get(t, c.ID)
}

func (w *editWorld) savedOffset(t *testing.T, id uuid.UUID) *int {
	t.Helper()
	var offset *int
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT utc_offset_minutes FROM consultations WHERE id = $1`, id).Scan(&offset))
	return offset
}

// requireAheadFollows checks that every unmarked dose ahead of now is first + k × every.
func (w *editWorld) requireAheadFollows(t *testing.T, c *consultation.Consultation, first time.Time, every time.Duration) {
	t.Helper()
	ahead := 0
	for _, d := range c.Medications[0].Doses {
		if !d.ScheduledAt.After(w.now) || d.Taken {
			continue
		}
		ahead++
		require.Zero(t, d.ScheduledAt.Sub(first)%every, "dose ahead at %s is %s + k × %s", d.ScheduledAt, first, every)
	}
	require.NotZero(t, ahead, "the new schedule has doses ahead")
}

func TestCreate_SavesTheConsultationsOffset(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consultIn(t, mexicoCity)

	require.Equal(t, mexicoCity, *w.savedOffset(t, c.ID))
	require.True(t, w.day.Add(14*time.Hour).Equal(c.Medications[0].Doses[0].ScheduledAt), "08:00 in Mexico City is 14:00 UTC")
}

func TestEdit_FromAnotherZoneTheStartTimeKeepsTheConsultationsZone(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consultIn(t, mexicoCity)

	in := inputOf(c)
	in.Medications[0].FrequencyHours = 8
	in.UTCOffsetMinutes = 60 // the parent edits it on a trip to Madrid
	got, err := w.edit(c, in)

	require.NoError(t, err)
	w.requireAheadFollows(t, got, w.day.Add(14*time.Hour), 8*time.Hour)
	require.Equal(t, mexicoCity, *w.savedOffset(t, c.ID), "the editor's offset doesn't replace the consultation's")
}

func TestEdit_AConsultationWithoutAnOffsetTakesTheEditorsAndKeepsIt(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consultIn(t, mexicoCity)
	_, err := w.pool.Exec(context.Background(), `UPDATE consultations SET utc_offset_minutes = NULL WHERE id = $1`, c.ID)
	require.NoError(t, err)

	in := inputOf(c)
	in.Medications[0].FrequencyHours = 8
	in.UTCOffsetMinutes = mexicoCity
	got, err := w.edit(c, in)
	require.NoError(t, err)
	w.requireAheadFollows(t, got, w.day.Add(14*time.Hour), 8*time.Hour)
	require.Equal(t, mexicoCity, *w.savedOffset(t, c.ID))

	// From then on it is the consultation's: a second edit from another zone keeps reading 08:00 in Mexico City.
	in = inputOf(got)
	in.Medications[0].FrequencyHours = 12
	in.UTCOffsetMinutes = 60
	got, err = w.edit(got, in)
	require.NoError(t, err)
	w.requireAheadFollows(t, got, w.day.Add(14*time.Hour), 12*time.Hour)
	require.Equal(t, mexicoCity, *w.savedOffset(t, c.ID))
}

// backfill runs the migration's own UPDATE for one consultation only (the rest of the database is not touched).
func backfill(t *testing.T, w *editWorld, id uuid.UUID) {
	t.Helper()
	sql, err := os.ReadFile("../../migrations/0031_consultation_utc_offset.sql")
	require.NoError(t, err)
	update := string(sql)[strings.Index(string(sql), "UPDATE consultations c"):]
	update = strings.TrimSuffix(strings.TrimSpace(update), ";") + " AND c.id = $1"
	_, err = w.pool.Exec(context.Background(), update, id)
	require.NoError(t, err)
}

func TestMigration0031_BackfillsTheOffsetFromTheFirstDose(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	mexico := w.consultIn(t, mexicoCity)
	india := w.consultIn(t, 330)
	edited := w.consultIn(t, mexicoCity)
	_, err := w.edit(edited, inputOf(edited))
	require.NoError(t, err)
	recordOnly := w.consult(t, true)

	for _, id := range []uuid.UUID{mexico.ID, india.ID, edited.ID, recordOnly.ID} {
		_, err := w.pool.Exec(context.Background(), `UPDATE consultations SET utc_offset_minutes = NULL WHERE id = $1`, id)
		require.NoError(t, err)
		backfill(t, w, id)
	}

	require.Equal(t, mexicoCity, *w.savedOffset(t, mexico.ID))
	require.Equal(t, 330, *w.savedOffset(t, india.ID))
	require.Nil(t, w.savedOffset(t, edited.ID), "an edited consultation may keep doses of an older schedule: not guessed")
	require.Nil(t, w.savedOffset(t, recordOnly.ID), "no doses, nothing to read it from")
}
