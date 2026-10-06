package consultation_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/031: the HTTP side of the history — POST …/consultations/search and GET …/history-options.

func decodeBody(t *testing.T, body *bytes.Buffer) map[string]any {
	t.Helper()
	var out map[string]any
	require.NoError(t, json.Unmarshal(body.Bytes(), &out))
	return out
}

func detailFields(t *testing.T, body *bytes.Buffer) []string {
	t.Helper()
	var fields []string
	for _, d := range decodeBody(t, body)["details"].([]any) {
		fields = append(fields, d.(map[string]any)["field"].(string))
	}
	return fields
}

func TestHandler_Search_FiltersAndAnswersTheListsShape(t *testing.T) {
	pool := testPool(t)
	router, _ := routerWithPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID, ids := historyChild(t, pool, svc)
	path := "/children/" + childID.String() + "/consultations/search"

	rec := doPostPath(t, router, path, map[string]any{
		"q": "LOPEZ", "from": "2026-02-01", "to": "2026-12-31", "doctor": "Dra. López", "medication": "Amoxicilina 500 mg",
		"symptomCodes": []string{"cough"}, "kind": "treatment",
	})

	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	body := decodeBody(t, rec.Body)
	require.Equal(t, childID.String(), body["childId"])
	list := body["consultations"].([]any)
	require.Len(t, list, 1)
	c := list[0].(map[string]any)
	require.Equal(t, ids["c3"].String(), c["id"])
	require.Equal(t, "Dra. López", c["doctorName"])
	require.Equal(t, "2026-03-20", c["consultDate"])
	require.Equal(t, float64(2), c["medicationCount"])
	require.Equal(t, []any{"Tos"}, c["symptomNames"])
	require.Equal(t, false, c["recordOnly"])
}

func TestHandler_Search_AnEmptyBodyReturnsEverythingAndNothingFoundIsAnEmptyList(t *testing.T) {
	pool := testPool(t)
	router, _ := routerWithPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID, _ := historyChild(t, pool, svc)
	path := "/children/" + childID.String() + "/consultations/search"

	all := doPostPath(t, router, path, map[string]any{})
	require.Equal(t, http.StatusOK, all.Code)
	require.Len(t, decodeBody(t, all.Body)["consultations"], 4)

	none := doPostPath(t, router, path, map[string]any{"q": "zzz"})
	require.Equal(t, http.StatusOK, none.Code)
	require.Equal(t, []any{}, decodeBody(t, none.Body)["consultations"], "[] and not null")
}

func TestHandler_Search_InvalidCriteriaAreValidationErrorsNamingTheirField(t *testing.T) {
	pool := testPool(t)
	router, _ := routerWithPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID, _ := historyChild(t, pool, svc)
	path := "/children/" + childID.String() + "/consultations/search"

	for name, tc := range map[string]struct {
		body   map[string]any
		fields []string
	}{
		"a date that is not a date":      {map[string]any{"from": "15/01/2026"}, []string{"from"}},
		"both dates wrong":               {map[string]any{"from": "x", "to": "2026-13-45"}, []string{"from", "to"}},
		"a range turned around":          {map[string]any{"from": "2026-07-01", "to": "2026-06-01"}, []string{"to"}},
		"a kind that does not exist":     {map[string]any{"kind": "everything"}, []string{"kind"}},
		"a text that is too long":        {map[string]any{"q": string(bytes.Repeat([]byte("a"), 101))}, []string{"q"}},
		"a symptom that never existed":   {map[string]any{"symptomCodes": []string{"no_such_symptom"}}, []string{"symptomCodes"}},
		"several things wrong together":  {map[string]any{"kind": "x", "q": string(bytes.Repeat([]byte("a"), 101))}, []string{"q", "kind"}},
	} {
		t.Run(name, func(t *testing.T) {
			rec := doPostPath(t, router, path, tc.body)

			require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
			require.Equal(t, "validation_error", decodeBody(t, bytes.NewBuffer(rec.Body.Bytes()))["error"])
			require.ElementsMatch(t, tc.fields, detailFields(t, rec.Body))
		})
	}

	t.Run("a body that is not JSON", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodPost, path, bytes.NewBufferString("{not json"))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})
}

