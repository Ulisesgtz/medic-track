package errorlog_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
)

// specs/021: reading the log and purging it by age. The table is shared with the rest of the suite, so every test writes
// its rows under an endpoint of its own and reads them back through that endpoint.

func marker(t *testing.T) string { return "test-" + uuid.NewString()[:8] }

func insertAt(t *testing.T, pool *pgxpool.Pool, endpoint, message string, status *int, account *uuid.UUID, at time.Time) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO error_logs (message, http_status, endpoint, file, line, account_id, created_at)
		VALUES ($1, $2, $3, 'file.go', 7, $4, $5) RETURNING id
	`, message, status, endpoint, account, at).Scan(&id))
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM error_logs WHERE id = $1`, id) })
	return id
}

var base = time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)

func TestList_NewestFirstWithTheFieldsOfTheEntry(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	account := createTestAccount(t, pool)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM error_logs WHERE account_id = $1`, account)
	})
	older := insertAt(t, pool, ep, "older", intPtr(400), nil, base.Add(-time.Hour))
	newer := insertAt(t, pool, ep, "newer", nil, &account, base)

	got, more, err := repo.List(context.Background(), errorlog.Filter{Endpoint: ep, Limit: 10})

	require.NoError(t, err)
	require.False(t, more)
	require.Len(t, got, 2)
	require.Equal(t, newer, got[0].ID)
	require.Equal(t, older, got[1].ID)
	require.Equal(t, "newer", got[0].Message)
	require.Nil(t, got[0].HTTPStatus)
	require.Equal(t, &account, got[0].AccountID)
	require.Equal(t, "file.go", got[0].File)
	require.Equal(t, 7, got[0].Line)
	require.Equal(t, 400, *got[1].HTTPStatus)
	require.True(t, got[0].CreatedAt.Equal(base))
}

func TestList_Filters(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	account := createTestAccount(t, pool)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM error_logs WHERE account_id = $1`, account)
	})
	insertAt(t, pool, ep+"/a", "a", intPtr(400), nil, base.Add(-48*time.Hour))
	insertAt(t, pool, ep+"/a", "b", intPtr(500), &account, base.Add(-2*time.Hour))
	insertAt(t, pool, ep+"/b", "c", intPtr(400), nil, base)
	insertAt(t, pool, "job:"+ep, "d", nil, nil, base)
	insertAt(t, pool, "xjob:"+ep, "not a job", nil, nil, base)
	messages := func(f errorlog.Filter) []string {
		f.Limit = 50
		got, _, err := repo.List(context.Background(), f)
		require.NoError(t, err)
		out := make([]string, 0, len(got))
		for _, e := range got {
			out = append(out, e.Message)
		}
		return out
	}

	require.Equal(t, []string{"c", "b", "a"}, messages(errorlog.Filter{EndpointPrefix: ep}))
	require.Equal(t, []string{"b", "a"}, messages(errorlog.Filter{Endpoint: ep + "/a"}))
	require.Equal(t, []string{"c", "b"}, messages(errorlog.Filter{EndpointPrefix: ep, Since: base.Add(-24 * time.Hour)}))
	require.Equal(t, []string{"a"}, messages(errorlog.Filter{EndpointPrefix: ep, Until: base.Add(-24 * time.Hour)}))
	require.Equal(t, []string{"c", "a"}, messages(errorlog.Filter{EndpointPrefix: ep, Status: intPtr(400)}))
	require.Equal(t, []string{"b"}, messages(errorlog.Filter{EndpointPrefix: ep, AccountID: &account}))
	// A prefix is literal: `job:` finds the job, not "xjob:", and "_" / "%" don't act as wildcards.
	require.Equal(t, []string{"d"}, messages(errorlog.Filter{EndpointPrefix: "job:" + ep}))
	require.Empty(t, messages(errorlog.Filter{EndpointPrefix: "job_" + ep}))
	require.Empty(t, messages(errorlog.Filter{EndpointPrefix: "%" + ep}))
}

func TestList_PagesByCursorWithoutRepeatingOrSkippingEvenWhileNewErrorsArrive(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	for i := 0; i < 5; i++ {
		insertAt(t, pool, ep, fmt.Sprintf("m%d", i), nil, nil, base.Add(time.Duration(i)*time.Minute))
	}
	// Two with the very same instant: the id breaks the tie, so neither is lost at a page boundary.
	insertAt(t, pool, ep, "tie-1", nil, nil, base)
	insertAt(t, pool, ep, "tie-2", nil, nil, base)
	var seen []string

	first, more, err := repo.List(context.Background(), errorlog.Filter{Endpoint: ep, Limit: 3})
	require.NoError(t, err)
	require.True(t, more)
	require.Len(t, first, 3)
	for _, e := range first {
		seen = append(seen, e.Message)
	}

	// A new error arrives between pages: it is newer than the cursor, so it does not shift the next page.
	insertAt(t, pool, ep, "arrived-later", nil, nil, base.Add(time.Hour))
	after := &errorlog.Cursor{CreatedAt: first[2].CreatedAt, ID: first[2].ID}
	for after != nil {
		page, more, err := repo.List(context.Background(), errorlog.Filter{Endpoint: ep, Limit: 3, After: after})
		require.NoError(t, err)
		for _, e := range page {
			seen = append(seen, e.Message)
		}
		after = nil
		if more {
			after = &errorlog.Cursor{CreatedAt: page[len(page)-1].CreatedAt, ID: page[len(page)-1].ID}
		}
	}

	require.ElementsMatch(t, []string{"m4", "m3", "m2", "m1", "m0", "tie-1", "tie-2"}, seen, "each exactly once, none skipped")
	require.Len(t, seen, 7)
}

