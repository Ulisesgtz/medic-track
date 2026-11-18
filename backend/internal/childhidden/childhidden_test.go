package childhidden_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/childhidden"
)

func TestSQL_TheRuleOfHiddenWithAndWithoutAFamily(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	person, owner, shown, hidden := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}
	exec(`INSERT INTO accounts (id, first_name, last_name, email, plan) VALUES ($1, 'P', 'X', $3, 'free'), ($2, 'O', 'X', $4, 'paid')`,
		person, owner, person.String()+"@hidden.test", owner.String()+"@hidden.test")
	exec(`INSERT INTO children (id, account_id, first_name, last_name, birth_date, hidden_at) VALUES
		($1, $3, 'A', 'X', '2022-01-01', NULL), ($2, $3, 'B', 'X', '2022-01-01', now())`, shown, hidden, person)
	t.Cleanup(func() {
		for _, sql := range []string{`DELETE FROM family_members WHERE account_id = ANY($1::uuid[])`, `DELETE FROM children WHERE account_id = ANY($1::uuid[])`, `DELETE FROM accounts WHERE id = ANY($1::uuid[])`} {
			_, _ = pool.Exec(context.Background(), sql, []string{person.String(), owner.String()})
		}
	})

	isHidden := func(child uuid.UUID) bool {
		t.Helper()
		var got bool
		require.NoError(t, pool.QueryRow(ctx, `SELECT (`+childhidden.HiddenSQL("c")+`) FROM children c WHERE c.id = $1`, child).Scan(&got))
		return got
	}
	notHidden := func(expr string, arg any) bool {
		t.Helper()
		var got bool
		require.NoError(t, pool.QueryRow(ctx, `SELECT `+childhidden.NotHiddenChildSQL(expr), arg).Scan(&got))
		return got
	}

	// no family: the column means nothing
	require.False(t, isHidden(hidden))
	require.False(t, isHidden(shown))
	require.True(t, notHidden("$1::uuid", hidden))

	// a Caregiver or a Tutor: hidden only the one marked
	exec(`INSERT INTO family_members (family_account_id, account_id, role) VALUES ($1, $2, 'caregiver')`, owner, person)
	require.True(t, isHidden(hidden))
	require.False(t, isHidden(shown))
	require.False(t, notHidden("$1::uuid", hidden))
	require.True(t, notHidden("$1::uuid", shown))
	require.True(t, notHidden("$1::uuid", nil), "a person's own consultation has no child")

	// leaving: shown again at once
	exec(`UPDATE family_members SET status = 'left', ended_at = $2 WHERE account_id = $1`, person, time.Now())
	require.False(t, isHidden(hidden))
}
