package ops_test

import (
	"context"
	"encoding/json"
	"fmt"
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

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/ops"
)

const testKey = "a-long-operation-key-for-tests"

// ---- the key (no database)

func TestRequireKey_OnlyTheRightBearerKeyGetsThrough(t *testing.T) {
	reached := 0
	h := ops.RequireKey(testKey)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		reached++
		_, _ = w.Write([]byte("secret data"))
	}))
	do := func(authorization string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/ops/error-logs", nil)
		if authorization != "" {
			req.Header.Set("Authorization", authorization)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	ok := do("Bearer " + testKey)
	require.Equal(t, http.StatusOK, ok.Code)
	require.Equal(t, "secret data", ok.Body.String())
	require.Equal(t, 1, reached)

	// Everything else answers exactly like an unknown route, with no hint of why.
	unknown := httptest.NewRecorder()
	http.NotFound(unknown, httptest.NewRequest(http.MethodGet, "/nope", nil))
	for _, bad := range []string{
		"",
		"Bearer ",
		"Bearer wrong",
		"Bearer " + testKey + "x",
		"Bearer " + testKey[:len(testKey)-1],
		"bearer " + testKey,
		"Basic " + testKey,
		testKey,
		"Bearer  " + testKey,
	} {
		rec := do(bad)
		require.Equal(t, http.StatusNotFound, rec.Code, bad)
		require.Equal(t, unknown.Body.String(), rec.Body.String(), bad)
		require.Equal(t, unknown.Header().Get("Content-Type"), rec.Header().Get("Content-Type"), bad)
		require.NotContains(t, rec.Body.String(), "secret")
	}
	require.Equal(t, 1, reached, "a wrong key never reaches the handler")
}

// ---- the queries (real database)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

func newRouter(t *testing.T, pool *pgxpool.Pool) http.Handler {
	t.Helper()
	repo := errorlog.NewRepository(pool)
	h := ops.NewHandler(repo, httpx.NewResponder(repo))
	r := chi.NewRouter()
	r.Use(ops.RequireKey(testKey))
	r.Get("/ops/error-logs", h.ListErrorLogs)
	r.Get("/ops/error-logs/summary", h.ErrorLogSummary)
	return r
}

func get(t *testing.T, router http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("Authorization", "Bearer "+testKey)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func marker() string { return "test-" + uuid.NewString()[:8] }

func insertAt(t *testing.T, pool *pgxpool.Pool, endpoint, message string, status *int, account *uuid.UUID, at time.Time) {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO error_logs (message, http_status, endpoint, file, line, account_id, created_at)
		VALUES ($1, $2, $3, 'file.go', 7, $4, $5) RETURNING id
	`, message, status, endpoint, account, at).Scan(&id))
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM error_logs WHERE id = $1`, id) })
}

type listBody struct {
	Entries []struct {
		ID         string  `json:"id"`
		CreatedAt  string  `json:"createdAt"`
		Message    string  `json:"message"`
		HTTPStatus *int    `json:"httpStatus"`
		Endpoint   string  `json:"endpoint"`
		File       string  `json:"file"`
		Line       int     `json:"line"`
		AccountID  *string `json:"accountId"`
	} `json:"entries"`
	NextCursor *string `json:"nextCursor"`
}

func TestListErrorLogs_ReturnsTheEntriesNewestFirstWithoutAnythingPersonal(t *testing.T) {
	pool := testPool(t)
	router := newRouter(t, pool)
	ep := marker()
	now := time.Now().UTC().Truncate(time.Second)
	insertAt(t, pool, ep, "older", intPtr(400), nil, now.Add(-time.Hour))
	insertAt(t, pool, ep, "newer", nil, nil, now)

	rec := get(t, router, "/ops/error-logs?endpoint="+ep)

	require.Equal(t, http.StatusOK, rec.Code)
	var body listBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.Entries, 2)
	require.Equal(t, "newer", body.Entries[0].Message)
	require.Nil(t, body.Entries[0].HTTPStatus)
	require.Equal(t, 400, *body.Entries[1].HTTPStatus)
	require.Equal(t, "file.go", body.Entries[0].File)
	require.Equal(t, 7, body.Entries[0].Line)
	require.Equal(t, now.Format(time.RFC3339), body.Entries[0].CreatedAt)
	require.Nil(t, body.NextCursor)
	// Only what the table has: no email, and the key is nowhere.
	require.NotContains(t, rec.Body.String(), "@")
	require.NotContains(t, rec.Body.String(), testKey)
}

