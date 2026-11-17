package accountdeletion

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
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
	"github.com/Ulisesgtz/medic-track/backend/internal/mailer"
)

type fakeClerk struct {
	mu      sync.Mutex
	deleted []string
	err     error
}

func (f *fakeClerk) Delete(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	f.deleted = append(f.deleted, id)
	return nil
}

type sent struct{ kind, to, name string }

type fakeNotifier struct {
	mu   sync.Mutex
	sent []sent
	err  error
}

func (f *fakeNotifier) add(kind, to, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, sent{kind, to, name})
	return f.err
}
func (f *fakeNotifier) Requested(_ context.Context, to, name string, _ time.Time) error {
	return f.add("requested", to, name)
}
func (f *fakeNotifier) FamilyNotice(_ context.Context, to, name string, _ time.Time) error {
	return f.add("family", to, name)
}
func (f *fakeNotifier) Completed(_ context.Context, to, name string) error {
	return f.add("completed", to, name)
}

type fakeReporter struct {
	mu    sync.Mutex
	kinds []string
}

func (f *fakeReporter) Report(kind, message string, _ *uuid.UUID) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.kinds = append(f.kinds, kind+": "+message)
}

type harness struct {
	pool     *pgxpool.Pool
	w        world
	repo     *Repository
	svc      *Service
	clerk    *fakeClerk
	notify   *fakeNotifier
	reporter *fakeReporter
	canceled []uuid.UUID
	now      time.Time
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	pool := testPool(t)
	h := &harness{pool: pool, w: seedWorld(t, pool), clerk: &fakeClerk{}, notify: &fakeNotifier{}, reporter: &fakeReporter{},
		now: time.Now()}
	_, err := pool.Exec(context.Background(), `UPDATE accounts SET clerk_user_id = 'user_' || id::text WHERE id = ANY($1)`,
		[]uuid.UUID{h.w.A, h.w.B, h.w.X})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM account_deletions WHERE account_id = ANY($1)`, []uuid.UUID{h.w.A, h.w.B, h.w.X})
	})
	h.repo = NewRepository(pool)
	h.repo.SetNow(func() time.Time { return h.now })
	h.svc = NewService(h.repo, pool, h.clerk, func(_ context.Context, id uuid.UUID) (bool, error) {
		h.canceled = append(h.canceled, id)
		return true, nil
	}, h.notify, h.reporter)
	h.svc.async = func(f func()) { f() }
	return h
}

func TestRequest_RefusesWithoutTheWordOrARecentSignIn(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	_, err := h.svc.Request(ctx, h.w.A, "eliminar", true)
	require.ErrorIs(t, err, ErrConfirm, "the exact word, in capitals")
	_, err = h.svc.Request(ctx, h.w.A, ConfirmWord, false)
	require.ErrorIs(t, err, ErrReverification)
	d, err := h.repo.Open(ctx, h.w.A)
	require.NoError(t, err)
	require.Nil(t, d, "nothing was saved")
	require.Empty(t, h.canceled, "and the subscription was not touched")
	_, err = h.svc.Request(ctx, uuid.New(), ConfirmWord, true)
	require.ErrorIs(t, err, ErrAccountNotFound)
}

func TestRequest_SchedulesInThirtyDaysAndClosesTheDoors(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	// A pending link of a child's phone (the seed has an active one).
	_, err := h.pool.Exec(ctx, `INSERT INTO child_device_links (child_id, account_id, name, created_by_account_id, token_hash, expires_at)
		VALUES ($1, $2, 'Liga', $2, '\x02', now() + interval '1 day')`, h.w.C2, h.w.A)
	require.NoError(t, err)

	res, err := h.svc.Request(ctx, h.w.A, ConfirmWord, true)
	require.NoError(t, err)
	require.True(t, res.SubscriptionCanceled)
	require.Equal(t, []uuid.UUID{h.w.A}, h.canceled)
	require.Equal(t, 1, res.FamilyNotified, "B, the Tutor of A's family")
	require.WithinDuration(t, h.now.Add(GracePeriod), res.Deletion.ScheduledFor, time.Second)

	var pendingInvitations, pendingLinks, activeLinks int
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT count(*) FROM family_invitations WHERE family_account_id = $1 AND status = 'pending'`, h.w.A).Scan(&pendingInvitations))
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT count(*) FROM child_device_links WHERE account_id = $1 AND status = 'pending'`, h.w.A).Scan(&pendingLinks))
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT count(*) FROM child_device_links WHERE account_id = $1 AND status = 'active'`, h.w.A).Scan(&activeLinks))
	require.Zero(t, pendingInvitations, "the family's pending invitations stopped working")
	require.Zero(t, pendingLinks, "and the pending links of the children's phones")
	require.Equal(t, 1, activeLinks, "a phone already in use keeps working until the date (a treatment may be running)")

	require.ElementsMatch(t, []sent{
		{"requested", h.w.A.String() + "@purge.test", "Ana"},
		{"family", h.w.B.String() + "@purge.test", "Ana"},
	}, h.notify.sent)

	again, err := h.svc.Request(ctx, h.w.A, ConfirmWord, true)
	require.ErrorIs(t, err, ErrAlreadyPending)
	require.Equal(t, res.Deletion.ID, again.Deletion.ID)
}

