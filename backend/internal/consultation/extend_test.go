package consultation_test

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/020: extending a treatment. yesterdaysConsultation (dosestatus_read_test.go) has one medication every 8 h for 2
// days from yesterday 08:00 UTC: six doses, the first ones long past and unmarked ("sin registrar"), the last one
// (tomorrow 00:00) still ahead. How many are unregistered depends on the hour the suite runs, so the tests read the
// proposal from the detail instead of hard-coding it.

func proposalOf(t *testing.T, svc *consultation.Service, c *consultation.Consultation) int {
	t.Helper()
	got, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)
	require.Positive(t, got.Medications[0].ExtendableDoses, "yesterday 08:00 is long unregistered")
	return got.Medications[0].ExtendableDoses
}

func TestExtendTreatment_AddsTheConfirmedNumberAtTheEndAndChangesNothingThatExists(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	n := proposalOf(t, svc, c)
	before, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)
	med := before.Medications[0]
	last := med.Doses[len(med.Doses)-1].ScheduledAt

	extended, err := svc.ExtendTreatment(context.Background(), c.ID, med.ID, n)

	require.NoError(t, err)
	require.Len(t, extended.Doses, 6+n)
	for i, d := range med.Doses {
		require.True(t, d.ScheduledAt.Equal(extended.Doses[i].ScheduledAt), "an original dose does not move")
		require.Equal(t, d.Taken, extended.Doses[i].Taken)
		require.Equal(t, d.Status, extended.Doses[i].Status, "the unregistered ones stay unregistered: they are history")
	}
	for k := 1; k <= n; k++ {
		added := extended.Doses[5+k]
		require.True(t, added.ScheduledAt.Equal(last.Add(time.Duration(k)*8*time.Hour)), "dose %d is %d frequencies after the last", k, k)
		require.Equal(t, consultation.DoseStatusPending, added.Status)
		require.False(t, added.Taken)
	}
	require.Zero(t, extended.ExtendableDoses, "what was proposed is covered")
	require.Len(t, extended.Extensions, 1)
	require.Equal(t, n, extended.Extensions[0].ProposedDoses)
	require.Equal(t, n, extended.Extensions[0].AddedDoses)
	require.False(t, extended.Extensions[0].Manual())
}

func TestExtendTreatment_ANumberOfTheParentsOwnIsRecordedAsManual(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	n := proposalOf(t, svc, c)

	extended, err := svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, n+2)

	require.NoError(t, err)
	require.Len(t, extended.Doses, 6+n+2)
	require.Equal(t, n, extended.Extensions[0].ProposedDoses)
	require.Equal(t, n+2, extended.Extensions[0].AddedDoses)
	require.True(t, extended.Extensions[0].Manual())
	require.Zero(t, extended.ExtendableDoses, "a bigger or smaller number still covers what was unregistered")
}

func TestExtendTreatment_TheSameDosesAreNeverCoveredTwice(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	n := proposalOf(t, svc, c)
	_, err := svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, n)
	require.NoError(t, err)

	_, err = svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, n)

	require.ErrorIs(t, err, consultation.ErrNothingToExtend)
	got, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)
	require.Len(t, got.Medications[0].Doses, 6+n, "nothing was added the second time")
	require.Len(t, got.Medications[0].Extensions, 1)
}

func TestExtendTreatment_TwoAtTheSameTimeAddOnlyOnce(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	n := proposalOf(t, svc, c)

	var wg sync.WaitGroup
	results := make([]error, 6)
	for i := range results {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, results[i] = svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, n)
		}()
	}
	wg.Wait()

	succeeded := 0
	for _, err := range results {
		if err == nil {
			succeeded++
		} else {
			require.ErrorIs(t, err, consultation.ErrNothingToExtend)
		}
	}
	require.Equal(t, 1, succeeded)
	got, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)
	require.Len(t, got.Medications[0].Doses, 6+n)
}