func TestListErrorLogs_FiltersAndDefaultsToTheLastSevenDays(t *testing.T) {
	pool := testPool(t)
	router := newRouter(t, pool)
	ep := marker()
	now := time.Now().UTC()
	insertAt(t, pool, ep, "ancient", nil, nil, now.Add(-30*24*time.Hour))
	insertAt(t, pool, ep, "week-old-ish", intPtr(500), nil, now.Add(-3*24*time.Hour))
	insertAt(t, pool, ep, "today", intPtr(400), nil, now.Add(-time.Hour))
	messages := func(path string) []string {
		rec := get(t, router, path)
		require.Equal(t, http.StatusOK, rec.Code, path)
		var body listBody
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		out := make([]string, 0, len(body.Entries))
		for _, e := range body.Entries {
			out = append(out, e.Message)
		}
		return out
	}

	require.Equal(t, []string{"today", "week-old-ish"}, messages("/ops/error-logs?endpoint="+ep), "default: 7 days")
	require.Equal(t, []string{"today", "week-old-ish", "ancient"}, messages("/ops/error-logs?endpoint="+ep+"&since="+now.Add(-60*24*time.Hour).Format(time.RFC3339)))
	require.Equal(t, []string{"week-old-ish"}, messages("/ops/error-logs?endpoint="+ep+"&status=500"))
	require.Equal(t, []string{"today"}, messages("/ops/error-logs?endpointPrefix="+ep+"&until="+now.Format(time.RFC3339)+"&status=400"))
	require.Empty(t, messages("/ops/error-logs?endpoint=nothing-"+ep), "an empty period is a list, not an error")
}

func TestListErrorLogs_PagesByCursor(t *testing.T) {
	pool := testPool(t)
	router := newRouter(t, pool)
	ep := marker()
	now := time.Now().UTC()
	for i := 0; i < 5; i++ {
		insertAt(t, pool, ep, fmt.Sprintf("m%d", i), nil, nil, now.Add(-time.Duration(i)*time.Minute))
	}

	var seen []string
	path := "/ops/error-logs?limit=2&endpoint=" + ep
	for pages := 0; path != "" && pages < 10; pages++ {
		rec := get(t, router, path)
		require.Equal(t, http.StatusOK, rec.Code)
		var body listBody
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		for _, e := range body.Entries {
			seen = append(seen, e.Message)
		}
		path = ""
		if body.NextCursor != nil {
			path = "/ops/error-logs?limit=2&endpoint=" + ep + "&cursor=" + *body.NextCursor
		}
	}

	require.Equal(t, []string{"m0", "m1", "m2", "m3", "m4"}, seen)
}

func TestErrorLogs_RejectWhatIsInvalidWithoutReadingTheTable(t *testing.T) {
	pool := testPool(t)
	router := newRouter(t, pool)
	for path, field := range map[string]string{
		"/ops/error-logs?since=yesterday":                                       "since",
		"/ops/error-logs?until=2026-09-30":                                      "until",
		"/ops/error-logs?since=2026-09-30T10:00:00Z&until=2026-09-29T10:00:00Z": "until",
		"/ops/error-logs?limit=0":                                               "limit",
		"/ops/error-logs?limit=501":                                             "limit",
		"/ops/error-logs?limit=many":                                            "limit",
		"/ops/error-logs?status=abc":                                            "status",
		"/ops/error-logs?status=-1":                                             "status",
		"/ops/error-logs?accountId=not-a-uuid":                                  "accountId",
		"/ops/error-logs?cursor=garbage":                                        "cursor",
		"/ops/error-logs?cursor=" + "bm90LWEtY3Vyc29y":                          "cursor", // "not-a-cursor"
		"/ops/error-logs?endpoint=/a&endpointPrefix=job:":                       "endpointPrefix",
		"/ops/error-logs/summary?status=abc":                                    "status",
		"/ops/error-logs/summary?accountId=x":                                   "accountId",
	} {
		rec := get(t, router, path)
		require.Equal(t, http.StatusBadRequest, rec.Code, path)
		require.Contains(t, rec.Body.String(), `"error":"validation_error"`, path)
		require.Contains(t, rec.Body.String(), `"field":"`+field+`"`, path)
	}
	// The limit is a parameter of the list only: the summary has none to reject.
	require.Equal(t, http.StatusOK, get(t, router, "/ops/error-logs/summary?limit=9999&cursor=x").Code)
}

