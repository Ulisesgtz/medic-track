package errorlog_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
)

// specs/039-digest-semanal-errores: what the weekly digest needs from the log. Same rule as query_test.go: every test writes
// under an endpoint of its own.

func TestFilter_ExcludeEndpointPrefixLeavesOutOnlyThatPrefix(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	insertAt(t, pool, ep+"/a", "a", intPtr(400), nil, base)
	insertAt(t, pool, ep+"/job_one", "a process", nil, nil, base)
	insertAt(t, pool, ep+"/jobx", "not a process: the underscore is literal", nil, nil, base)

	got, _, err := repo.List(context.Background(), errorlog.Filter{
		EndpointPrefix:        ep,
		ExcludeEndpointPrefix: ep + "/job_",
		Limit:                 10,
	})

	require.NoError(t, err)
	var messages []string
	for _, e := range got {
		messages = append(messages, e.Message)
	}
	require.ElementsMatch(t, []string{"a", "not a process: the underscore is literal"}, messages)
}

func TestFilter_ExcludeEndpointPrefixSeparatesJobsFromRequests(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	insertAt(t, pool, ep, "request", intPtr(500), nil, base)
	insertAt(t, pool, "job:"+ep, "process", nil, nil, base)

	// Both are read through a period no other test writes to would be fragile; the markers do the narrowing instead.
	requests, err := repo.Summary(context.Background(), errorlog.Filter{Endpoint: ep, ExcludeEndpointPrefix: "job:"})
	require.NoError(t, err)
	require.Len(t, requests, 1)
	require.Equal(t, "request", requests[0].Message)

	processes, err := repo.Summary(context.Background(), errorlog.Filter{Endpoint: "job:" + ep, ExcludeEndpointPrefix: "job:"})
	require.NoError(t, err)
	require.Empty(t, processes, "excluding the prefix leaves out a job even when asked for it by name")
}

func TestStats_CountsEntriesGroupsAndDistinctAccounts(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	accountA := createTestAccount(t, pool)
	accountB := createTestAccount(t, pool)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM error_logs WHERE account_id IN ($1, $2)`, accountA, accountB)
	})
	// Two entries of one group (one from each account), a second group from the first account again, and a third with no account.
	insertAt(t, pool, ep, "same", intPtr(400), &accountA, base)
	insertAt(t, pool, ep, "same", intPtr(400), &accountB, base.Add(time.Minute))
	insertAt(t, pool, ep, "other", intPtr(500), &accountA, base.Add(2*time.Minute))
	insertAt(t, pool, ep, "no account", nil, nil, base.Add(3*time.Minute))

	got, err := repo.Stats(context.Background(), errorlog.Filter{Endpoint: ep})

	require.NoError(t, err)
	require.Equal(t, errorlog.Stats{Entries: 4, Groups: 3, Accounts: 2}, got)
}

func TestStats_RespectsThePeriodAndAnEmptyResultIsZero(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	insertAt(t, pool, ep, "old", intPtr(400), nil, base.Add(-48*time.Hour))
	insertAt(t, pool, ep, "recent", intPtr(400), nil, base)

	got, err := repo.Stats(context.Background(), errorlog.Filter{Endpoint: ep, Since: base.Add(-time.Hour)})
	require.NoError(t, err)
	require.Equal(t, errorlog.Stats{Entries: 1, Groups: 1, Accounts: 0}, got)

	none, err := repo.Stats(context.Background(), errorlog.Filter{Endpoint: ep + "-nothing"})
	require.NoError(t, err)
	require.Equal(t, errorlog.Stats{}, none)
}

func TestOldestEntry(t *testing.T) {
	pool := testPool(t)
	repo := errorlog.NewRepository(pool)
	ep := marker(t)
	ancient := time.Date(2001, 1, 1, 0, 0, 0, 0, time.UTC)
	insertAt(t, pool, ep, "ancient", intPtr(400), nil, ancient)
	insertAt(t, pool, ep, "recent", intPtr(400), nil, base)

	mine, err := repo.OldestEntry(context.Background(), errorlog.Filter{Endpoint: ep})
	require.NoError(t, err)
	require.NotNil(t, mine)
	require.True(t, mine.Equal(ancient))

	// Without a filter it is the oldest of the whole table: never later than the one just written.
	all, err := repo.OldestEntry(context.Background(), errorlog.Filter{})
	require.NoError(t, err)
	require.NotNil(t, all)
	require.False(t, all.After(ancient))

	// A filter that selects nothing has no oldest entry.
	none, err := repo.OldestEntry(context.Background(), errorlog.Filter{Endpoint: ep + "-nothing"})
	require.NoError(t, err)
	require.Nil(t, none)
}

func TestStatsAndOldestEntry_ConnectionError(t *testing.T) {
	broken := errorlog.NewRepository(closedPool(t, dsnOrSkip(t)))
	_, err := broken.Stats(context.Background(), errorlog.Filter{})
	require.Error(t, err)
	_, err = broken.OldestEntry(context.Background(), errorlog.Filter{})
	require.Error(t, err)
}
