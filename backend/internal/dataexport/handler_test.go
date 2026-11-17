package dataexport

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/authmw/authmwtest"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

type recorder struct {
	mu      sync.Mutex
	entries []*errorlog.Entry
}

func (r *recorder) Create(_ context.Context, e *errorlog.Entry) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.entries = append(r.entries, e)
	return nil
}

func (r *recorder) all() []*errorlog.Entry {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]*errorlog.Entry{}, r.entries...)
}

func TestHandler_DownloadsAndTheFamilysChildrenOnlyWhileTheOwnerIsLeaving(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	f := seedFamily(t, pool)
	tutorClerk := "user_export_tutor_" + f.Tutor.String()
	_, err := pool.Exec(ctx, `UPDATE accounts SET clerk_user_id = $2 WHERE id = $1`, f.Tutor, tutorClerk)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM account_deletions WHERE account_id = $1`, f.Owner)
	})

	rec := &recorder{}
	responder := httpx.NewResponder(rec)
	verifier := authmwtest.NewVerifier(t, responder)
	h := NewHandler(responder, pool, NewFamilyOwnerResolver(pool))
	h.SetNow(func() time.Time { return exportNow })
	r := chi.NewRouter()
	r.Use(verifier.Middleware)
	r.Post("/accounts/{accountId}/data-export", h.ExportOwn)
	r.Post("/family/children-export", h.ExportFamilyChildren)
	post := func(path, clerkID string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, path, nil)
		req.Header.Set("Authorization", "Bearer "+verifier.Token(t, clerkID))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	w := post("/accounts/"+f.Owner.String()+"/data-export", "user_any")
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "application/zip", w.Header().Get("Content-Type"))
	require.Equal(t, `attachment; filename="peditrack-datos-2026-11-12.zip"`, w.Header().Get("Content-Disposition"))
	files := unzip(t, w.Body.Bytes())
	require.Contains(t, files, "datos.json")
	require.Contains(t, files, "fotos/recetas/"+f.Consultation.String()+".jpg")

	require.Equal(t, http.StatusNotFound, post("/accounts/not-a-uuid/data-export", "user_any").Code)

	// The family's children: not while the owner stays.
	require.Equal(t, http.StatusNotFound, post("/family/children-export", tutorClerk).Code)
	_, err = pool.Exec(ctx, `INSERT INTO account_deletions (account_id, scheduled_for) VALUES ($1, now() + interval '30 days')`, f.Owner)
	require.NoError(t, err)
	w = post("/family/children-export", tutorClerk)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	files = unzip(t, w.Body.Bytes())
	require.Contains(t, string(files["hijos.csv"]), "Mateo")
	require.NotContains(t, files, "botiquin.csv", "only the children, not the owner's own things")
	require.Equal(t, http.StatusNotFound, post("/family/children-export", "user_nobody").Code)

	// FR-004: an integrated child of the family is not a Tutor or a Caregiver.
	_, err = pool.Exec(ctx, `UPDATE family_members SET role = 'child', child_id = $2 WHERE account_id = $1`, f.Tutor, f.Child)
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, post("/family/children-export", tutorClerk).Code)
	_, err = pool.Exec(ctx, `UPDATE family_members SET role = 'caregiver', child_id = NULL WHERE account_id = $1`, f.Tutor)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, post("/family/children-export", tutorClerk).Code)

	for _, e := range rec.all() {
		require.False(t, strings.Contains(e.Message, "Mateo") || strings.Contains(e.Message, "Amoxicilina"), e.Message)
	}
}

func TestHandler_FailuresAreFixedMessages(t *testing.T) {
	pool := testPool(t)
	f := seedFamily(t, pool)
	rec := &recorder{}
	responder := httpx.NewResponder(rec)
	verifier := authmwtest.NewVerifier(t, responder)

	closed := closedPoolFor(t)
	h := NewHandler(responder, closed, NewFamilyOwnerResolver(closed))
	r := chi.NewRouter()
	r.Use(verifier.Middleware)
	r.Post("/accounts/{accountId}/data-export", h.ExportOwn)
	r.Post("/family/children-export", h.ExportFamilyChildren)
	for _, path := range []string{"/accounts/" + f.Owner.String() + "/data-export", "/family/children-export"} {
		req := httptest.NewRequest(http.MethodPost, path, nil)
		req.Header.Set("Authorization", "Bearer "+verifier.Token(t, "user_x"))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		require.Equal(t, http.StatusInternalServerError, w.Code, path)
		require.Contains(t, w.Body.String(), "export_failed")
	}

	none := NewHandler(responder, pool, nil)
	req := httptest.NewRequest(http.MethodPost, "/family/children-export", nil)
	w := httptest.NewRecorder()
	none.ExportFamilyChildren(w, req)
	require.Equal(t, http.StatusNotFound, w.Code, "without a session or a resolver there is nothing to download")

	// A photo that vanished between the list and the read is reported as gone (Write skips it).
	_, err := h.photo(f.Owner)(context.Background(), Photo{Kind: "nada", ID: uuid.New()})
	require.Error(t, err)
	_, err = NewHandler(responder, pool, nil).photo(f.Owner)(context.Background(), Photo{Kind: "recetas", ID: uuid.New()})
	require.ErrorIs(t, err, ErrPhotoGone)
}

func closedPoolFor(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()
	return pool
}
