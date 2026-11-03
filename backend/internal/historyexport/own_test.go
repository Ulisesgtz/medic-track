package historyexport_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/historyexport"
)

// specs/058: the PDF of a person's own history — their consultations, never a child's, and no vaccination card.

func postOwn(t *testing.T, h *historyexport.Handler, accountID, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := chi.NewRouter()
	r.Post("/accounts/{accountId}/export", h.ExportOwn)
	req := httptest.NewRequest(http.MethodPost, "/accounts/"+accountID+"/export", strings.NewReader(body))
	req = req.WithContext(access.WithAccess(req.Context(), access.Access{Level: access.Full, ActorAccountID: uuid.New()}))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestExportOwn_ThePersonsOwnConsultationsOnly(t *testing.T) {
	ctx := context.Background()
	pool := testPool(t)
	f := newFamily(t, pool, account.PlanPaid)
	consult(t, pool, f, today(), "Dra. Del Hijo")
	start := "00:00"
	_, err := consultation.NewService(consultation.NewRepository(pool)).CreateOwnConsultation(ctx, f.accountID, consultation.CreateConsultationInput{
		DoctorName: "Dr. Propio", ConsultDate: today(), Photo: jpeg, Notes: "Dolor de garganta",
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 3, StartTime: &start}},
	})
	require.NoError(t, err)

	h := handler(t, &capture{})
	rec := postOwn(t, h, f.accountID.String(), `{"period":{"kind":"all"},"sections":{"consultations":true,"photos":true}}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "person", body["subject"])
	require.Equal(t, "Ana", body["child"].(map[string]any)["firstName"])
	require.Equal(t, "", body["child"].(map[string]any)["birthDate"])
	consultations := body["consultations"].([]any)
	require.Len(t, consultations, 1)
	require.Equal(t, "Dr. Propio", consultations[0].(map[string]any)["doctorName"])
	require.Equal(t, []any{}, body["vaccinations"])
	require.NotNil(t, body["activeTreatment"])

	// …and the child's PDF never carries the person's.
	rec = post(t, h, f.childID.String(), `{"period":{"kind":"all"},"sections":{"consultations":true}}`)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NotContains(t, rec.Body.String(), "Dr. Propio")
	require.Contains(t, rec.Body.String(), `"subject":"child"`)
}

func TestExportOwn_Refusals(t *testing.T) {
	pool := testPool(t)
	h := handler(t, &capture{})
	f := newFamily(t, pool, account.PlanPaid)

	rec := postOwn(t, h, f.accountID.String(), `{"period":{"kind":"all"},"sections":{"consultations":true,"vaccinations":true}}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "sections.vaccinations")
	require.Equal(t, http.StatusBadRequest, postOwn(t, h, f.accountID.String(), `{`).Code)
	require.Equal(t, http.StatusBadRequest, postOwn(t, h, f.accountID.String(), `{"period":{"kind":"all"},"sections":{}}`).Code)
	require.Equal(t, http.StatusBadRequest, postOwn(t, h, f.accountID.String(),
		`{"period":{"kind":"filters","filters":{"symptomCodes":["no_such_symptom"]}},"sections":{"consultations":true}}`).Code)
	require.Equal(t, http.StatusNotFound, postOwn(t, h, "not-a-uuid", `{}`).Code)
	require.Equal(t, http.StatusNotFound, postOwn(t, h, uuid.NewString(), `{"period":{"kind":"all"},"sections":{"consultations":true}}`).Code)

	free := newFamily(t, pool, account.PlanFree)
	rec = postOwn(t, h, free.accountID.String(), `{"period":{"kind":"all"},"sections":{"consultations":true}}`)
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	require.Contains(t, rec.Body.String(), `"reason":"pdf_export"`)
}

func TestBuildOwn_ARangeAndNoSuchPerson(t *testing.T) {
	pool := testPool(t)
	svc := newService(pool)
	f := newFamily(t, pool, account.PlanPaid)
	from, to := today().AddDate(0, 0, -7), today()
	doc, err := svc.BuildOwn(context.Background(), f.accountID, historyexport.Request{PeriodKind: historyexport.PeriodRange, From: &from, To: &to, Consultations: true})
	require.NoError(t, err)
	require.True(t, doc.Own)
	require.Empty(t, doc.Consultations)
	_, err = svc.BuildOwn(context.Background(), uuid.New(), historyexport.Request{PeriodKind: historyexport.PeriodAll, Consultations: true})
	require.ErrorIs(t, err, historyexport.ErrAccountNotFound)
}