func TestRequest_WhenTheSubscriptionCannotBeCanceledNothingIsSaved(t *testing.T) {
	h := newHarness(t)
	h.svc.cancel = func(context.Context, uuid.UUID) (bool, error) { return false, errors.New("provider down") }
	_, err := h.svc.Request(context.Background(), h.w.A, ConfirmWord, true)
	require.ErrorIs(t, err, ErrSubscriptionCancel)
	d, err := h.repo.Open(context.Background(), h.w.A)
	require.NoError(t, err)
	require.Nil(t, d)
}

func TestCancel_GivesEverythingBack(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	_, err := h.svc.Request(ctx, h.w.A, ConfirmWord, true)
	require.NoError(t, err)
	require.NoError(t, h.svc.Cancel(ctx, h.w.A))
	require.NoError(t, h.svc.Cancel(ctx, h.w.A), "twice is fine")
	d, err := h.svc.Status(ctx, h.w.A)
	require.NoError(t, err)
	require.Nil(t, d)

	h.now = h.now.Add(GracePeriod + time.Hour)
	n, err := h.svc.RunOnce(ctx)
	require.NoError(t, err)
	require.Zero(t, n, "a canceled request is never completed")
	var children int
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT count(*) FROM children WHERE account_id = $1`, h.w.A).Scan(&children))
	require.Equal(t, 2, children)

	_, err = h.svc.Request(ctx, h.w.A, ConfirmWord, true)
	require.NoError(t, err, "a canceled request can be asked for again")
}

func TestRunOnce_DeletesOnlyWhenTheDateComes(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	_, err := h.svc.Request(ctx, h.w.A, ConfirmWord, true)
	require.NoError(t, err)

	h.now = h.now.Add(GracePeriod - time.Minute)
	n, err := h.svc.RunOnce(ctx)
	require.NoError(t, err)
	require.Zero(t, n)

	h.now = h.now.Add(2 * time.Minute)
	n, err = h.svc.RunOnce(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	require.Equal(t, []string{"user_" + h.w.A.String()}, h.clerk.deleted, "the Clerk user goes too")

	var accounts int
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT count(*) FROM accounts WHERE id = $1`, h.w.A).Scan(&accounts))
	require.Zero(t, accounts)
	var completed bool
	var clerkID *string
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT completed_at IS NOT NULL, clerk_user_id FROM account_deletions WHERE account_id = $1`, h.w.A).
		Scan(&completed, &clerkID))
	require.True(t, completed, "the record stays")
	require.Nil(t, clerkID, "without the Clerk user")
	require.Contains(t, h.notify.sent, sent{"completed", h.w.A.String() + "@purge.test", "Ana"})
	require.Empty(t, h.reporter.kinds)
}

func TestRunOnce_AFailureIsReportedAndRetried(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	_, err := h.svc.Request(ctx, h.w.A, ConfirmWord, true)
	require.NoError(t, err)
	h.now = h.now.Add(GracePeriod + time.Minute)

	h.clerk.err = errors.New("clerk down")
	n, err := h.svc.RunOnce(ctx)
	require.NoError(t, err)
	require.Zero(t, n)
	require.Equal(t, []string{KindClerk + ": " + messageClerk}, h.reporter.kinds)
	var attempts, accounts int
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT attempts FROM account_deletions WHERE account_id = $1`, h.w.A).Scan(&attempts))
	require.Equal(t, 1, attempts)
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT count(*) FROM accounts WHERE id = $1`, h.w.A).Scan(&accounts))
	require.Equal(t, 1, accounts, "nothing was deleted")

	h.clerk.err = nil
	n, err = h.svc.RunOnce(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, n, "the next run completes it")
}

func TestRunOnce_AnEmailThatFailsIsReportedButDeletesAnyway(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	_, err := h.svc.Request(ctx, h.w.A, ConfirmWord, true)
	require.NoError(t, err)
	require.Empty(t, h.reporter.kinds)
	h.notify.err = errors.New("mail down")
	h.now = h.now.Add(GracePeriod + time.Minute)
	n, err := h.svc.RunOnce(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	require.Equal(t, []string{KindNotify + ": " + messageNotify}, h.reporter.kinds)
}

func TestRunOnce_StopsWithTheContext(t *testing.T) {
	h := newHarness(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := h.svc.RunOnce(ctx)
	require.Error(t, err)
	done := make(chan struct{})
	go func() { h.svc.RunEvery(ctx, time.Hour); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("RunEvery did not stop with its context")
	}
}

func TestReconcileDeleted_DeletesAgainWhatClerkNoLongerHas(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	gone := map[string]bool{"user_" + h.w.A.String(): true}
	exists := func(_ context.Context, id string) (bool, error) {
		if strings.HasPrefix(id, "user_") && strings.HasSuffix(id, h.w.A.String()) {
			return !gone[id], nil
		}
		return true, nil
	}
	// Dry run by default: lists, deletes nothing.
	res, err := h.svc.ReconcileDeleted(ctx, exists, ReconcileOptions{})
	require.NoError(t, err)
	require.GreaterOrEqual(t, res.Checked, 3)
	require.Equal(t, []uuid.UUID{h.w.A}, res.Gone)
	require.Zero(t, res.Deleted)
	var accounts, records int
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT count(*) FROM accounts WHERE id = $1`, h.w.A).Scan(&accounts))
	require.Equal(t, 1, accounts, "a dry run deletes nothing")

	// Over the limit (20% of the linked accounts by default): nothing is deleted.
	// A wrong Clerk key: it says nobody exists, so every account looks gone.
	nobody := func(context.Context, string) (bool, error) { return false, nil }
	res, err = h.svc.ReconcileDeleted(ctx, nobody, ReconcileOptions{Apply: true})
	require.ErrorIs(t, err, ErrTooManyGone)
	require.Zero(t, res.Deleted)
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT count(*) FROM accounts WHERE id = $1`, h.w.A).Scan(&accounts))
	require.Equal(t, 1, accounts)

	res, err = h.svc.ReconcileDeleted(ctx, exists, ReconcileOptions{Apply: true, Max: 5})
	require.NoError(t, err)
	require.Equal(t, 1, res.Deleted)
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT count(*) FROM accounts WHERE id = $1`, h.w.A).Scan(&accounts))
	require.Zero(t, accounts)
	require.NoError(t, h.pool.QueryRow(ctx, `SELECT count(*) FROM account_deletions WHERE account_id = $1 AND completed_at IS NOT NULL`, h.w.A).Scan(&records))
	require.Equal(t, 1, records, "the deletion is recorded")

	_, err = h.svc.ReconcileDeleted(ctx, func(context.Context, string) (bool, error) { return false, errors.New("down") }, ReconcileOptions{Apply: true})
	require.Error(t, err)
}