func TestExtendTreatment_NewUnregisteredDosesAreProposedAgain(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	svc := consultation.NewService(repo)
	childID := createTestChild(t, pool)
	n := time.Now().UTC()
	yesterday := time.Date(n.Year(), n.Month(), n.Day()-1, 0, 0, 0, 0, time.UTC)
	c, err := svc.CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: yesterday, Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 2, StartTime: strPtr("08:00")}},
	})
	require.NoError(t, err)
	first := proposalOf(t, svc, c)
	extended, err := svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, 2)
	require.NoError(t, err)
	lastAdded := extended.Doses[len(extended.Doses)-1].ScheduledAt

	// Days later, the two added doses came and went unmarked.
	consultation.SetNow(repo, func() time.Time { return lastAdded.Add(9 * time.Hour) })
	got, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)

	// Those covered then are not proposed again; every other dose (the ones still ahead then, and the two added) is now
	// unregistered and proposed.
	require.Equal(t, len(got.Medications[0].Doses)-first, got.Medications[0].ExtendableDoses)
	proposed := got.Medications[0].ExtendableDoses
	again, err := svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, 2)
	require.NoError(t, err)
	require.Len(t, again.Extensions, 2)
	require.Equal(t, proposed, again.Extensions[1].ProposedDoses)
	require.Zero(t, again.ExtendableDoses)
}

func TestExtendTreatment_TheLimitsOfTheNumber(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	for _, bad := range []int{0, -1, 61, 1000} {
		_, err := svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, bad)
		var v consultation.ValidationErrors
		require.ErrorAs(t, err, &v, "%d", bad)
		require.Equal(t, "doses", v[0].Field)
	}
	got, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)
	require.Len(t, got.Medications[0].Doses, 6, "an invalid number adds nothing")

	extended, err := svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, consultation.MaxExtensionDoses)
	require.NoError(t, err)
	require.Len(t, extended.Doses, 6+consultation.MaxExtensionDoses)
}

func TestCreateConsultation_SaysWhatCouldBeExtendedLikeTheDetailDoes(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)

	detail, err := svc.GetConsultation(context.Background(), c.ID)

	require.NoError(t, err)
	require.Positive(t, c.Medications[0].ExtendableDoses)
	require.Equal(t, detail.Medications[0].ExtendableDoses, c.Medications[0].ExtendableDoses)
}

func TestExtendTreatment_SingleDose(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	extended, err := svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, 1)
	require.NoError(t, err)
	require.Len(t, extended.Doses, 7)
}

func TestExtendTreatment_AnEndedTreatmentCannotBeExtended(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	_, err := svc.EndTreatment(context.Background(), c.ID, c.Medications[0].ID)
	require.NoError(t, err)

	_, err = svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, 2)

	require.ErrorIs(t, err, consultation.ErrNothingToExtend)
	got, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)
	require.Zero(t, got.Medications[0].ExtendableDoses, "nothing is proposed once it ended")
}

func TestExtendTreatment_NothingUnregisteredNothingToExtend(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	// Today's first dose is at 23:59 UTC: no dose has come yet. (A consultation cannot be dated tomorrow, so the start
	// can't just be "a few hours from now": after 21:00 UTC that is already tomorrow.)
	now := time.Now().UTC()
	if now.Hour() == 23 && now.Minute() >= 58 {
		t.Skip("the minute before midnight UTC: the first dose of the day is about to come")
	}
	c, err := svc.CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC), Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{{Name: "Nueva", FrequencyHours: 24, DurationDays: 1, StartTime: strPtr("23:59")}},
	})
	require.NoError(t, err)

	_, err = svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, 1)

	require.ErrorIs(t, err, consultation.ErrNothingToExtend)
}

func TestExtendTreatment_OnlyThatMedicationInThatConsultation(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	_, _, other := yesterdaysConsultation(t)

	_, err := svc.ExtendTreatment(context.Background(), c.ID, uuid.New(), 1)
	require.ErrorIs(t, err, consultation.ErrMedicationNotFound)
	_, err = svc.ExtendTreatment(context.Background(), c.ID, other.Medications[0].ID, 1)
	require.ErrorIs(t, err, consultation.ErrMedicationNotFound)
}

func TestExtendTreatment_TheAddedDosesAreOrdinaryDoses(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	n := time.Now().UTC()
	yesterday := time.Date(n.Year(), n.Month(), n.Day()-1, 0, 0, 0, 0, time.UTC)
	c, err := svc.CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: yesterday, Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 2, StartTime: strPtr("08:00")}},
	})
	require.NoError(t, err)
	extended, err := svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, 3)
	require.NoError(t, err)
	lastAdded := extended.Doses[len(extended.Doses)-1]

	// The parent can mark one like any other.
	marked, err := svc.MarkDose(context.Background(), c.ID, lastAdded.ID, true)
	require.NoError(t, err)
	require.Equal(t, consultation.DoseStatusTaken, marked.Status)

	// The active treatment now ends at the last added dose.
	overview, err := svc.GetChildOverview(context.Background(), childID, lastAdded.ScheduledAt.Add(-2*time.Hour), lastAdded.ScheduledAt.Add(time.Hour))
	require.NoError(t, err)
	require.NotNil(t, overview.ActiveTreatment)
	require.True(t, overview.ActiveTreatment.EndsAt.Equal(lastAdded.ScheduledAt), "ends at %s, got %s", lastAdded.ScheduledAt, overview.ActiveTreatment.EndsAt)
	var shown bool
	for _, d := range overview.Doses {
		shown = shown || d.ID == lastAdded.ID
	}
	require.True(t, shown, "an added dose shows in the day's doses like the rest")
}

