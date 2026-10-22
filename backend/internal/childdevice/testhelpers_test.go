package childdevice_test

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/childdevice"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
)

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

// capture keeps what the Responder would write to error_logs.
type capture struct {
	mu      sync.Mutex
	entries []errorlog.Entry
}

func (c *capture) Create(_ context.Context, e *errorlog.Entry) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = append(c.entries, *e)
	return nil
}

func (c *capture) all() []errorlog.Entry {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]errorlog.Entry(nil), c.entries...)
}

// family is an owner account with a child (named Mateo), on the plan asked for.
type family struct {
	accountID, childID uuid.UUID
	clerkID            string
}

func newFamily(t *testing.T, pool *pgxpool.Pool, plan account.Plan) family {
	t.Helper()
	suffix := fmt.Sprintf("%d.%s", time.Now().UnixNano(), uuid.NewString()[:6])
	clerk := "user_childdev_" + suffix
	acc := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: "childdevice." + suffix + "@example.com", Plan: plan, ClerkUserID: &clerk,
		Children: []account.Child{{FirstName: "Mateo", LastName: "Prueba", BirthDate: time.Now().UTC().AddDate(-8, 0, 0)}},
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return family{accountID: acc.ID, childID: acc.Children[0].ID, clerkID: clerk}
}

// activeDevice inserts an active link of the family's child directly, as if its link had been redeemed at `redeemed`, and returns
// its credential.
func activeDevice(t *testing.T, pool *pgxpool.Pool, f family, name string, redeemed time.Time) (credential string, linkID uuid.UUID) {
	t.Helper()
	credential, hash, err := childdevice.NewToken()
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO child_device_links (child_id, account_id, name, created_by_account_id, status, expires_at, redeemed_at, credential_hash, rotated_at)
		VALUES ($1, $2, $3, $2, 'active', $4, $4, $5, $4) RETURNING id`,
		f.childID, f.accountID, name, redeemed, hash).Scan(&linkID))
	return credential, linkID
}

func hashOf(t *testing.T, credential string) []byte {
	t.Helper()
	h, ok := childdevice.ParseToken(credential)
	require.True(t, ok)
	return h
}
