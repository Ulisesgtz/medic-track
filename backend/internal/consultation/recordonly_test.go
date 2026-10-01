package consultation_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// Specs/024: a consultation saved only as a record has no schedule: no start time, no doses.

func recordOnlyInput(meds ...consultation.CreateMedicationInput) consultation.CreateConsultationInput {
	return consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Now().AddDate(0, -3, 0), Photo: samplePhoto(),
		RecordOnly: true, Medications: meds,
	}
}

func medicationWithoutStart() consultation.CreateMedicationInput {
	return consultation.CreateMedicationInput{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 7}
}

func TestService_CreateConsultation_RecordOnly_NeedsNoStartTime(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)

	c, err := svc.CreateConsultation(context.Background(), childID, recordOnlyInput(medicationWithoutStart()))

	require.NoError(t, err)
	require.True(t, c.RecordOnly)
	require.Len(t, c.Medications, 1)
	require.Nil(t, c.Medications[0].StartTime)
	require.Empty(t, c.Medications[0].Doses)
}

func TestService_CreateConsultation_RecordOnly_DiscardsAStartTimeThatArrives(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	withStart := medicationWithoutStart()
	withStart.StartTime = strPtr("08:00")
	bad := medicationWithoutStart()
	bad.StartTime = strPtr("99:99")

	c, err := svc.CreateConsultation(context.Background(), childID, recordOnlyInput(withStart, bad))

	// The server, not the client, guarantees "no schedule": neither is kept and neither is validated.
	require.NoError(t, err)
	for _, m := range c.Medications {
		require.Nil(t, m.StartTime)
		require.Empty(t, m.Doses)
	}
	var doses int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM doses d JOIN medications m ON m.id = d.medication_id WHERE m.consultation_id = $1`, c.ID).Scan(&doses))
	require.Zero(t, doses)
}

func TestService_CreateConsultation_RecordOnly_StillValidatesTheRest(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)

	input := recordOnlyInput(consultation.CreateMedicationInput{Name: "", FrequencyHours: 0, DurationDays: 0})
	input.DoctorName = ""
	_, err := svc.CreateConsultation(context.Background(), childID, input)

	var verrs consultation.ValidationErrors
	require.ErrorAs(t, err, &verrs)
	fields := make([]string, 0, len(verrs))
	for _, e := range verrs {
		fields = append(fields, e.Field)
	}
	require.ElementsMatch(t, []string{"doctorName", "medications[0].name", "medications[0].frequencyHours", "medications[0].durationDays"}, fields)
}

func TestService_CreateConsultation_WithoutTheMark_StillNeedsAStartTime(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	input := recordOnlyInput(medicationWithoutStart())
	input.RecordOnly = false

	_, err := svc.CreateConsultation(context.Background(), childID, input)

	var verrs consultation.ValidationErrors
	require.ErrorAs(t, err, &verrs)
	require.Equal(t, "medications[0].startTime", verrs[0].Field)
}

func TestRepository_RecordOnly_IsStoredAndReadBack(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	svc := consultation.NewService(repo)
	childID := createTestChild(t, pool)
	ctx := context.Background()

	record, err := svc.CreateConsultation(ctx, childID, recordOnlyInput(medicationWithoutStart()))
	require.NoError(t, err)
	normalInput := recordOnlyInput(validMedication())
	normalInput.RecordOnly = false
	normalInput.ConsultDate = time.Now()
	normal, err := svc.CreateConsultation(ctx, childID, normalInput)
	require.NoError(t, err)

	detail, err := repo.GetByID(ctx, record.ID)
	require.NoError(t, err)
	require.True(t, detail.RecordOnly)
	require.Empty(t, detail.Medications[0].Doses)
	normalDetail, err := repo.GetByID(ctx, normal.ID)
	require.NoError(t, err)
	require.False(t, normalDetail.RecordOnly)
	require.NotEmpty(t, normalDetail.Medications[0].Doses)

	list, err := repo.GetByChild(ctx, childID)
	require.NoError(t, err)
	byID := map[string]bool{}
	for _, c := range list {
		byID[c.ID.String()] = c.RecordOnly
	}
	require.Equal(t, map[string]bool{record.ID.String(): true, normal.ID.String(): false}, byID)
}

func TestRepository_GetOverview_IgnoresARecordOnlyConsultation(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	svc := consultation.NewService(repo)
	childID := createTestChild(t, pool)
	input := recordOnlyInput(medicationWithoutStart())
	input.ConsultDate = time.Now()
	_, err := svc.CreateConsultation(context.Background(), childID, input)
	require.NoError(t, err)

	now := time.Now()
	overview, err := repo.GetOverview(context.Background(), childID, now.Add(-12*time.Hour), now.Add(12*time.Hour), now)

	require.NoError(t, err)
	require.Empty(t, overview.Doses)
	require.Nil(t, overview.ActiveTreatment)
}

func TestHandler_CreateConsultation_RecordOnly(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	rec := doPostPath(t, router, "/children/"+childID.String()+"/consultations", map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "2026-01-15",
		"photoBase64": base64.StdEncoding.EncodeToString([]byte("x")),
		"recordOnly":  true,
		"medications": []map[string]any{{"name": "Amoxicilina", "frequencyHours": 8, "durationDays": 7}},
	})

	require.Equal(t, http.StatusCreated, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, true, resp["recordOnly"])
	med := resp["medications"].([]any)[0].(map[string]any)
	require.Nil(t, med["startTime"])
	require.Empty(t, med["doses"])

	id := resp["id"].(string)
	detail := doGet(t, router, "/consultations/"+id)
	require.Equal(t, http.StatusOK, detail.Code)
	var detailBody map[string]any
	require.NoError(t, json.Unmarshal(detail.Body.Bytes(), &detailBody))
	require.Equal(t, true, detailBody["recordOnly"])

	list := doGet(t, router, "/children/"+childID.String()+"/consultations")
	var listBody map[string]any
	require.NoError(t, json.Unmarshal(list.Body.Bytes(), &listBody))
	require.Equal(t, true, listBody["consultations"].([]any)[0].(map[string]any)["recordOnly"])
}

func TestHandler_CreateConsultation_WithoutRecordOnlyIsFalse(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)

	rec := doPostPath(t, router, "/children/"+childID.String()+"/consultations", map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "2026-01-15",
		"photoBase64": base64.StdEncoding.EncodeToString([]byte("x")),
		"medications": []map[string]any{validMedicationPayload()},
	})

	require.Equal(t, http.StatusCreated, rec.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, false, resp["recordOnly"])
	require.NotEmpty(t, resp["medications"].([]any)[0].(map[string]any)["doses"])
}
