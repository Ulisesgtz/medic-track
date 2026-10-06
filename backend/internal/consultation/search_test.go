package consultation_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/031-historial-busqueda-filtros: search and filters over a child's consultations, for the paid plan.

// historyCase describes one consultation of the fixture below.
type historyCase struct {
	doctor      string
	date        time.Time
	notes       string
	medications []string
	symptoms    []string
	recordOnly  bool
}

func day(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, time.UTC) }

// createHistory saves the cases for a child and returns their ids keyed by a short label.
func createHistory(t *testing.T, svc *consultation.Service, childID uuid.UUID, cases map[string]historyCase) map[string]uuid.UUID {
	t.Helper()
	ids := make(map[string]uuid.UUID, len(cases))
	for label, c := range cases {
		input := consultation.CreateConsultationInput{
			DoctorName: c.doctor, ConsultDate: c.date, Photo: samplePhoto(), Notes: c.notes,
			SymptomCodes: c.symptoms, RecordOnly: c.recordOnly,
		}
		for _, name := range c.medications {
			input.Medications = append(input.Medications, consultation.CreateMedicationInput{
				Name: name, FrequencyHours: 8, DurationDays: 3, StartTime: strPtr("08:00"),
			})
		}
		created, err := svc.CreateConsultation(context.Background(), childID, input)
		require.NoError(t, err, label)
		ids[label] = created.ID
	}
	return ids
}

// The fixture: four consultations, in the past (so none is an active treatment), with different doctors, medications,
// symptoms and dates, one of them only a record.
var historyFixture = map[string]historyCase{
	"c1": {doctor: "Dra. López", date: day(2026, 1, 10), notes: "Fiebre y tos del niño", medications: []string{"Amoxicilina 250 mg"}, symptoms: []string{"fever", "cough"}},
	"c2": {doctor: "Dr. Iván Robles", date: day(2026, 3, 5), notes: "Control", medications: []string{"Paracetamol"}, symptoms: []string{"fever"}},
	"c3": {doctor: "Dra. López", date: day(2026, 3, 20), notes: "", medications: []string{"Ibuprofeno", "Amoxicilina 500 mg"}, symptoms: []string{"cough"}},
	"c4": {doctor: "Dr. Iván Robles", date: day(2026, 6, 1), notes: "Revisión anual", medications: []string{"Vitamina D"}, recordOnly: true},
}

func historyChild(t *testing.T, pool *pgxpool.Pool, svc *consultation.Service) (uuid.UUID, map[string]uuid.UUID) {
	t.Helper()
	childID := createTestChild(t, pool) // paid
	return childID, createHistory(t, svc, childID, historyFixture)
}

func idsOf(list []consultation.Consultation) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(list))
	for _, c := range list {
		out = append(out, c.ID)
	}
	return out
}

