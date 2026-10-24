package vaccination_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/vaccination"
)

// specs/046 T036: the card by role, against the real database, the real family tables and the real access levels (the same
// RequireSession + RequireAccess pair the server's router puts in front of these routes).

type rolesWorld struct {
	router                            http.Handler
	verifier                          *authmwtest.Verifier
	pool                              *pgxpool.Pool
	owner, tutor, caregiver, stranger string // clerk ids
	ownerAccountID                    uuid.UUID
	childID                           uuid.UUID
}

func newRolesWorld(t *testing.T) *rolesWorld {
	t.Helper()
	pool := testPool(t)
	responder := httpx.NewResponder(&capture{})
	w := &rolesWorld{pool: pool, verifier: authmwtest.NewVerifier(t, responder)}
	suffix := fmt.Sprintf("%d.%s", time.Now().UnixNano(), uuid.NewString()[:6])
	repo := account.NewRepository(pool)
	create := func(name string, plan account.Plan, children int) (*account.Account, string) {
		clerk := fmt.Sprintf("user_vacc_%s_%s", name, suffix)
		acc := &account.Account{FirstName: name, LastName: "Prueba", Email: fmt.Sprintf("vacc.%s.%s@example.com", name, suffix), Plan: plan, ClerkUserID: &clerk}
		for i := 0; i < children; i++ {
			acc.Children = append(acc.Children, account.Child{FirstName: "Hijo", LastName: name, BirthDate: time.Now().UTC().AddDate(-5, 0, 0)})
		}
		require.NoError(t, repo.Create(context.Background(), acc))
		return acc, clerk
	}
	owner, ownerClerk := create("Ana", account.PlanPaid, 1)
	tutor, tutorClerk := create("Tutor", account.PlanFree, 0)
	caregiver, caregiverClerk := create("Cuidadora", account.PlanFree, 0)
	_, strangerClerk := create("Ajena", account.PlanPaid, 1)
	for _, m := range []struct {
		id   uuid.UUID
		role string
	}{{tutor.ID, "tutor"}, {caregiver.ID, "caregiver"}} {
		_, err := pool.Exec(context.Background(), `
			INSERT INTO family_members (family_account_id, account_id, role, invited_by_account_id) VALUES ($1, $2, $3, $1)`, owner.ID, m.id, m.role)
		require.NoError(t, err)
	}
	w.owner, w.tutor, w.caregiver, w.stranger = ownerClerk, tutorClerk, caregiverClerk, strangerClerk
	w.ownerAccountID, w.childID = owner.ID, owner.Children[0].ID

	h := vaccination.NewHandler(vaccination.NewService(vaccination.NewRepository(pool)), responder)
	levels := access.NewRepository(pool)
	sees := authmw.RequireAccess(responder, "childId", access.Mark, levels.OnChild)
	full := authmw.RequireAccess(responder, "childId", access.Full, levels.OnChild)
	r := chi.NewRouter()
	r.Use(w.verifier.Middleware)
	r.With(sees).Get("/children/{childId}/vaccinations", h.ListVaccinations)
	r.With(full).Post("/children/{childId}/vaccinations", h.CreateVaccination)
	r.With(full).Patch("/children/{childId}/vaccinations/{vaccinationId}", h.UpdateVaccination)
	r.With(full).Delete("/children/{childId}/vaccinations/{vaccinationId}", h.DeleteVaccination)
	r.With(sees).Get("/children/{childId}/vaccine-card-photos", h.ListPhotos)
	r.With(full).Post("/children/{childId}/vaccine-card-photos", h.AddPhoto)
	r.With(sees).Get("/children/{childId}/vaccine-card-photos/{photoId}", h.GetPhoto)
	r.With(full).Delete("/children/{childId}/vaccine-card-photos/{photoId}", h.DeletePhoto)
	w.router = r
	return w
}

func (w *rolesWorld) do(t *testing.T, as, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		require.NoError(t, json.NewEncoder(&buf).Encode(body))
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Authorization", "Bearer "+w.verifier.Token(t, as))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	w.router.ServeHTTP(rec, req)
	return rec
}

func (w *rolesWorld) setOwnerPlan(t *testing.T, plan string) {
	t.Helper()
	_, err := w.pool.Exec(context.Background(), `UPDATE accounts SET plan = $2 WHERE id = $1`, w.ownerAccountID, plan)
	require.NoError(t, err)
}

