package consultation_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"math/rand/v2"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/012-sintomas-notas-consulta: symptoms marked on a consultation, stored with its child and account.

func accountOf(t *testing.T, pool *pgxpool.Pool, childID uuid.UUID) uuid.UUID {
	t.Helper()
	var accountID uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT account_id FROM children WHERE id = $1`, childID).Scan(&accountID))
	return accountID
}

// tempSymptom adds a symptom only this test uses (far after the seeded ones, so it never shifts them) and removes it,
// with the rows that reference it, when the test ends.
func tempSymptom(t *testing.T, pool *pgxpool.Pool, name string, active bool) string {
	t.Helper()
	code := "test_" + uuid.NewString()[:8]
	_, err := pool.Exec(context.Background(),
		`INSERT INTO symptoms (code, name, category, sort_order, active) VALUES ($1, $2, 'Pruebas', $3, $4)`,
		code, name, 100_000+rand.IntN(1_000_000_000), active)
	require.NoError(t, err)
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = pool.Exec(ctx, `DELETE FROM consultation_symptoms WHERE symptom_code = $1`, code)
		_, _ = pool.Exec(ctx, `DELETE FROM symptoms WHERE code = $1`, code)
	})
	return code
}

func consultationInput(codes ...string) consultation.CreateConsultationInput {
	return consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), Photo: samplePhoto(),
		Notes: "Comió mariscos el domingo", SymptomCodes: codes,
		Medications: []consultation.CreateMedicationInput{validMedication()},
	}
}

func countConsultations(t *testing.T, pool *pgxpool.Pool, childID uuid.UUID) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM consultations WHERE child_id = $1`, childID).Scan(&n))
	return n
}

func TestService_CreateConsultation_SavesSymptomsOnceWithTheChildAndAccount(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)

	c, err := svc.CreateConsultation(context.Background(), childID, consultationInput("cough", "fever", "cough"))

	require.NoError(t, err)
	// Catalog order (Fiebre before Tos), and the repeated code stored once.
	require.Equal(t, []consultation.Symptom{
		{Code: "fever", Name: "Fiebre", Category: "General"},
		{Code: "cough", Name: "Tos", Category: "Respiratorio"},
	}, c.Symptoms)

	rows, err := pool.Query(context.Background(),
		`SELECT child_id, account_id FROM consultation_symptoms WHERE consultation_id = $1`, c.ID)
	require.NoError(t, err)
	defer rows.Close()
	n := 0
	for rows.Next() {
		var gotChild, gotAccount uuid.UUID
		require.NoError(t, rows.Scan(&gotChild, &gotAccount))
		require.Equal(t, childID, gotChild)
		require.Equal(t, accountOf(t, pool, childID), gotAccount)
		n++
	}
	require.Equal(t, 2, n)
}

func TestRepository_SymptomsAreReadInCatalogOrderWithTheNotes(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	svc := consultation.NewService(repo)
	childID := createTestChild(t, pool)
	notes := "Fiebre y tos desde el lunes; comió poco 🌡️"
	input := consultationInput("vomiting", "fever", "cough")
	input.Notes = notes
	created, err := svc.CreateConsultation(context.Background(), childID, input)
	require.NoError(t, err)
	_, err = svc.CreateConsultation(context.Background(), childID, consultationInput())
	require.NoError(t, err)

	got, err := repo.GetByID(context.Background(), created.ID)
	require.NoError(t, err)
	require.Equal(t, notes, got.Notes)
	require.Equal(t, []string{"fever", "cough", "vomiting"}, []string{got.Symptoms[0].Code, got.Symptoms[1].Code, got.Symptoms[2].Code})

	list, err := repo.GetByChild(context.Background(), childID)
	require.NoError(t, err)
	require.Len(t, list, 2)
	names := map[uuid.UUID][]string{}
	for _, c := range list {
		names[c.ID] = c.SymptomNames
	}
	require.Equal(t, []string{"Fiebre", "Tos", "Vómito"}, names[created.ID])
	for id, n := range names {
		if id != created.ID {
			require.Empty(t, n)
		}
	}
}

func TestRepository_GetByID_NoSymptomsIsAnEmptyList(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	c, err := svc.CreateConsultation(context.Background(), createTestChild(t, pool), consultationInput())
	require.NoError(t, err)

	got, err := svc.GetConsultation(context.Background(), c.ID)

	require.NoError(t, err)
	require.NotNil(t, got.Symptoms)
	require.Empty(t, got.Symptoms)
}

