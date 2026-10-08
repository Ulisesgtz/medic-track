package supplement_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

// With the database unavailable every operation fails cleanly: an error from the repository, a 500 from the handlers
// (and nothing about what the parent wrote in the answer).

func TestRepository_DatabaseUnavailable(t *testing.T) {
	repo := newRepo(closedSupplementPool(t, nil))
	ctx := context.Background()
	id, doseID, actor := uuid.New(), uuid.New(), uuid.New()
	valid := daily("x")

	_, err := repo.Create(ctx, id, valid, actor)
	require.Error(t, err)
	_, err = repo.ListByChild(ctx, id, supplement.KindSupplement, fixedNow, fixedNow.Add(time.Hour))
	require.Error(t, err)
	_, err = repo.Get(ctx, id, fixedNow, fixedNow.Add(time.Hour))
	require.Error(t, err)
	_, err = repo.UpdateDoseStatus(ctx, id, doseID, true, supplement.Actor{AccountID: actor})
	require.Error(t, err)
	_, err = repo.UpdateDoseStatus(ctx, id, doseID, false, supplement.Actor{AccountID: actor})
	require.Error(t, err)
	require.Error(t, repo.Pause(ctx, id))
	require.Error(t, repo.Resume(ctx, id, 0))
	require.Error(t, repo.Update(ctx, id, valid))
	require.Error(t, repo.Finish(ctx, id))
	require.Error(t, repo.SetMuted(ctx, id, actor, true))
	_, err = repo.MutedAmong(ctx, actor, []uuid.UUID{id})
	require.Error(t, err)
}

func TestService_DatabaseUnavailable(t *testing.T) {
	svc := newService(newRepo(closedSupplementPool(t, nil)))
	ctx := context.Background()
	id, actor := uuid.New(), uuid.New()
	in := supplement.Input{Name: "x", Period: "daily", Times: []string{"08:00"}, FirstDate: "2026-10-05"}

	_, err := svc.List(ctx, id, supplement.KindSupplement, fixedNow, fixedNow.Add(time.Hour), actor)
	require.Error(t, err)
	_, err = svc.Get(ctx, id, fixedNow, fixedNow.Add(time.Hour), actor)
	require.Error(t, err)
	_, err = svc.Create(ctx, id, in, actor)
	require.Error(t, err)
	_, err = svc.Update(ctx, id, in, actor)
	require.Error(t, err)
	_, err = svc.Pause(ctx, id, actor)
	require.Error(t, err)
	_, err = svc.Resume(ctx, id, 0, actor)
	require.Error(t, err)
	_, err = svc.Finish(ctx, id, actor)
	require.Error(t, err)
	require.Error(t, svc.SetMyReminders(ctx, id, actor, true))
	_, err = svc.MarkDose(ctx, id, id, true, supplement.Actor{AccountID: actor})
	require.Error(t, err)
}

