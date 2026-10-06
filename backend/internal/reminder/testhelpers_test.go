package reminder_test

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
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

func closedPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()
	return pool
}

var testConfig = reminder.Config{
	VAPIDPublicKey:  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
	VAPIDPrivateKey: "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls",
	VAPIDSubject:    "test@example.com",
	ActionSecret:    "test-action-secret",
}

// family is an account with one child, a consultation and a medication, to hang doses on.
type family struct {
	accountID      uuid.UUID
	childID        uuid.UUID
	consultationID uuid.UUID
	medicationID   uuid.UUID
}

func newFamily(t *testing.T, pool *pgxpool.Pool, detail *string) family {
	t.Helper()
	ctx := context.Background()
	var f family
	email := fmt.Sprintf("reminder.%s@example.com", uuid.NewString())
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO accounts (first_name, last_name, email, plan, reminder_detail) VALUES ('Ana', 'Gómez', $1, 'paid', $2) RETURNING id
	`, email, detail).Scan(&f.accountID))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO children (account_id, first_name, last_name, birth_date) VALUES ($1, 'Mateo', 'Gómez', '2021-03-14') RETURNING id
	`, f.accountID).Scan(&f.childID))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO consultations (child_id, doctor_name, consult_date, photo) VALUES ($1, 'Dra. López', CURRENT_DATE, '\x00') RETURNING id
	`, f.childID).Scan(&f.consultationID))
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO medications (consultation_id, name, frequency_hours, duration_days, start_time) VALUES ($1, 'Amoxicilina', 8, 1, '08:00') RETURNING id
	`, f.consultationID).Scan(&f.medicationID))
	return f
}

func (f family) dose(t *testing.T, pool *pgxpool.Pool, at time.Time, taken bool) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO doses (medication_id, scheduled_at, taken) VALUES ($1, $2, $3) RETURNING id
	`, f.medicationID, at, taken).Scan(&id))
	return id
}

func (f family) device(t *testing.T, repo *reminder.Repository, endpoint string) reminder.Device {
	t.Helper()
	d, _, err := repo.UpsertDevice(context.Background(), f.accountID, endpoint, "p256dh-"+endpoint, "auth-"+endpoint)
	require.NoError(t, err)
	return d
}

// activatedAt moves a device's activation back in time, so doses scheduled after it count.
func activatedAt(t *testing.T, pool *pgxpool.Pool, deviceID uuid.UUID, at time.Time) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `UPDATE reminder_devices SET activated_at = $1 WHERE id = $2`, at, deviceID)
	require.NoError(t, err)
}

func uniqueEndpoint() string {
	return "https://fcm.googleapis.com/fcm/send/test-" + uuid.NewString()
}

// browserKeys are a real P-256 public key and auth secret, as a browser's PushSubscription has, so
// the payload can actually be encrypted for them.
func browserKeys(t *testing.T) (p256dh, auth string) {
	t.Helper()
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	require.NoError(t, err)
	secret := make([]byte, 16)
	_, err = rand.Read(secret)
	require.NoError(t, err)
	return base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes()), base64.RawURLEncoding.EncodeToString(secret)
}

// fakeSender records every push and answers with the result set for its endpoint.
type fakeSender struct {
	mu      sync.Mutex
	sent    []sentPush
	results map[string]reminder.SendResult
}

type sentPush struct {
	device  reminder.Device
	payload []byte
}

func (f *fakeSender) Send(_ context.Context, device reminder.Device, payload []byte) (reminder.SendResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, sentPush{device: device, payload: payload})
	if r, ok := f.results[device.Endpoint]; ok {
		if r == reminder.Failed {
			return r, fmt.Errorf("network error")
		}
		return r, nil
	}
	return reminder.Delivered, nil
}

func (f *fakeSender) sentTo(deviceID uuid.UUID) []sentPush {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []sentPush
	for _, s := range f.sent {
		if s.device.ID == deviceID {
			out = append(out, s)
		}
	}
	return out
}

func deviceActive(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) bool {
	t.Helper()
	var active bool
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT active FROM reminder_devices WHERE id = $1`, id).Scan(&active))
	return active
}

func doseTaken(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) bool {
	t.Helper()
	var taken bool
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT taken FROM doses WHERE id = $1`, id).Scan(&taken))
	return taken
}

func strPtr(s string) *string { return &s }

// addMember makes a new person (their own account) a member of f's family with the role, and returns a `family` that has
// that person's account — so `.device(...)` registers a device for THEM — and f's child, consultation and medication
// (specs/032). `status` 'active' joins; anything else is a member who already left or was removed.
func (f family) addMember(t *testing.T, pool *pgxpool.Pool, role, status string, detail *string) family {
	t.Helper()
	ctx := context.Background()
	m := f
	email := fmt.Sprintf("reminder.member.%s@example.com", uuid.NewString())
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO accounts (first_name, last_name, email, plan, reminder_detail) VALUES ('Luis', 'Gómez', $1, 'free', $2) RETURNING id
	`, email, detail).Scan(&m.accountID))
	var childID *uuid.UUID
	if role == "child" {
		childID = &f.childID
	}
	_, err := pool.Exec(ctx, `
		INSERT INTO family_members (family_account_id, account_id, role, child_id, invited_by_account_id, status, ended_at)
		VALUES ($1, $2, $3, $4, $1, $5, CASE WHEN $5 = 'active' THEN NULL ELSE now() END)
	`, f.accountID, m.accountID, role, childID, status)
	require.NoError(t, err)
	return m
}

func doseAuthor(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) (author *uuid.UUID, at *time.Time) {
	t.Helper()
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT taken_by_account_id, taken_at FROM doses WHERE id = $1`, id).Scan(&author, &at))
	return author, at
}