// An unknown or retired symptom rejects the whole consultation: nothing is left half-saved (FR-010).
func TestService_CreateConsultation_UnavailableSymptomRollsBackEverything(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	retired := tempSymptom(t, pool, "Retirado", false)

	for name, codes := range map[string][]string{
		"unknown": {"fever", "not_a_symptom"},
		"retired": {"fever", retired},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := svc.CreateConsultation(context.Background(), childID, consultationInput(codes...))

			require.ErrorIs(t, err, consultation.ErrSymptomNotAvailable)
			require.Zero(t, countConsultations(t, pool, childID))
		})
	}
}

// A retired symptom is no longer offered, but the consultations that have it keep showing it (FR-008).
func TestRepository_ARetiredSymptomStaysOnItsConsultations(t *testing.T) {
	pool := testPool(t)
	repo := consultation.NewRepository(pool)
	childID := createTestChild(t, pool)
	code := tempSymptom(t, pool, "Síntoma de prueba", true)
	c, err := consultation.NewService(repo).CreateConsultation(context.Background(), childID, consultationInput(code))
	require.NoError(t, err)

	_, err = pool.Exec(context.Background(), `UPDATE symptoms SET active = false WHERE code = $1`, code)
	require.NoError(t, err)

	got, err := repo.GetByID(context.Background(), c.ID)
	require.NoError(t, err)
	require.Equal(t, []consultation.Symptom{{Code: code, Name: "Síntoma de prueba", Category: "Pruebas"}}, got.Symptoms)
	list, err := repo.GetByChild(context.Background(), childID)
	require.NoError(t, err)
	require.Equal(t, []string{"Síntoma de prueba"}, list[0].SymptomNames)
}

// The database itself keeps each row's child and account those of its consultation (FR-009, SC-004).
func TestConsultationSymptoms_TheDatabaseRejectsAnotherChildOrAccount(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	otherChild := createTestChild(t, pool)
	c, err := svc.CreateConsultation(context.Background(), childID, consultationInput())
	require.NoError(t, err)
	insert := `INSERT INTO consultation_symptoms (consultation_id, child_id, account_id, symptom_code) VALUES ($1, $2, $3, 'fever')`

	_, err = pool.Exec(context.Background(), insert, c.ID, childID, accountOf(t, pool, otherChild))
	require.Error(t, err, "another account")
	_, err = pool.Exec(context.Background(), insert, c.ID, otherChild, accountOf(t, pool, otherChild))
	require.Error(t, err, "another child (with its own account)")
	_, err = pool.Exec(context.Background(), insert, c.ID, childID, accountOf(t, pool, childID))
	require.NoError(t, err, "its own child and account")
}

func TestHandler_CreateConsultation_WithSymptoms(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	router, _ := routerWithPool(t)
	path := "/children/" + childID.String() + "/consultations"
	body := func(codes ...string) map[string]any {
		return map[string]any{
			"doctorName": "Dra. López", "consultDate": "2026-01-15",
			"photoBase64": base64.StdEncoding.EncodeToString([]byte("fake-jpeg")),
			"notes":       "Comió mariscos", "symptomCodes": codes,
			"medications": []map[string]any{validMedicationPayload()},
		}
	}

	rec := doPostPath(t, router, path, body("cough", "fever"))
	require.Equal(t, http.StatusCreated, rec.Code)
	var detail struct {
		ID       string            `json:"id"`
		Notes    string            `json:"notes"`
		Symptoms []json.RawMessage `json:"symptoms"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &detail))
	require.Equal(t, "Comió mariscos", detail.Notes)
	require.JSONEq(t, `{"code":"fever","name":"Fiebre","category":"General"}`, string(detail.Symptoms[0]))
	require.Len(t, detail.Symptoms, 2)

	rec = doPostPath(t, router, path, body())
	require.Equal(t, http.StatusCreated, rec.Code)
	require.Contains(t, rec.Body.String(), `"symptoms":[]`)

	var list struct {
		Consultations []struct {
			ID           string   `json:"id"`
			SymptomNames []string `json:"symptomNames"`
		} `json:"consultations"`
	}
	listRec := doGet(t, router, path)
	require.NoError(t, json.Unmarshal(listRec.Body.Bytes(), &list))
	require.Contains(t, listRec.Body.String(), `"symptomNames":[]`)
	for _, c := range list.Consultations {
		if c.ID == detail.ID {
			require.Equal(t, []string{"Fiebre", "Tos"}, c.SymptomNames)
		}
	}

	rec = doPostPath(t, router, path, body("fever", "not_a_symptom"))
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.JSONEq(t, `{"error":"validation_error","message":"One or more fields are invalid",
		"details":[{"field":"symptomCodes","message":"symptom_not_available"}]}`, rec.Body.String())
}