func TestHandler_Search_AFreeAccountGetsThePlanNoticeAndNoConsultations(t *testing.T) {
	pool := testPool(t)
	router, _ := routerWithPool(t)
	childID := createFreeTestChild(t, pool)
	svc := consultation.NewService(consultation.NewRepository(pool))
	_, err := svc.CreateConsultation(context.Background(), childID, activeInput())
	require.NoError(t, err)

	search := doPostPath(t, router, "/children/"+childID.String()+"/consultations/search", map[string]any{"q": "lopez"})
	options := doGet(t, router, "/children/"+childID.String()+"/history-options")

	for _, rec := range []*struct {
		code int
		body map[string]any
	}{
		{search.Code, decodeBody(t, search.Body)},
		{options.Code, decodeBody(t, options.Body)},
	} {
		require.Equal(t, http.StatusUnprocessableEntity, rec.code)
		require.Equal(t, "freemium_consultation_limit_exceeded", rec.body["error"])
		require.Equal(t, "history_search", rec.body["reason"])
		require.Contains(t, rec.body["message"], "paid plan")
		require.NotContains(t, rec.body, "consultations", "not one consultation leaks")
		require.NotContains(t, rec.body, "doctors")
	}

	// The plain list is still all there for the free plan (specs/031 FR-008).
	list := doGet(t, router, "/children/"+childID.String()+"/consultations")
	require.Equal(t, http.StatusOK, list.Code)
	require.Len(t, decodeBody(t, list.Body)["consultations"], 1)
}

func TestHandler_History_UnknownOrMalformedChildIs404(t *testing.T) {
	router, _ := routerWithPool(t)

	for _, id := range []string{"not-a-uuid", "11111111-1111-1111-1111-111111111111"} {
		rec := doPostPath(t, router, "/children/"+id+"/consultations/search", map[string]any{})
		require.Equal(t, http.StatusNotFound, rec.Code, id)
		require.Equal(t, "child_not_found", decodeBody(t, rec.Body)["error"])

		rec = doGet(t, router, "/children/"+id+"/history-options")
		require.Equal(t, http.StatusNotFound, rec.Code, id)
	}
}

func TestHandler_HistoryOptions_ListsWhatIsRegistered(t *testing.T) {
	pool := testPool(t)
	router, _ := routerWithPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID, _ := historyChild(t, pool, svc)

	rec := doGet(t, router, "/children/"+childID.String()+"/history-options")

	require.Equal(t, http.StatusOK, rec.Code)
	body := decodeBody(t, rec.Body)
	require.Equal(t, []any{"Dr. Iván Robles", "Dra. López"}, body["doctors"])
	require.Equal(t, []any{"Amoxicilina 250 mg", "Amoxicilina 500 mg", "Ibuprofeno", "Paracetamol", "Vitamina D"}, body["medications"])
}

// FR-015: what the parent typed is health information; it is not saved anywhere the team reads (error_logs keeps the
// route's template, never the body) and it is not in the address either (the search is a POST).
func TestHandler_Search_TheTypedTextIsNotRecordedInErrorLogs(t *testing.T) {
	pool := testPool(t)
	router, _ := routerWithPool(t)
	childID := createFreeTestChild(t, pool)
	secret := "diabetes-" + time.Now().Format("150405.000000")

	rec := doPostPath(t, router, "/children/"+childID.String()+"/consultations/search", map[string]any{"q": secret}) // 422: it is logged
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	rec = doPostPath(t, router, "/children/"+childID.String()+"/consultations/search", map[string]any{"q": secret, "kind": "bad"}) // 400: logged too
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// The log is written in the background: wait for the rows of these two, then look for the text.
	require.Eventually(t, func() bool {
		var n int
		_ = pool.QueryRow(context.Background(), `SELECT count(*) FROM error_logs WHERE endpoint LIKE '%/consultations/search' AND created_at > now() - interval '1 minute'`).Scan(&n)
		return n >= 2
	}, 5*time.Second, 50*time.Millisecond)
	var leaked int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM error_logs WHERE message ILIKE '%' || $1 || '%' OR endpoint ILIKE '%' || $1 || '%'`, secret).Scan(&leaked))
	require.Zero(t, leaked)
}