func TestExtendTreatment_IsRecordedForTheAccountThatOwnsTheConsultation(t *testing.T) {
	pool := testPool(t)
	svc, childID, c := yesterdaysConsultation(t)
	n := proposalOf(t, svc, c)
	_, err := svc.ExtendTreatment(context.Background(), c.ID, c.Medications[0].ID, n+1)
	require.NoError(t, err)

	var accountOfChild, accountOfExtension uuid.UUID
	var proposed, added int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT account_id FROM children WHERE id = $1`, childID).Scan(&accountOfChild))
	require.NoError(t, pool.QueryRow(context.Background(), `
		SELECT account_id, proposed_doses, added_doses FROM medication_extensions WHERE medication_id = $1
	`, c.Medications[0].ID).Scan(&accountOfExtension, &proposed, &added))
	require.Equal(t, accountOfChild, accountOfExtension)
	require.Equal(t, n, proposed)
	require.Equal(t, n+1, added)
}

func TestExtendTreatment_Handler(t *testing.T) {
	svc, _, c := yesterdaysConsultation(t)
	n := proposalOf(t, svc, c)
	router, _ := routerWithPool(t)
	path := "/consultations/" + c.ID.String() + "/medications/" + c.Medications[0].ID.String() + "/extend"

	rec := doPostPath(t, router, path, map[string]any{"doses": n + 1})

	require.Equal(t, http.StatusOK, rec.Code)
	var med struct {
		ExtendableDoses int `json:"extendableDoses"`
		Extensions      []struct {
			ProposedDoses int  `json:"proposedDoses"`
			AddedDoses    int  `json:"addedDoses"`
			Manual        bool `json:"manual"`
		} `json:"extensions"`
		Doses []struct{} `json:"doses"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &med))
	require.Zero(t, med.ExtendableDoses)
	require.Len(t, med.Doses, 6+n+1)
	require.Len(t, med.Extensions, 1)
	require.Equal(t, n, med.Extensions[0].ProposedDoses)
	require.Equal(t, n+1, med.Extensions[0].AddedDoses)
	require.True(t, med.Extensions[0].Manual)

	// The detail carries the same.
	detail := doGet(t, router, "/consultations/"+c.ID.String())
	require.Contains(t, detail.Body.String(), `"extendableDoses":0`)
	require.Contains(t, detail.Body.String(), `"manual":true`)

	// A second attempt is refused, nothing is added.
	again := doPostPath(t, router, path, map[string]any{"doses": n})
	require.Equal(t, http.StatusBadRequest, again.Code)
	require.JSONEq(t, `{"error":"validation_error","message":"One or more fields are invalid",
		"details":[{"field":"medicationId","message":"nothing_to_extend"}]}`, again.Body.String())
}

func TestExtendTreatment_HandlerRejections(t *testing.T) {
	_, _, c := yesterdaysConsultation(t)
	router, _ := routerWithPool(t)
	path := "/consultations/" + c.ID.String() + "/medications/" + c.Medications[0].ID.String() + "/extend"

	for _, body := range []map[string]any{{}, {"doses": 0}, {"doses": 61}, {"doses": -3}} {
		rec := doPostPath(t, router, path, body)
		require.Equal(t, http.StatusBadRequest, rec.Code, "%v", body)
		require.Contains(t, rec.Body.String(), `"field":"doses"`)
	}
	// Not a whole number, or not JSON.
	require.Equal(t, http.StatusBadRequest, doPostPath(t, router, path, map[string]any{"doses": 2.5}).Code)
	require.Equal(t, http.StatusBadRequest, doPostPath(t, router, path, map[string]any{"doses": "tres"}).Code)

	for _, bad := range []string{
		"/consultations/" + c.ID.String() + "/medications/" + uuid.NewString() + "/extend",
		"/consultations/" + c.ID.String() + "/medications/not-a-uuid/extend",
		"/consultations/not-a-uuid/medications/" + c.Medications[0].ID.String() + "/extend",
	} {
		require.Equal(t, http.StatusNotFound, doPostPath(t, router, bad, map[string]any{"doses": 2}).Code, bad)
	}
}