func TestRoles_TheCardByRoleOnTheRealFamily(t *testing.T) {
	w := newRolesWorld(t)
	base := "/children/" + w.childID.String()
	dose := map[string]any{"vaccineCode": "", "customName": "Rabia", "appliedOn": time.Now().UTC().AddDate(-1, 0, 0).Format("2006-01-02")}

	// The owner records a dose and saves a photo.
	created := w.do(t, w.owner, http.MethodPost, base+"/vaccinations", dose)
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	var recorded struct{ ID string }
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &recorded))
	photo := w.do(t, w.owner, http.MethodPost, base+"/vaccine-card-photos", map[string]any{"photoBase64": b64(jpegHead)})
	require.Equal(t, http.StatusCreated, photo.Code, photo.Body.String())
	var saved struct{ ID string }
	require.NoError(t, json.Unmarshal(photo.Body.Bytes(), &saved))

	t.Run("a caregiver reads the doses and the photos", func(t *testing.T) {
		list := w.do(t, w.caregiver, http.MethodGet, base+"/vaccinations", nil)
		require.Equal(t, http.StatusOK, list.Code, list.Body.String())
		require.Contains(t, list.Body.String(), "Rabia")
		require.Equal(t, http.StatusOK, w.do(t, w.caregiver, http.MethodGet, base+"/vaccine-card-photos", nil).Code)
		one := w.do(t, w.caregiver, http.MethodGet, base+"/vaccine-card-photos/"+saved.ID, nil)
		require.Equal(t, http.StatusOK, one.Code)
		require.Contains(t, one.Body.String(), b64(jpegHead))
	})

	t.Run("a caregiver gets 403 on every write and nothing changes", func(t *testing.T) {
		require.Equal(t, http.StatusForbidden, w.do(t, w.caregiver, http.MethodPost, base+"/vaccinations", dose).Code)
		require.Equal(t, http.StatusForbidden, w.do(t, w.caregiver, http.MethodPatch, base+"/vaccinations/"+recorded.ID, dose).Code)
		require.Equal(t, http.StatusForbidden, w.do(t, w.caregiver, http.MethodDelete, base+"/vaccinations/"+recorded.ID, nil).Code)
		require.Equal(t, http.StatusForbidden, w.do(t, w.caregiver, http.MethodPost, base+"/vaccine-card-photos", map[string]any{"photoBase64": b64(jpegHead)}).Code)
		require.Equal(t, http.StatusForbidden, w.do(t, w.caregiver, http.MethodDelete, base+"/vaccine-card-photos/"+saved.ID, nil).Code)
		list := w.do(t, w.owner, http.MethodGet, base+"/vaccinations", nil)
		require.Contains(t, list.Body.String(), "Rabia")
		require.Equal(t, http.StatusOK, w.do(t, w.owner, http.MethodGet, base+"/vaccine-card-photos/"+saved.ID, nil).Code)
	})

	t.Run("someone from another family gets 403 on everything", func(t *testing.T) {
		for _, c := range []struct {
			method, path string
			body         any
		}{
			{http.MethodGet, base + "/vaccinations", nil},
			{http.MethodPost, base + "/vaccinations", dose},
			{http.MethodPatch, base + "/vaccinations/" + recorded.ID, dose},
			{http.MethodDelete, base + "/vaccinations/" + recorded.ID, nil},
			{http.MethodGet, base + "/vaccine-card-photos", nil},
			{http.MethodPost, base + "/vaccine-card-photos", map[string]any{"photoBase64": b64(jpegHead)}},
			{http.MethodGet, base + "/vaccine-card-photos/" + saved.ID, nil},
			{http.MethodDelete, base + "/vaccine-card-photos/" + saved.ID, nil},
		} {
			require.Equal(t, http.StatusForbidden, w.do(t, w.stranger, c.method, c.path, c.body).Code, c.method+" "+c.path)
		}
	})

	t.Run("a tutor of a paid family records, and drops to read-only when the family stops paying", func(t *testing.T) {
		named := func(name string) map[string]any {
			return map[string]any{"vaccineCode": "", "customName": name, "appliedOn": dose["appliedOn"]}
		}
		require.Equal(t, http.StatusCreated, w.do(t, w.tutor, http.MethodPost, base+"/vaccinations", named("Tos ferina")).Code)

		w.setOwnerPlan(t, "free")
		require.Equal(t, http.StatusOK, w.do(t, w.tutor, http.MethodGet, base+"/vaccinations", nil).Code, "still sees everything")
		require.Equal(t, http.StatusForbidden, w.do(t, w.tutor, http.MethodPost, base+"/vaccinations", dose).Code)
		require.Equal(t, http.StatusForbidden, w.do(t, w.tutor, http.MethodDelete, base+"/vaccinations/"+recorded.ID, nil).Code)
		require.Equal(t, http.StatusForbidden, w.do(t, w.tutor, http.MethodPost, base+"/vaccine-card-photos", map[string]any{"photoBase64": b64(jpegHead)}).Code)
		require.Equal(t, http.StatusOK, w.do(t, w.tutor, http.MethodGet, base+"/vaccine-card-photos", nil).Code)

		w.setOwnerPlan(t, "paid")
		require.Equal(t, http.StatusCreated, w.do(t, w.tutor, http.MethodPost, base+"/vaccinations", named("Varicela")).Code, "writes come back by themselves")
	})
}