// --- the handler

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

func TestHandler_RequestReadAndCancel(t *testing.T) {
	h := newHarness(t)
	responder := httpx.NewResponder(&recorder{})
	verifier := authmwtest.NewVerifier(t, responder)
	handler := NewHandler(h.svc, responder)
	r := chi.NewRouter()
	r.Use(verifier.Middleware)
	r.Get("/accounts/{accountId}/deletion", handler.GetDeletion)
	r.Post("/accounts/{accountId}/deletion", handler.RequestDeletion)
	r.Post("/accounts/{accountId}/deletion/cancel", handler.CancelDeletion)
	clerkA := "user_" + h.w.A.String()
	do := func(method, path, token, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec
	}
	base := "/accounts/" + h.w.A.String() + "/deletion"

	rec := do(http.MethodGet, base, verifier.Token(t, clerkA), "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"status":"none"}`, rec.Body.String())

	rec = do(http.MethodPost, base, verifier.TokenVerifiedMinutesAgo(t, clerkA, 2), `{"confirm":"borrar"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), `"confirm"`)
	rec = do(http.MethodPost, base, verifier.TokenVerifiedMinutesAgo(t, clerkA, 2), `not json`)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rec = do(http.MethodPost, base, verifier.TokenVerifiedMinutesAgo(t, clerkA, 45), `{"confirm":"ELIMINAR"}`)
	require.Equal(t, http.StatusForbidden, rec.Code, "a sign-in older than 10 minutes must verify again")
	var clerkErr struct {
		ClerkError struct {
			Type, Reason string
			Metadata     struct {
				Reverification struct {
					Level        string `json:"level"`
					AfterMinutes int    `json:"afterMinutes"`
				} `json:"reverification"`
			} `json:"metadata"`
		} `json:"clerk_error"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &clerkErr))
	require.Equal(t, "reverification-error", clerkErr.ClerkError.Reason)
	require.Equal(t, "first_factor", clerkErr.ClerkError.Metadata.Reverification.Level)
	require.Equal(t, 10, clerkErr.ClerkError.Metadata.Reverification.AfterMinutes)

	rec = do(http.MethodPost, base, verifier.TokenVerifiedMinutesAgo(t, clerkA, 2), `{"confirm":"ELIMINAR"}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"status":"pending"`)
	require.Contains(t, rec.Body.String(), `"subscriptionCanceled":true`)
	require.Contains(t, rec.Body.String(), `"familyNotified":1`)

	rec = do(http.MethodPost, base, verifier.TokenVerifiedMinutesAgo(t, clerkA, 2), `{"confirm":"ELIMINAR"}`)
	require.Equal(t, http.StatusConflict, rec.Code)
	require.Contains(t, rec.Body.String(), "scheduledFor")

	rec = do(http.MethodGet, base, verifier.Token(t, clerkA), "")
	require.Contains(t, rec.Body.String(), `"status":"pending"`)

	rec = do(http.MethodPost, base+"/cancel", verifier.Token(t, clerkA), "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.JSONEq(t, `{"status":"none"}`, rec.Body.String())

	h.svc.cancel = func(context.Context, uuid.UUID) (bool, error) { return false, errors.New("down") }
	rec = do(http.MethodPost, base, verifier.TokenVerifiedMinutesAgo(t, clerkA, 2), `{"confirm":"ELIMINAR"}`)
	require.Equal(t, http.StatusBadGateway, rec.Code)
	require.Contains(t, rec.Body.String(), "subscription_cancel_failed")

	for _, path := range []string{"/accounts/not-a-uuid/deletion", "/accounts/not-a-uuid/deletion/cancel"} {
		require.Equal(t, http.StatusNotFound, do(http.MethodPost, path, verifier.Token(t, clerkA), `{"confirm":"ELIMINAR"}`).Code)
	}
	require.Equal(t, http.StatusNotFound, do(http.MethodGet, "/accounts/not-a-uuid/deletion", verifier.Token(t, clerkA), "").Code)
}

// --- the e-mails

type captureSender struct{ messages []mailer.Message }

func (c *captureSender) Send(_ context.Context, m mailer.Message) error {
	c.messages = append(c.messages, m)
	return nil
}

func TestMailer_TheThreeEmailsNameNoChildAndNoHealthData(t *testing.T) {
	sender := &captureSender{}
	m := NewMailer(sender, nil, "PediTrack <a@b.c>")
	ctx := context.Background()
	date := time.Date(2026, 12, 12, 18, 0, 0, 0, time.UTC)
	require.NoError(t, m.Requested(ctx, "ana@x.test", "Ana", date))
	require.NoError(t, m.FamilyNotice(ctx, "beto@x.test", "Ana", date))
	require.NoError(t, m.Completed(ctx, "ana@x.test", ""))
	require.Len(t, sender.messages, 3)
	require.Equal(t, "Tu cuenta de PediTrack se borrará el 12 de diciembre de 2026", sender.messages[0].Subject)
	require.Contains(t, sender.messages[1].Text, "Ana pidió eliminar su cuenta")
	require.Contains(t, sender.messages[2].Text, "Hola:")
	for _, msg := range sender.messages {
		lower := strings.ToLower(msg.Text + msg.Subject)
		for _, word := range []string{"mateo", "consulta", "receta", "medicamento", "vacuna", "diagn"} {
			require.NotContains(t, lower, word)
		}
	}
	require.ErrorIs(t, m.Requested(ctx, "", "Ana", date), errNoAddress)
	var nilMailer *Mailer
	require.NoError(t, nilMailer.Completed(ctx, "x@y.z", "Ana"))
}

func TestLongDate_IsInMexicoCityTime(t *testing.T) {
	// 03:00 UTC on 1 Jan is still 31 Dec in Mexico City.
	require.Equal(t, "31 de diciembre de 2026", LongDate(time.Date(2027, 1, 1, 3, 0, 0, 0, time.UTC)))
}
