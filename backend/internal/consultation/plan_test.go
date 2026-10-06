package consultation_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/030-reglas-plan-gratis: a free account keeps one consultation with an active treatment at a time and can't
// save a consultation only as a record; a paid account has neither limit. Nothing already saved is ever hidden.

// activeInput is a consultation of today whose treatment (3 days, every 8 h, from 00:00 UTC) still has doses ahead.
func activeInput() consultation.CreateConsultationInput {
	n := time.Now().UTC()
	return consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, time.UTC), Photo: samplePhoto(),
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 3, StartTime: strPtr("00:00")}},
	}
}

func requirePlanLimit(t *testing.T, err error, reason string) {
	t.Helper()
	require.ErrorIs(t, err, consultation.ErrPlanLimit)
	var limitErr *consultation.PlanLimitError
	require.ErrorAs(t, err, &limitErr)
	require.Equal(t, reason, limitErr.Reason)
	require.Contains(t, err.Error(), reason)
}

func TestPlan_Free_SecondActiveTreatmentIsRefusedAndNothingIsSaved(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createFreeTestChild(t, pool)

	_, err := svc.CreateConsultation(context.Background(), childID, activeInput())
	require.NoError(t, err)

	_, err = svc.CreateConsultation(context.Background(), childID, activeInput())

	requirePlanLimit(t, err, consultation.PlanLimitActiveTreatment)
	require.Equal(t, 1, countConsultations(t, pool, childID), "the refused consultation was not saved")
}

func TestPlan_Free_EndingTheTreatmentFreesTheNextOne(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createFreeTestChild(t, pool)
	first, err := svc.CreateConsultation(context.Background(), childID, activeInput())
	require.NoError(t, err)

	_, err = svc.EndTreatment(context.Background(), first.ID, first.Medications[0].ID)
	require.NoError(t, err)

	_, err = svc.CreateConsultation(context.Background(), childID, activeInput())
	require.NoError(t, err)
	require.Equal(t, 2, countConsultations(t, pool, childID), "the first one is still there")
}

func TestPlan_Free_ATreatmentThatAlreadyFinishedDoesNotCount(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createFreeTestChild(t, pool)
	// consultationInput is dated 2026-01-15, so every dose of it is long past.
	_, err := svc.CreateConsultation(context.Background(), childID, consultationInput())
	require.NoError(t, err)

	_, err = svc.CreateConsultation(context.Background(), childID, activeInput())
	require.NoError(t, err)
	// ...and the one just saved is the active one now.
	_, err = svc.CreateConsultation(context.Background(), childID, activeInput())
	requirePlanLimit(t, err, consultation.PlanLimitActiveTreatment)
}

func TestPlan_Free_RecordOnlyIsRefusedEvenWithNothingActive(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createFreeTestChild(t, pool)

	_, err := svc.CreateConsultation(context.Background(), childID, recordOnlyInput(medicationWithoutStart()))

	requirePlanLimit(t, err, consultation.PlanLimitRecordOnly)
	require.Equal(t, 0, countConsultations(t, pool, childID))
}

func TestPlan_Free_TheLimitIsTheAccountsNotTheChilds(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	children := createChildren(t, pool, account.PlanFree, 2) // an account downgraded from the paid plan keeps its children
	_, err := svc.CreateConsultation(context.Background(), children[0], activeInput())
	require.NoError(t, err)

	_, err = svc.CreateConsultation(context.Background(), children[1], activeInput())

	requirePlanLimit(t, err, consultation.PlanLimitActiveTreatment)
}

func TestPlan_Free_OtherAccountsTreatmentsDoNotCount(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	_, err := svc.CreateConsultation(context.Background(), createFreeTestChild(t, pool), activeInput())
	require.NoError(t, err)

	_, err = svc.CreateConsultation(context.Background(), createFreeTestChild(t, pool), activeInput())

	require.NoError(t, err)
}

func TestPlan_Paid_HasNeitherLimit(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool) // paid

	for i := 0; i < 3; i++ {
		_, err := svc.CreateConsultation(context.Background(), childID, activeInput())
		require.NoError(t, err)
	}
	_, err := svc.CreateConsultation(context.Background(), childID, recordOnlyInput(medicationWithoutStart()))
	require.NoError(t, err)
	require.Equal(t, 4, countConsultations(t, pool, childID))
}

func TestPlan_Free_TwoRequestsAtOnceStartOnlyOneTreatment(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createFreeTestChild(t, pool)

	const attempts = 4
	errs := make([]error, attempts)
	var wg sync.WaitGroup
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = svc.CreateConsultation(context.Background(), childID, activeInput())
		}(i)
	}
	wg.Wait()

	saved := 0
	for _, err := range errs {
		if err == nil {
			saved++
			continue
		}
		var limitErr *consultation.PlanLimitError
		require.True(t, errors.As(err, &limitErr), "the others are refused by the plan, not by anything else: %v", err)
	}
	require.Equal(t, 1, saved)
	require.Equal(t, 1, countConsultations(t, pool, childID))
}

func TestPlan_UnknownChildStillSaysChildNotFound(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))

	_, err := svc.CreateConsultation(context.Background(), uuid.New(), activeInput())

	require.ErrorIs(t, err, consultation.ErrChildNotFound)
}

func TestHandler_CreateConsultation_FreePlanLimits(t *testing.T) {
	pool := testPool(t)
	childID := createFreeTestChild(t, pool)
	router, _ := routerWithPool(t)
	path := "/children/" + childID.String() + "/consultations"
	body := func(extra map[string]any) map[string]any {
		b := map[string]any{
			"doctorName": "Dra. López", "consultDate": time.Now().Format("2006-01-02"), "photoBase64": base64.StdEncoding.EncodeToString([]byte("x")),
			"utcOffsetMinutes": 0,
			"medications":      []map[string]any{{"name": "Amoxicilina", "frequencyHours": 8, "durationDays": 3, "startTime": "00:00"}},
		}
		for k, v := range extra {
			b[k] = v
		}
		return b
	}
	decode := func(raw *bytes.Buffer) map[string]any {
		var resp map[string]any
		require.NoError(t, json.Unmarshal(raw.Bytes(), &resp))
		return resp
	}

	require.Equal(t, http.StatusCreated, doPostPath(t, router, path, body(nil)).Code)

	second := doPostPath(t, router, path, body(nil))
	require.Equal(t, http.StatusUnprocessableEntity, second.Code)
	resp := decode(second.Body)
	require.Equal(t, "freemium_consultation_limit_exceeded", resp["error"])
	require.Equal(t, "active_treatment", resp["reason"])
	require.NotEmpty(t, resp["message"])

	record := doPostPath(t, router, path, body(map[string]any{
		"recordOnly":  true,
		"consultDate": "2026-01-15",
		"medications": []map[string]any{{"name": "Amoxicilina", "frequencyHours": 8, "durationDays": 7}},
	}))
	require.Equal(t, http.StatusUnprocessableEntity, record.Code)
	resp = decode(record.Body)
	require.Equal(t, "freemium_consultation_limit_exceeded", resp["error"])
	require.Equal(t, "record_only", resp["reason"])
	require.Contains(t, resp["message"], "paid plan")

	// What was saved is still all there: the refused ones never replaced anything.
	list := doGet(t, router, path)
	require.Equal(t, http.StatusOK, list.Code)
	require.Len(t, decode(list.Body)["consultations"], 1)
}
