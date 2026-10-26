package consultation_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/051: editing a saved consultation. Every test works on a clock of its own (SetNow): the consultation was three days
// ago (UTC), its medication every 6 h for 7 days from 08:00, and "now" is the third day at 12:00 — so there are doses behind
// and doses ahead, and no test depends on the hour the suite runs.

type editWorld struct {
	pool    *pgxpool.Pool
	repo    *consultation.Repository
	svc     *consultation.Service
	childID uuid.UUID
	editor  uuid.UUID
	day     time.Time // the consultation's date
	now     time.Time
}

func newEditWorld(t *testing.T, plan account.Plan) *editWorld {
	t.Helper()
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	n := time.Now().UTC()
	day := time.Date(n.Year(), n.Month(), n.Day()-3, 0, 0, 0, 0, time.UTC)
	now := day.Add(3*24*time.Hour + 12*time.Hour)
	consultation.SetNow(repo, func() time.Time { return now })
	childID := createChildren(t, pool, plan, 1)[0]
	var editor uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT account_id FROM children WHERE id = $1`, childID).Scan(&editor))
	return &editWorld{pool: pool, repo: repo, svc: consultation.NewService(repo), childID: childID, editor: editor, day: day, now: now}
}

// consult saves a consultation of w.day with the given medications (paid plan rules permitting).
func (w *editWorld) consult(t *testing.T, recordOnly bool, meds ...consultation.CreateMedicationInput) *consultation.Consultation {
	t.Helper()
	if len(meds) == 0 {
		meds = []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 6, DurationDays: 7, StartTime: strPtr("08:00")}}
	}
	c, err := w.svc.CreateConsultation(context.Background(), w.childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. Laura Cazares", ConsultDate: w.day, Photo: samplePhoto(), Notes: "Fiebre desde el domingo",
		Medications: meds, RecordOnly: recordOnly,
	})
	require.NoError(t, err)
	return w.get(t, c.ID)
}

func (w *editWorld) get(t *testing.T, id uuid.UUID) *consultation.Consultation {
	t.Helper()
	c, err := w.repo.GetByID(context.Background(), id)
	require.NoError(t, err)
	return c
}

func (w *editWorld) mark(t *testing.T, c *consultation.Consultation, dose consultation.Dose) {
	t.Helper()
	_, err := w.svc.MarkDose(context.Background(), c.ID, dose.ID, true, consultation.Actor{AccountID: w.editor, Full: true})
	require.NoError(t, err)
}

func (w *editWorld) edit(c *consultation.Consultation, in consultation.UpdateConsultationInput) (*consultation.Consultation, error) {
	return w.svc.UpdateConsultation(context.Background(), c.ID, in, w.editor)
}

// inputOf is the consultation as it is saved: what the form sends back if nothing is touched.
func inputOf(c *consultation.Consultation) consultation.UpdateConsultationInput {
	in := consultation.UpdateConsultationInput{
		ExpectedVersion: versionOf(c), DoctorName: c.DoctorName, ConsultDate: c.ConsultDate, Notes: c.Notes,
	}
	for _, s := range c.Symptoms {
		in.SymptomCodes = append(in.SymptomCodes, s.Code)
	}
	for _, m := range c.Medications {
		id := m.ID
		in.Medications = append(in.Medications, consultation.UpdateMedicationInput{
			ID: &id, Name: m.Name, FrequencyHours: m.FrequencyHours, DurationDays: m.DurationDays, StartTime: m.StartTime,
		})
	}
	return in
}

func versionOf(c *consultation.Consultation) time.Time {
	if c.EditedAt != nil {
		return *c.EditedAt
	}
	return c.CreatedAt
}

// at says each dose's instant, in order; marked says which instants are marked.
func at(doses []consultation.Dose) (all []time.Time, marked map[int64]bool) {
	marked = map[int64]bool{}
	for _, d := range doses {
		all = append(all, d.ScheduledAt)
		if d.Taken {
			marked[d.ScheduledAt.UnixMicro()] = true
		}
	}
	return all, marked
}

func TestEdit_DataOnlyChangesNoDoseAndSaysWhoEdited(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	w.mark(t, c, c.Medications[0].Doses[0])
	before := w.get(t, c.ID)

	in := inputOf(before)
	in.DoctorName = "Dra. Laura Cázares"
	in.Notes = "Fiebre desde el sábado"
	in.Medications[0].Name = "Amoxicilina 500 mg"
	got, err := w.edit(before, in)

	require.NoError(t, err)
	require.Equal(t, "Dra. Laura Cázares", got.DoctorName)
	require.Equal(t, "Fiebre desde el sábado", got.Notes)
	require.Equal(t, "Amoxicilina 500 mg", got.Medications[0].Name)
	require.NotNil(t, got.EditedAt)
	require.Equal(t, "Ana", *got.EditedBy)
	require.Len(t, got.Medications[0].Doses, len(before.Medications[0].Doses))
	for i, d := range before.Medications[0].Doses {
		after := got.Medications[0].Doses[i]
		require.Equal(t, d.ID, after.ID, "no dose is recreated")
		require.Equal(t, d.Taken, after.Taken)
	}
	require.Equal(t, "Ana", got.Medications[0].Doses[0].TakenBy.Name, "the mark keeps its author")
}

func TestEdit_ANewFrequencyRedoesOnlyTheDosesAhead(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	doses := c.Medications[0].Doses
	w.mark(t, c, doses[1])             // past, marked
	aheadMarked := doses[len(doses)-2] // far ahead, marked in advance
	require.True(t, aheadMarked.ScheduledAt.After(w.now))
	w.mark(t, c, aheadMarked)
	before := w.get(t, c.ID)
	pastBefore := 0
	for _, d := range before.Medications[0].Doses {
		if !d.ScheduledAt.After(w.now) {
			pastBefore++
		}
	}

	in := inputOf(before)
	in.Medications[0].FrequencyHours = 8
	got, err := w.edit(before, in)
	require.NoError(t, err)

	all, marked := at(got.Medications[0].Doses)
	require.True(t, marked[doses[1].ScheduledAt.UnixMicro()], "a past mark stays")
	require.True(t, marked[aheadMarked.ScheduledAt.UnixMicro()], "a mark made in advance stays")
	pastAfter := 0
	seen := map[int64]bool{}
	for _, d := range got.Medications[0].Doses {
		require.False(t, seen[d.ScheduledAt.UnixMicro()], "no two doses at %s", d.ScheduledAt)
		seen[d.ScheduledAt.UnixMicro()] = true
		if !d.ScheduledAt.After(w.now) {
			pastAfter++
			continue
		}
		if d.Taken {
			continue
		}
		// Every unmarked dose ahead is one of the new schedule: 08:00 + k×8 h.
		require.Zero(t, d.ScheduledAt.Sub(w.day.Add(8*time.Hour))%(8*time.Hour), "dose ahead at %s follows the new schedule", d.ScheduledAt)
	}
	require.Equal(t, pastBefore, pastAfter, "nothing behind is added or removed")
	require.True(t, w.day.Add(8*time.Hour+7*24*time.Hour-8*time.Hour).Equal(all[len(all)-1]), "the new schedule ends 7 days after it started")
}

func TestEdit_AnotherDateIsAScheduleChange(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	in := inputOf(c)
	in.ConsultDate = w.day.AddDate(0, 0, -1)
	got, err := w.edit(c, in)

	require.NoError(t, err)
	require.Equal(t, w.day.AddDate(0, 0, -1).Format("2006-01-02"), got.ConsultDate.Format("2006-01-02"))
	last := got.Medications[0].Doses[len(got.Medications[0].Doses)-1].ScheduledAt
	require.True(t, w.day.AddDate(0, 0, 6).Add(2*time.Hour).Equal(last), "one day earlier: the last dose too")
}

func TestEdit_AnEndedTreatmentKeepsItsSchedule(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	// Ending uses the real clock; the treatment is ended "before" this world's now as far as the rule goes.
	_, err := w.svc.EndTreatment(context.Background(), c.ID, c.Medications[0].ID)
	require.NoError(t, err)
	before := w.get(t, c.ID)

	in := inputOf(before)
	in.Medications[0].FrequencyHours = 8
	_, err = w.edit(before, in)
	var verrs consultation.ValidationErrors
	require.ErrorAs(t, err, &verrs)
	require.Equal(t, "medications[0].frequencyHours", verrs[0].Field)
	require.Equal(t, "treatment_ended", verrs[0].Message)

	in = inputOf(before)
	in.Medications[0].Name = "Amoxicilina (terminada)"
	in.ConsultDate = w.day.AddDate(0, 0, -1)
	got, err := w.edit(before, in)
	require.NoError(t, err)
	require.Equal(t, "Amoxicilina (terminada)", got.Medications[0].Name)
	require.Len(t, got.Medications[0].Doses, len(before.Medications[0].Doses), "a new date leaves an ended treatment's doses alone")
}

func TestEdit_ARecordOnlyConsultationStaysWithoutDoses(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, true, consultation.CreateMedicationInput{Name: "Paracetamol", FrequencyHours: 8, DurationDays: 3})
	in := inputOf(c)
	in.Medications[0].FrequencyHours = 6
	in.Medications = append(in.Medications, consultation.UpdateMedicationInput{Name: "Ibuprofeno", FrequencyHours: 8, DurationDays: 3, StartTime: strPtr("09:00")})
	got, err := w.edit(c, in)

	require.NoError(t, err)
	require.True(t, got.RecordOnly)
	require.Len(t, got.Medications, 2)
	for _, m := range got.Medications {
		require.Nil(t, m.StartTime)
		require.Empty(t, m.Doses)
	}
}

func TestEdit_AStartTimeIsRequiredWithASchedule(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	in := inputOf(c)
	in.Medications[0].StartTime = nil
	in.Medications = append(in.Medications, consultation.UpdateMedicationInput{Name: "Ibuprofeno", FrequencyHours: 8, DurationDays: 3, StartTime: strPtr("9am")})
	_, err := w.edit(c, in)

	var verrs consultation.ValidationErrors
	require.ErrorAs(t, err, &verrs)
	require.Equal(t, "medications[0].startTime", verrs[0].Field)
	require.Equal(t, "medications[1].startTime", verrs[1].Field)
}

func TestEdit_AddingAMedicationGivesItItsDosesAhead(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	in := inputOf(c)
	in.Medications = append(in.Medications, consultation.UpdateMedicationInput{Name: "Ambroxol", FrequencyHours: 12, DurationDays: 5, StartTime: strPtr("09:00")})
	got, err := w.edit(c, in)

	require.NoError(t, err)
	require.Len(t, got.Medications, 2)
	added := got.Medications[1]
	require.Equal(t, "Ambroxol", added.Name, "a new medication goes last (its number and color stay stable)")
	require.NotEmpty(t, added.Doses)
	for _, d := range added.Doses {
		require.True(t, d.ScheduledAt.After(w.now), "no dose is invented in the past")
	}
}

func TestEdit_RemovingAMedicationWithoutMarks(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false,
		consultation.CreateMedicationInput{Name: "Amoxicilina", FrequencyHours: 6, DurationDays: 7, StartTime: strPtr("08:00")},
		consultation.CreateMedicationInput{Name: "Amoxicilina", FrequencyHours: 6, DurationDays: 7, StartTime: strPtr("08:00")})
	// A reminder was already sent for a past dose of the repeated one: it goes with it.
	_, err := w.pool.Exec(context.Background(), `INSERT INTO dose_reminders (dose_id, account_id) VALUES ($1, $2)`, c.Medications[1].Doses[0].ID, w.editor)
	require.NoError(t, err)

	in := inputOf(c)
	in.Medications = in.Medications[:1]
	got, err := w.edit(c, in)

	require.NoError(t, err)
	require.Len(t, got.Medications, 1)
	require.Equal(t, c.Medications[0].ID, got.Medications[0].ID)
}

func TestEdit_AMedicationWithMarksIsNotRemoved(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false,
		consultation.CreateMedicationInput{Name: "Amoxicilina", FrequencyHours: 6, DurationDays: 7, StartTime: strPtr("08:00")},
		consultation.CreateMedicationInput{Name: "Paracetamol", FrequencyHours: 8, DurationDays: 3, StartTime: strPtr("08:00")})
	w.mark(t, c, c.Medications[1].Doses[0])
	before := w.get(t, c.ID)

	in := inputOf(before)
	in.DoctorName = "Otro"
	in.Medications = in.Medications[:1]
	_, err := w.edit(before, in)

	require.ErrorIs(t, err, consultation.ErrMedicationHasMarks)
	after := w.get(t, c.ID)
	require.Equal(t, "Dra. Laura Cazares", after.DoctorName, "nothing of the edit is saved")
	require.Len(t, after.Medications, 2)
	require.Len(t, after.Medications[1].Doses, len(before.Medications[1].Doses))
	require.Nil(t, after.EditedAt)
}

func TestEdit_AMedicationOfAnotherConsultationOrRepeated(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	other := w.consult(t, false)

	in := inputOf(c)
	foreign := other.Medications[0].ID
	in.Medications = append(in.Medications, consultation.UpdateMedicationInput{ID: &foreign, Name: "X", FrequencyHours: 8, DurationDays: 1, StartTime: strPtr("08:00")})
	_, err := w.edit(c, in)
	var verrs consultation.ValidationErrors
	require.ErrorAs(t, err, &verrs)
	require.Equal(t, consultation.ValidationError{Field: "medications[1].id", Message: "medication_not_found"}, verrs[0])

	in = inputOf(c)
	in.Medications = append(in.Medications, in.Medications[0])
	_, err = w.edit(c, in)
	require.ErrorAs(t, err, &verrs)
	require.Equal(t, consultation.ValidationError{Field: "medications[1].id", Message: "medication_not_found"}, verrs[0])
}

func TestEdit_ARetiredSymptomItHadStaysAndANewOneIsRefused(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	retiredLater := tempSymptom(t, w.pool, "Sarpullido", true)
	alreadyRetired := tempSymptom(t, w.pool, "Hipo", false)
	c, err := w.svc.CreateConsultation(context.Background(), w.childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: w.day, Photo: samplePhoto(), SymptomCodes: []string{retiredLater},
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 6, DurationDays: 7, StartTime: strPtr("08:00")}},
	})
	require.NoError(t, err)
	_, err = w.pool.Exec(context.Background(), `UPDATE symptoms SET active = false WHERE code = $1`, retiredLater)
	require.NoError(t, err)
	saved := w.get(t, c.ID)

	got, err := w.edit(saved, inputOf(saved))
	require.NoError(t, err)
	require.Equal(t, retiredLater, got.Symptoms[0].Code)

	in := inputOf(got)
	in.SymptomCodes = append(in.SymptomCodes, alreadyRetired)
	_, err = w.edit(got, in)
	require.ErrorIs(t, err, consultation.ErrSymptomNotAvailable)
}

func TestEdit_ThePhotoIsReplacedAndTheCapStillHolds(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	in := inputOf(c)
	in.Photo = testJPEG
	got, err := w.edit(c, in)
	require.NoError(t, err)
	require.Equal(t, testJPEG, got.Photo, "replacing doesn't count as another photo")

	// A consultation saved without a photo at the cap can't get one by editing either.
	_, err = w.pool.Exec(context.Background(), `UPDATE consultations SET photo = '' WHERE id = $1`, c.ID)
	require.NoError(t, err)
	fillPhotos(t, w.pool, w.childID, consultation.MaxPhotosPerAccount)
	saved := w.get(t, c.ID)
	in = inputOf(saved)
	in.Photo = testJPEG
	_, err = w.edit(saved, in)
	require.ErrorIs(t, err, consultation.ErrPhotoLimit)
}

func TestEdit_TheFreePlanKeepsOneActiveTreatment(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	active := w.consult(t, false)
	old := w.consult(t, false, consultation.CreateMedicationInput{Name: "Paracetamol", FrequencyHours: 8, DurationDays: 1, StartTime: strPtr("08:00")})
	_, err := w.pool.Exec(context.Background(), `UPDATE accounts SET plan = 'free' WHERE id = $1`, w.editor)
	require.NoError(t, err)

	in := inputOf(old)
	in.Medications = append(in.Medications, consultation.UpdateMedicationInput{Name: "Jarabe", FrequencyHours: 8, DurationDays: 5, StartTime: strPtr("09:00")})
	_, err = w.edit(old, in)
	var planErr *consultation.PlanLimitError
	require.ErrorAs(t, err, &planErr)
	require.Equal(t, consultation.PlanLimitActiveTreatment, planErr.Reason)
	require.Len(t, w.get(t, old.ID).Medications, 1, "nothing is saved")

	in = inputOf(old)
	in.DoctorName = "Dr. Pérez"
	_, err = w.edit(old, in)
	require.NoError(t, err, "an edit that adds no dose ahead is fine")

	in = inputOf(active)
	in.Medications[0].FrequencyHours = 8
	_, err = w.edit(active, in)
	require.NoError(t, err, "the consultation that is the active treatment is edited")
}

func TestEdit_AnEditOnAnOldVersionIsAConflict(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	in := inputOf(c)
	in.DoctorName = "Primera"
	_, err := w.edit(c, in)
	require.NoError(t, err)

	in = inputOf(c) // the version the second form was opened with
	in.DoctorName = "Segunda"
	_, err = w.edit(c, in)
	require.ErrorIs(t, err, consultation.ErrEditConflict)
	require.Equal(t, "Primera", w.get(t, c.ID).DoctorName)
}

func TestEdit_TwoEditsAtOnceNeverMix(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i, name := range []string{"Uno", "Dos"} {
		wg.Add(1)
		go func(i int, name string) {
			defer wg.Done()
			in := inputOf(c)
			in.DoctorName = name
			in.Medications[0].FrequencyHours = 8 + 4*i
			_, errs[i] = w.edit(c, in)
		}(i, name)
	}
	wg.Wait()

	conflicts := 0
	for _, err := range errs {
		if err != nil {
			require.ErrorIs(t, err, consultation.ErrEditConflict)
			conflicts++
		}
	}
	require.Equal(t, 1, conflicts, "one edit is saved whole, the other is told")
	got := w.get(t, c.ID)
	want := map[string]int{"Uno": 8, "Dos": 12}[got.DoctorName]
	require.Equal(t, want, got.Medications[0].FrequencyHours, "the doctor and the schedule come from the same edit")
}

func TestEdit_ErrorsBeforeSaving(t *testing.T) {
	w := newEditWorld(t, account.PlanPaid)
	c := w.consult(t, false)

	_, err := w.svc.UpdateConsultation(context.Background(), c.ID, inputOf(c), uuid.Nil)
	require.Error(t, err, "an edit always has an author")

	in := inputOf(c)
	in.ExpectedVersion = time.Time{}
	in.Medications = nil
	_, err = w.edit(c, in)
	var verrs consultation.ValidationErrors
	require.ErrorAs(t, err, &verrs)
	fields := map[string]bool{}
	for _, e := range verrs {
		fields[e.Field] = true
	}
	require.True(t, fields["expectedVersion"])
	require.True(t, fields["medications"], "a consultation keeps at least one medication")

	_, err = w.svc.UpdateConsultation(context.Background(), uuid.New(), inputOf(c), w.editor)
	require.ErrorIs(t, err, consultation.ErrConsultationNotFound)
}