func TestHandlers_DatabaseUnavailableAnswer500(t *testing.T) {
	svc := supplement.NewService(supplement.NewRepository(closedSupplementPool(t, nil)))
	h := supplement.NewHandler(svc, httpx.NewResponder(&capture{}))
	withAccess := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(access.WithAccess(r.Context(), access.Access{Level: access.Full, ActorAccountID: uuid.New()})))
		})
	}
	r := chi.NewRouter()
	r.Use(withAccess)
	r.Get("/children/{childId}/routines", h.ListRoutines)
	r.Post("/children/{childId}/routines", h.CreateRoutine)
	r.Get("/routines/{routineId}", h.GetRoutine)
	r.Patch("/routines/{routineId}", h.UpdateRoutine)
	r.Patch("/routines/{routineId}/doses/{doseId}", h.UpdateDose)
	r.Put("/routines/{routineId}/my-reminders", h.SetMyReminders)
	r.Post("/routines/{routineId}/pause", h.PauseRoutine)
	r.Post("/routines/{routineId}/resume", h.ResumeRoutine)
	r.Post("/routines/{routineId}/finish", h.FinishRoutine)

	child, routine, dose := uuid.NewString(), uuid.NewString(), uuid.NewString()
	from := time.Now().UTC().Truncate(24 * time.Hour)
	window := "?from=" + from.Format(time.RFC3339) + "&to=" + from.Add(24*time.Hour).Format(time.RFC3339)
	create := `{"name":"x","period":"daily","times":["08:00"],"firstDate":"` + today() + `"}`
	for name, req := range map[string]*http.Request{
		"list":   httptest.NewRequest(http.MethodGet, "/children/"+child+"/routines"+window, nil),
		"create": httptest.NewRequest(http.MethodPost, "/children/"+child+"/routines", strings.NewReader(create)),
		"get":    httptest.NewRequest(http.MethodGet, "/routines/"+routine+window, nil),
		"update": httptest.NewRequest(http.MethodPatch, "/routines/"+routine, strings.NewReader(create)),
		"mark":   httptest.NewRequest(http.MethodPatch, "/routines/"+routine+"/doses/"+dose, strings.NewReader(`{"taken":true}`)),
		"remind": httptest.NewRequest(http.MethodPut, "/routines/"+routine+"/my-reminders", strings.NewReader(`{"enabled":true}`)),
		"pause":  httptest.NewRequest(http.MethodPost, "/routines/"+routine+"/pause", nil),
		"resume": httptest.NewRequest(http.MethodPost, "/routines/"+routine+"/resume", strings.NewReader(`{"utcOffsetMinutes":0}`)),
		"finish": httptest.NewRequest(http.MethodPost, "/routines/"+routine+"/finish", nil),
	} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusInternalServerError, rec.Code, name)
		require.NotContains(t, rec.Body.String(), "x\"", name)
	}
}

func TestHandlers_UnknownRoutinesAndChildrenAreNotFound(t *testing.T) {
	pool := testPool(t)
	h := supplement.NewHandler(supplement.NewService(supplement.NewRepository(pool)), httpx.NewResponder(&capture{}))
	withAccess := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(access.WithAccess(r.Context(), access.Access{Level: access.Full, ActorAccountID: uuid.New()})))
		})
	}
	r := chi.NewRouter()
	r.Use(withAccess)
	r.Get("/children/{childId}/routines", h.ListRoutines)
	r.Post("/children/{childId}/routines", h.CreateRoutine)
	r.Get("/routines/{routineId}", h.GetRoutine)
	r.Patch("/routines/{routineId}", h.UpdateRoutine)
	r.Post("/routines/{routineId}/pause", h.PauseRoutine)
	r.Post("/routines/{routineId}/resume", h.ResumeRoutine)
	r.Post("/routines/{routineId}/finish", h.FinishRoutine)
	r.Put("/routines/{routineId}/my-reminders", h.SetMyReminders)

	from := time.Now().UTC().Truncate(24 * time.Hour)
	window := "?from=" + from.Format(time.RFC3339) + "&to=" + from.Add(24*time.Hour).Format(time.RFC3339)
	create := `{"name":"x","period":"daily","times":["08:00"],"firstDate":"` + today() + `"}`
	unknownChild, unknown := uuid.NewString(), uuid.NewString()
	for name, req := range map[string]*http.Request{
		"list":   httptest.NewRequest(http.MethodGet, "/children/"+unknownChild+"/routines"+window, nil),
		"create": httptest.NewRequest(http.MethodPost, "/children/"+unknownChild+"/routines", strings.NewReader(create)),
		"get":    httptest.NewRequest(http.MethodGet, "/routines/"+unknown+window, nil),
		"update": httptest.NewRequest(http.MethodPatch, "/routines/"+unknown, strings.NewReader(create)),
		"pause":  httptest.NewRequest(http.MethodPost, "/routines/"+unknown+"/pause", nil),
		"resume": httptest.NewRequest(http.MethodPost, "/routines/"+unknown+"/resume", strings.NewReader(`{"utcOffsetMinutes":0}`)),
		"finish": httptest.NewRequest(http.MethodPost, "/routines/"+unknown+"/finish", nil),
		"remind": httptest.NewRequest(http.MethodPut, "/routines/"+unknown+"/my-reminders", strings.NewReader(`{"enabled":true}`)),
	} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusNotFound, rec.Code, name)
	}
}