func TestSearch_EveryCriterionAndTheirCombinations(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID, id := historyChild(t, pool, svc)

	d := func(y int, m time.Month, dd int) *time.Time { v := day(y, m, dd); return &v }
	cases := []struct {
		name   string
		search consultation.HistorySearch
		want   []string // labels, most recent first
	}{
		{"nothing: all of them", consultation.HistorySearch{}, []string{"c4", "c3", "c2", "c1"}},
		{"text in the doctor, no accent", consultation.HistorySearch{Q: "lopez"}, []string{"c3", "c1"}},
		{"text in the doctor, upper case and accent", consultation.HistorySearch{Q: "LÓPEZ"}, []string{"c3", "c1"}},
		{"text with spaces around", consultation.HistorySearch{Q: "  lopez  "}, []string{"c3", "c1"}},
		{"text in the notes: nino finds niño", consultation.HistorySearch{Q: "nino"}, []string{"c1"}},
		{"text in the notes: part of a word", consultation.HistorySearch{Q: "revisi"}, []string{"c4"}},
		{"text in a medication, part of it", consultation.HistorySearch{Q: "amox"}, []string{"c3", "c1"}},
		{"text in the second medication", consultation.HistorySearch{Q: "ibuprof"}, []string{"c3"}},
		{"text of a record-only medication", consultation.HistorySearch{Q: "vitamina"}, []string{"c4"}},
		{"text that is nowhere", consultation.HistorySearch{Q: "zzz"}, nil},
		{"a percent sign is text, not a wildcard", consultation.HistorySearch{Q: "%"}, nil},
		{"an underscore is text, not a wildcard", consultation.HistorySearch{Q: "_"}, nil},
		{"from, the day itself included", consultation.HistorySearch{From: d(2026, 3, 5)}, []string{"c4", "c3", "c2"}},
		{"to, the day itself included", consultation.HistorySearch{To: d(2026, 3, 5)}, []string{"c2", "c1"}},
		{"a single day", consultation.HistorySearch{From: d(2026, 3, 20), To: d(2026, 3, 20)}, []string{"c3"}},
		{"a range", consultation.HistorySearch{From: d(2026, 3, 1), To: d(2026, 3, 31)}, []string{"c3", "c2"}},
		{"a range in the future", consultation.HistorySearch{From: d(2099, 1, 1)}, nil},
		{"doctor", consultation.HistorySearch{Doctor: "Dra. López"}, []string{"c3", "c1"}},
		{"doctor, exactly as registered", consultation.HistorySearch{Doctor: "Dr. López"}, nil},
		{"medication", consultation.HistorySearch{Medication: "Amoxicilina 250 mg"}, []string{"c1"}},
		{"medication, the other one", consultation.HistorySearch{Medication: "Amoxicilina 500 mg"}, []string{"c3"}},
		{"one symptom", consultation.HistorySearch{SymptomCodes: []string{"fever"}}, []string{"c2", "c1"}},
		{"another symptom", consultation.HistorySearch{SymptomCodes: []string{"cough"}}, []string{"c3", "c1"}},
		{"two symptoms: all of them", consultation.HistorySearch{SymptomCodes: []string{"fever", "cough"}}, []string{"c1"}},
		{"kind treatment", consultation.HistorySearch{Kind: consultation.KindTreatment}, []string{"c3", "c2", "c1"}},
		{"kind record", consultation.HistorySearch{Kind: consultation.KindRecord}, []string{"c4"}},
		{"kind all", consultation.HistorySearch{Kind: consultation.KindAll}, []string{"c4", "c3", "c2", "c1"}},
		{"text and from", consultation.HistorySearch{Q: "lopez", From: d(2026, 2, 1)}, []string{"c3"}},
		{"text and kind, nothing both", consultation.HistorySearch{Q: "lopez", Kind: consultation.KindRecord}, nil},
		{"doctor and kind", consultation.HistorySearch{Doctor: "Dr. Iván Robles", Kind: consultation.KindRecord}, []string{"c4"}},
		{"symptom and range", consultation.HistorySearch{SymptomCodes: []string{"cough"}, To: d(2026, 2, 1)}, []string{"c1"}},
		{"everything at once", consultation.HistorySearch{
			Q: "amox", From: d(2026, 1, 1), To: d(2026, 3, 31), Doctor: "Dra. López", Medication: "Amoxicilina 500 mg",
			SymptomCodes: []string{"cough"}, Kind: consultation.KindTreatment,
		}, []string{"c3"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := svc.SearchConsultations(context.Background(), childID, tc.search)

			require.NoError(t, err)
			want := make([]uuid.UUID, 0, len(tc.want))
			for _, label := range tc.want {
				want = append(want, id[label])
			}
			require.Equal(t, want, idsOf(got), "not one more and not one less, in this order")
		})
	}
}

func TestSearch_ResultsAreTheListsShape(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID, id := historyChild(t, pool, svc)

	got, err := svc.SearchConsultations(context.Background(), childID, consultation.HistorySearch{SymptomCodes: []string{"fever", "cough"}})

	require.NoError(t, err)
	require.Len(t, got, 1)
	c := got[0]
	require.Equal(t, id["c1"], c.ID)
	require.Equal(t, childID, c.ChildID)
	require.Equal(t, "Dra. López", c.DoctorName)
	require.Equal(t, "Fiebre y tos del niño", c.Notes)
	require.Equal(t, 1, c.MedicationCount)
	require.Equal(t, []string{"Fiebre", "Tos"}, c.SymptomNames)
	require.False(t, c.RecordOnly)
}