func TestList_ExactlyALimitOfRowsIsNotMore(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	for i := 0; i < 3; i++ {
		insertAt(t, pool, ep, "x", nil, nil, base.Add(time.Duration(i)*time.Second))
	}

	got, more, err := repo.List(context.Background(), errorlog.Filter{Endpoint: ep, Limit: 3})

	require.NoError(t, err)
	require.Len(t, got, 3)
	require.False(t, more)
}

func TestList_ConnectionError(t *testing.T) {
	broken := errorlog.NewRepository(closedPool(t, dsnOrSkip(t)))
	_, _, err := broken.List(context.Background(), errorlog.Filter{Limit: 1})
	require.Error(t, err)
	_, err = broken.Summary(context.Background(), errorlog.Filter{})
	require.Error(t, err)
	_, err = broken.DeleteOlderThan(context.Background(), base, 10)
	require.Error(t, err)
}

func TestSummary_GroupsByEndpointStatusAndMessageMostFrequentFirst(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	for i := 0; i < 3; i++ {
		insertAt(t, pool, ep+"/a", "email is required", intPtr(400), nil, base.Add(time.Duration(i)*time.Hour))
	}
	insertAt(t, pool, ep+"/a", "email is required", intPtr(422), nil, base) // another status: another group
	insertAt(t, pool, ep+"/b", "tick failed", nil, nil, base.Add(5*time.Hour))
	insertAt(t, pool, ep+"/b", "tick failed", nil, nil, base.Add(4*time.Hour))
	insertAt(t, pool, ep+"/c", "once", nil, nil, base)

	got, err := repo.Summary(context.Background(), errorlog.Filter{EndpointPrefix: ep})

	require.NoError(t, err)
	require.Len(t, got, 4)
	require.Equal(t, 3, got[0].Count)
	require.Equal(t, ep+"/a", got[0].Endpoint)
	require.Equal(t, 400, *got[0].HTTPStatus)
	require.True(t, got[0].FirstSeen.Equal(base))
	require.True(t, got[0].LastSeen.Equal(base.Add(2*time.Hour)))
	require.Equal(t, 2, got[1].Count)
	require.Nil(t, got[1].HTTPStatus)
	require.True(t, got[1].LastSeen.Equal(base.Add(5*time.Hour)))
	// A tie in the count puts the most recent first: "once" and the 422 both happened once, at the same instant.
	require.Equal(t, 1, got[2].Count)
	require.Equal(t, 1, got[3].Count)
}

func TestSummary_RespectsThePeriod(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	insertAt(t, pool, ep, "old", nil, nil, base.Add(-10*24*time.Hour))
	insertAt(t, pool, ep, "new", nil, nil, base)

	got, err := repo.Summary(context.Background(), errorlog.Filter{Endpoint: ep, Since: base.Add(-24 * time.Hour)})

	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, "new", got[0].Message)
}

func TestDeleteOlderThan_OnlyTheOldestInBatchesAndNothingNewer(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	ancient := time.Date(2005, 1, 1, 0, 0, 0, 0, time.UTC)
	cutoff := time.Date(2010, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		insertAt(t, pool, ep, fmt.Sprintf("old-%d", i), nil, nil, ancient.Add(time.Duration(i)*time.Hour))
	}
	recent := insertAt(t, pool, ep, "recent", nil, nil, base)
	remaining := func() int {
		var n int
		require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM error_logs WHERE endpoint = $1`, ep).Scan(&n))
		return n
	}

	first, err := repo.DeleteOlderThan(context.Background(), cutoff, 3)
	require.NoError(t, err)
	require.Equal(t, 3, first, "a batch is at most its size")
	require.Equal(t, 3, remaining())

	second, err := repo.DeleteOlderThan(context.Background(), cutoff, 3)
	require.NoError(t, err)
	require.Equal(t, 2, second, "the last batch is smaller: nothing left")
	third, err := repo.DeleteOlderThan(context.Background(), cutoff, 3)
	require.NoError(t, err)
	require.Zero(t, third)

	var stillThere uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT id FROM error_logs WHERE endpoint = $1`, ep).Scan(&stillThere))
	require.Equal(t, recent, stillThere, "what is newer than the cutoff is never touched")
}

func dsnOrSkip(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	return dsn
}