func TestErrorLogSummary_GroupsWithTheirCounts(t *testing.T) {
	pool := testPool(t)
	router := newRouter(t, pool)
	ep := marker()
	now := time.Now().UTC().Truncate(time.Second)
	for i := 0; i < 3; i++ {
		insertAt(t, pool, ep, "email is required", intPtr(400), nil, now.Add(-time.Duration(i)*time.Hour))
	}
	insertAt(t, pool, ep, "tick failed", nil, nil, now)

	rec := get(t, router, "/ops/error-logs/summary?endpoint="+ep)

	require.Equal(t, http.StatusOK, rec.Code)
	var body struct {
		Groups []struct {
			Endpoint   string `json:"endpoint"`
			HTTPStatus *int   `json:"httpStatus"`
			Message    string `json:"message"`
			Count      int    `json:"count"`
			FirstSeen  string `json:"firstSeen"`
			LastSeen   string `json:"lastSeen"`
		} `json:"groups"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.Groups, 2)
	require.Equal(t, "email is required", body.Groups[0].Message)
	require.Equal(t, 3, body.Groups[0].Count)
	require.Equal(t, 400, *body.Groups[0].HTTPStatus)
	require.Equal(t, now.Add(-2*time.Hour).Format(time.RFC3339), body.Groups[0].FirstSeen)
	require.Equal(t, now.Format(time.RFC3339), body.Groups[0].LastSeen)
	require.Nil(t, body.Groups[1].HTTPStatus)

	empty := get(t, router, "/ops/error-logs/summary?endpoint=nothing-"+ep)
	require.Equal(t, http.StatusOK, empty.Code)
	require.JSONEq(t, `{"groups":[]}`, empty.Body.String())
}

func TestErrorLogs_ADatabaseFailureIsAnInternalError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()
	router := newRouter(t, pool)

	for _, path := range []string{"/ops/error-logs", "/ops/error-logs/summary"} {
		rec := get(t, router, path)
		require.Equal(t, http.StatusInternalServerError, rec.Code, path)
		require.True(t, strings.Contains(rec.Body.String(), `"error":"internal_error"`), path)
	}
}

func intPtr(i int) *int { return &i }

// ---- what reaches error_logs

type countingRecorder struct {
	mu    sync.Mutex
	count int
}

func (c *countingRecorder) Create(context.Context, *errorlog.Entry) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.count++
	return nil
}

func (c *countingRecorder) got() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.count
}

type noRows struct{}

func (noRows) List(context.Context, errorlog.Filter) ([]errorlog.Entry, bool, error) {
	return nil, false, nil
}
func (noRows) Summary(context.Context, errorlog.Filter) ([]errorlog.SummaryRow, error) {
	return nil, nil
}

func TestWrongKeysNeverFillTheLogButRealMistakesOfTheTeamAreLogged(t *testing.T) {
	recorder := &countingRecorder{}
	h := ops.NewHandler(noRows{}, httpx.NewResponder(recorder))
	r := chi.NewRouter()
	r.Use(ops.RequireKey(testKey))
	r.Get("/ops/error-logs", h.ListErrorLogs)

	// Anyone can guess: none of it may write a row (or the table could be filled by sending wrong keys).
	for i := 0; i < 25; i++ {
		req := httptest.NewRequest(http.MethodGet, "/ops/error-logs", nil)
		req.Header.Set("Authorization", fmt.Sprintf("Bearer wrong-%d", i))
		r.ServeHTTP(httptest.NewRecorder(), req)
	}
	time.Sleep(200 * time.Millisecond)
	require.Zero(t, recorder.got())

	// Someone who holds the key and asks for something invalid is answered through the Responder, like any handler.
	rec := get(t, r, "/ops/error-logs?limit=0")
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Eventually(t, func() bool { return recorder.got() == 1 }, time.Second, 10*time.Millisecond)
}