func TestSearch_ASymptomRetiredFromTheCatalogStillFindsItsConsultation(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	code := tempSymptom(t, pool, "Síntoma de prueba", true)
	ids := createHistory(t, svc, childID, map[string]historyCase{
		"old": {doctor: "Dra. López", date: day(2026, 1, 10), medications: []string{"Amoxicilina"}, symptoms: []string{code}},
	})
	_, err := pool.Exec(context.Background(), `UPDATE symptoms SET active = false WHERE code = $1`, code)
	require.NoError(t, err)

	got, err := svc.SearchConsultations(context.Background(), childID, consultation.HistorySearch{SymptomCodes: []string{code}})

	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{ids["old"]}, idsOf(got))
}

func TestSearch_ASymptomTheCatalogNeverHadIsRefused(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID, _ := historyChild(t, pool, svc)

	_, err := svc.SearchConsultations(context.Background(), childID, consultation.HistorySearch{SymptomCodes: []string{"fever", "no_such_symptom"}})

	require.ErrorIs(t, err, consultation.ErrSymptomNotAvailable)
}

func TestSearch_OnlyTheChildsOwnConsultationsAreSearched(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	_, _ = historyChild(t, pool, svc)
	other, otherIDs := historyChild(t, pool, svc)

	got, err := svc.SearchConsultations(context.Background(), other, consultation.HistorySearch{Q: "lopez"})

	require.NoError(t, err)
	require.ElementsMatch(t, []uuid.UUID{otherIDs["c1"], otherIDs["c3"]}, idsOf(got), "only this child's, never the other's")
}

func TestSearch_AChildWithoutConsultationsHasAnEmptyListNotNil(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))

	got, err := svc.SearchConsultations(context.Background(), createTestChild(t, pool), consultation.HistorySearch{Q: "x"})

	require.NoError(t, err)
	require.NotNil(t, got)
	require.Empty(t, got)
}

func TestSearch_AFreeAccountGetsNoRowsWhateverItAsks(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createFreeTestChild(t, pool)
	// What a free account may have saved (an active treatment, specs/030), so there is something to leak.
	_, err := svc.CreateConsultation(context.Background(), childID, activeInput())
	require.NoError(t, err)

	for _, search := range []consultation.HistorySearch{{}, {Q: "lopez"}, {Kind: consultation.KindRecord}, {SymptomCodes: []string{"fever"}}} {
		got, err := svc.SearchConsultations(context.Background(), childID, search)

		requirePlanLimit(t, err, consultation.PlanLimitHistorySearch)
		require.Nil(t, got)
	}
}

func TestSearch_ABadCriterionIsRefusedBeforeAnythingElse(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	// Even for a free account: the criteria are checked first, so no plan is looked up for a request that can't be served.
	_, err := svc.SearchConsultations(context.Background(), createFreeTestChild(t, pool), consultation.HistorySearch{Kind: "x"})

	var validationErrs consultation.ValidationErrors
	require.ErrorAs(t, err, &validationErrs)
	require.NotErrorIs(t, err, consultation.ErrPlanLimit)
}

func TestSearch_UnknownChild(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))

	_, err := svc.SearchConsultations(context.Background(), uuid.New(), consultation.HistorySearch{})

	require.ErrorIs(t, err, consultation.ErrChildNotFound)
}

func TestSearch_SQLAndGoFoldTheSameWay(t *testing.T) {
	pool := testPool(t)
	for _, text := range []string{"López", "LÓPEZ", "niño", "NIÑO", "Pingüino", "ÁÉÍÓÚÜÑ", "áéíóúüñ", "Iván Robles", "Amoxicilina 250 mg", "c/8 h (a-b)", "", "100% _x_"} {
		var viaSQL string
		require.NoError(t, pool.QueryRow(context.Background(), `SELECT `+consultation.SQLFold("$1::text"), text).Scan(&viaSQL))

		require.Equal(t, consultation.FoldSpanish(text), viaSQL, text)
	}
}

func TestSearch_ErrorsOfTheDatabaseAreNotMistakenForAnEmptyResult(t *testing.T) {
	router := newBrokenRouter(t)

	rec := doPostPath(t, router, "/children/11111111-1111-1111-1111-111111111111/consultations/search", map[string]any{})
	require.Equal(t, 500, rec.Code)
	rec = doGet(t, router, "/children/11111111-1111-1111-1111-111111111111/history-options")
	require.Equal(t, 500, rec.Code)
}

func TestHistoryOptions_DistinctNamesAsWrittenSortedWithoutCaseOrAccents(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	createHistory(t, svc, childID, map[string]historyCase{
		"a": {doctor: "Dra. López", date: day(2026, 1, 1), medications: []string{"Paracetamol", "amoxicilina 250 mg"}},
		"b": {doctor: "Dra. López", date: day(2026, 1, 2), medications: []string{"Amoxicilina 250 mg"}},
		"c": {doctor: "Dr. López", date: day(2026, 1, 3), medications: []string{"Paracetamol"}}, // not unified with «Dra.»
		"d": {doctor: "Álvaro Díaz", date: day(2026, 1, 4), medications: []string{"Ibuprofeno"}},
		"e": {doctor: "  Dr. Zárate  ", date: day(2026, 1, 5), medications: []string{"Ácido fólico"}},
	})
	// Another child's names never show up.
	createHistory(t, svc, createTestChild(t, pool), map[string]historyCase{"x": {doctor: "Otro Doctor", date: day(2026, 1, 1), medications: []string{"Otra Medicina"}}})

	got, err := svc.HistoryOptions(context.Background(), childID)

	require.NoError(t, err)
	require.Equal(t, []string{"Álvaro Díaz", "Dr. López", "Dr. Zárate", "Dra. López"}, got.Doctors)
	require.Equal(t, []string{"Ácido fólico", "Amoxicilina 250 mg", "amoxicilina 250 mg", "Ibuprofeno", "Paracetamol"}, got.Medications)
}

func TestHistoryOptions_EmptyListsNotNullWithoutConsultations(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))

	got, err := svc.HistoryOptions(context.Background(), createTestChild(t, pool))

	require.NoError(t, err)
	require.NotNil(t, got.Doctors)
	require.NotNil(t, got.Medications)
	require.Empty(t, got.Doctors)
	require.Empty(t, got.Medications)
}

func TestHistoryOptions_FreeAccountAndUnknownChild(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))

	_, err := svc.HistoryOptions(context.Background(), createFreeTestChild(t, pool))
	requirePlanLimit(t, err, consultation.PlanLimitHistorySearch)

	_, err = svc.HistoryOptions(context.Background(), uuid.New())
	require.ErrorIs(t, err, consultation.ErrChildNotFound)
}

// SC-002: a combined search over 500 consultations answers fast, with the exact count. The bound is generous on purpose:
// it guards against a regression of seconds (a plan that scans per row), not against a busy CI runner missing 1 s.
func TestSearch_FiveHundredConsultationsAnswerFast(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	ctx := context.Background()
	// Direct inserts: creating 500 through the service would be the slow part, not the search.
	_, err := pool.Exec(ctx, `
		INSERT INTO consultations (child_id, doctor_name, consult_date, photo, notes, record_only)
		SELECT $1, CASE WHEN g % 2 = 0 THEN 'Dra. López' ELSE 'Dr. Iván Robles' END,
		       DATE '2025-01-01' + (g % 300), '\x00'::bytea, 'Nota número ' || g, g % 5 = 0
		FROM generate_series(1, 500) g`, childID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO medications (consultation_id, name, frequency_hours, duration_days)
		SELECT id, CASE WHEN row_number() OVER () % 3 = 0 THEN 'Amoxicilina' ELSE 'Paracetamol' END, 8, 3
		FROM consultations WHERE child_id = $1`, childID)
	require.NoError(t, err)

	var want int
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT count(*) FROM consultations c
		WHERE c.child_id = $1 AND c.doctor_name = 'Dra. López' AND NOT c.record_only
		  AND EXISTS (SELECT 1 FROM medications m WHERE m.consultation_id = c.id AND m.name = 'Amoxicilina')`, childID).Scan(&want))
	require.Positive(t, want)

	started := time.Now()
	got, err := svc.SearchConsultations(ctx, childID, consultation.HistorySearch{
		Q: "nota", Doctor: "Dra. López", Medication: "Amoxicilina", Kind: consultation.KindTreatment,
	})
	elapsed := time.Since(started)

	require.NoError(t, err)
	require.Len(t, got, want)
	require.Less(t, elapsed, 5*time.Second, fmt.Sprintf("took %s", elapsed))
	all, err := svc.SearchConsultations(ctx, childID, consultation.HistorySearch{})
	require.NoError(t, err)
	require.Len(t, all, 500)
}
