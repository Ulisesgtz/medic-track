package childrecord_test

import (
	"bytes"
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

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/childrecord"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
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

type family struct{ accountID, childID uuid.UUID }

func newAccount(t *testing.T, pool *pgxpool.Pool, first string, withChild bool) family {
	t.Helper()
	acc := &account.Account{
		FirstName: first, LastName: "Prueba", Plan: account.PlanFree,
		Email: fmt.Sprintf("childrecord.%d.%s@example.com", time.Now().UnixNano(), uuid.NewString()[:6]),
	}
	if withChild {
		h := 85.0
		acc.Children = []account.Child{{FirstName: "Mateo", LastName: "Prueba", BirthDate: time.Now().UTC().AddDate(-2, 0, 0), Height: &h}}
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	f := family{accountID: acc.ID}
	if withChild {
		f.childID = acc.Children[0].ID
	}
	return f
}

func content(allergy string) childrecord.Content {
	c, errs := childrecord.Validate(childrecord.Content{
		BloodType:    s("O+"),
		Pediatrician: &childrecord.Pediatrician{Name: s("Dra. Ruiz"), Phone: s("+52 33 1234 5678")},
		Allergies:    []childrecord.Allergy{{Name: allergy, Kind: s("medication"), Note: s("ronchas")}, {Name: "Cacahuate"}},
		Conditions:   []childrecord.Condition{{Name: "Asma"}},
	})
	if len(errs) > 0 {
		panic(errs.Error())
	}
	return c
}

func TestRepository_GetWithoutRecord(t *testing.T) {
	pool := testPool(t)
	fam := newAccount(t, pool, "Ana", true)
	rec, err := childrecord.NewRepository(pool).Get(context.Background(), fam.childID)
	require.NoError(t, err)
	require.False(t, rec.Exists)
	require.Equal(t, 0, rec.Version)
	require.Empty(t, rec.Allergies)
	require.NotNil(t, rec.Allergies)
	require.Nil(t, rec.UpdatedAt)
}

func TestRepository_SaveCreateEditUnchangedAndEmpty(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	repo := childrecord.NewRepository(pool)
	fam := newAccount(t, pool, "Ana", true)
	luis := newAccount(t, pool, "Luis", false)

	// An empty sheet that never existed is not created.
	rec, err := repo.Save(ctx, fam.childID, fam.accountID, childrecord.Content{}, 0)
	require.NoError(t, err)
	require.False(t, rec.Exists)
	var n int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM child_records WHERE child_id = $1`, fam.childID).Scan(&n))
	require.Zero(t, n)

	rec, err = repo.Save(ctx, fam.childID, fam.accountID, content("Penicilina"), 0)
	require.NoError(t, err)
	require.True(t, rec.Exists)
	require.Equal(t, 1, rec.Version)
	require.Equal(t, "Ana", *rec.UpdatedBy)
	require.Equal(t, "Penicilina", rec.Allergies[0].Name)
	require.Equal(t, "Cacahuate", rec.Allergies[1].Name, "the order is kept")
	require.Equal(t, "Dra. Ruiz", *rec.Pediatrician.Name)
	firstAt := *rec.UpdatedAt

	// Saving the same again by someone else changes nothing: version, author and date stay.
	same, err := repo.Save(ctx, fam.childID, luis.accountID, content("Penicilina"), 1)
	require.NoError(t, err)
	require.Equal(t, 1, same.Version)
	require.Equal(t, "Ana", *same.UpdatedBy)
	require.True(t, firstAt.Equal(*same.UpdatedAt))

	// A real change by the Tutor.
	edited := content("Amoxicilina")
	edited.Allergies = edited.Allergies[:1]
	rec, err = repo.Save(ctx, fam.childID, luis.accountID, edited, 1)
	require.NoError(t, err)
	require.Equal(t, 2, rec.Version)
	require.Equal(t, "Luis", *rec.UpdatedBy)
	require.Len(t, rec.Allergies, 1)
	require.Equal(t, "Amoxicilina", rec.Allergies[0].Name)

	// Emptying a sheet that had something is saved.
	rec, err = repo.Save(ctx, fam.childID, fam.accountID, childrecord.Content{}, 2)
	require.NoError(t, err)
	require.Equal(t, 3, rec.Version)
	require.True(t, rec.Exists)
	require.Empty(t, rec.Allergies)
	require.Nil(t, rec.Pediatrician)
	require.Nil(t, rec.BloodType)
}

func TestRepository_ConflictAndUnknownChild(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	repo := childrecord.NewRepository(pool)
	fam := newAccount(t, pool, "Ana", true)

	_, err := repo.Save(ctx, fam.childID, fam.accountID, content("A"), 3)
	var conflict *childrecord.ConflictError
	require.ErrorAs(t, err, &conflict)
	require.Equal(t, 0, conflict.Current.Version)
	require.Contains(t, conflict.Error(), "someone else")

	_, err = repo.Save(ctx, fam.childID, fam.accountID, content("A"), 0)
	require.NoError(t, err)
	_, err = repo.Save(ctx, fam.childID, fam.accountID, content("B"), 0)
	require.ErrorAs(t, err, &conflict)
	require.Equal(t, 1, conflict.Current.Version)
	require.Equal(t, "A", conflict.Current.Allergies[0].Name)

	_, err = repo.Save(ctx, uuid.New(), fam.accountID, content("A"), 0)
	require.ErrorIs(t, err, childrecord.ErrNotFound)
}

func TestRepository_TwoSimultaneousSavesOneWinsOneConflicts(t *testing.T) {
	pool := testPool(t)
	repo := childrecord.NewRepository(pool)
	fam := newAccount(t, pool, "Ana", true)
	var wg sync.WaitGroup
	results := make([]error, 4)
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, results[i] = repo.Save(context.Background(), fam.childID, fam.accountID, content(fmt.Sprintf("Alergia %d", i)), 0)
		}(i)
	}
	wg.Wait()
	wins, conflicts := 0, 0
	for _, err := range results {
		var c *childrecord.ConflictError
		switch {
		case err == nil:
			wins++
		case asConflict(err, &c):
			conflicts++
		default:
			require.NoError(t, err)
		}
	}
	require.Equal(t, 1, wins)
	require.Equal(t, 3, conflicts)
}

func asConflict(err error, target **childrecord.ConflictError) bool {
	c, ok := err.(*childrecord.ConflictError)
	if ok {
		*target = c
	}
	return ok
}

func TestRepository_FailsOnADeadPool(t *testing.T) {
	pool := testPool(t)
	dead, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	require.NoError(t, err)
	dead.Close()
	repo := childrecord.NewRepository(dead)
	_, err = repo.Get(context.Background(), uuid.New())
	require.Error(t, err)
	_, err = repo.Save(context.Background(), uuid.New(), uuid.New(), childrecord.Content{}, 0)
	require.Error(t, err)
	_ = pool
}

// --- the handler, behind a stand-in of the access middleware ---

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
	time.Sleep(300 * time.Millisecond) // the responder writes in the background
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]errorlog.Entry{}, c.entries...)
}

func serve(pool *pgxpool.Pool, actor uuid.UUID, level access.Level, log *capture) http.Handler {
	h := childrecord.NewHandler(childrecord.NewRepository(pool), httpx.NewResponder(log))
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(access.WithAccess(req.Context(), access.Access{Level: level, ActorAccountID: actor})))
		})
	})
	r.Get("/children/{childId}/record", h.GetRecord)
	r.Put("/children/{childId}/record", h.PutRecord)
	return r
}

func call(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, bytes.NewBufferString(body)))
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &m), rec.Body.String())
	return m
}

func TestHandler_TheContract(t *testing.T) {
	pool := testPool(t)
	log := &capture{}
	fam := newAccount(t, pool, "Ana", true)
	owner := serve(pool, fam.accountID, access.Full, log)
	caregiver := serve(pool, fam.accountID, access.Mark, log)
	path := "/children/" + fam.childID.String() + "/record"

	rec := call(owner, http.MethodGet, path, "")
	require.Equal(t, http.StatusOK, rec.Code)
	got := decode(t, rec)
	require.Equal(t, false, got["exists"])
	require.Equal(t, true, got["canEdit"])
	require.Equal(t, []any{}, got["allergies"])
	require.Nil(t, got["pediatrician"])
	require.Nil(t, got["updated"])
	require.Equal(t, false, decode(t, call(caregiver, http.MethodGet, path, ""))["canEdit"])

	body := `{"expectedVersion":0,"bloodType":"O+","generalNote":null,
		"pediatrician":{"name":"Dra. Ruiz","phone":"+52 33 1234 5678","office":null},
		"allergies":[{"name":"Penicilina","kind":"medication","note":"le salen ronchas"},{"name":"Cacahuate","kind":"food","note":null}],
		"conditions":[{"name":"Asma","note":null}]}`
	rec = call(owner, http.MethodPut, path, body)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	got = decode(t, rec)
	require.Equal(t, true, got["exists"])
	require.Equal(t, float64(1), got["version"])
	require.Equal(t, "Ana", got["updated"].(map[string]any)["by"])
	require.Equal(t, "Penicilina", got["allergies"].([]any)[0].(map[string]any)["name"])

	// The same body again with the new version: no change.
	rec = call(owner, http.MethodPut, path, strings.Replace(body, `"expectedVersion":0`, `"expectedVersion":1`, 1))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, float64(1), decode(t, rec)["version"])

	// The old version: 409 with the current sheet, not logged.
	before := len(log.all())
	rec = call(owner, http.MethodPut, path, strings.Replace(body, `"Asma"`, `"Otra"`, 1))
	require.Equal(t, http.StatusConflict, rec.Code)
	conflict := decode(t, rec)
	require.Equal(t, "record_conflict", conflict["error"])
	require.Equal(t, float64(1), conflict["current"].(map[string]any)["version"])
	require.Equal(t, before, len(log.all()), "a conflict is an expected state")

	// Bad requests.
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPut, path, `{`).Code)
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPut, path, `{"allergies":[]}`).Code)
	require.Equal(t, http.StatusBadRequest, call(owner, http.MethodPut, path, `{"expectedVersion":-1}`).Code)
	rec = call(owner, http.MethodPut, path, `{"expectedVersion":1,"allergies":[{"name":""}]}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), `"field":"allergies[0].name"`)

	// Unknown and malformed child ids.
	require.Equal(t, http.StatusNotFound, call(owner, http.MethodPut, "/children/"+uuid.NewString()+"/record", `{"expectedVersion":0,"bloodType":"A+"}`).Code)
	require.Equal(t, http.StatusNotFound, call(owner, http.MethodPut, "/children/nope/record", `{"expectedVersion":0}`).Code)
	require.Equal(t, http.StatusNotFound, call(owner, http.MethodGet, "/children/nope/record", "").Code)

	// A session without an account can't be an author.
	require.Equal(t, http.StatusInternalServerError, call(serve(pool, uuid.Nil, access.Full, log), http.MethodPut, path, `{"expectedVersion":1}`).Code)
}

func TestHandler_StoreFailuresAreFixedMessages(t *testing.T) {
	pool := testPool(t)
	dead, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	require.NoError(t, err)
	dead.Close()
	h := serve(dead, uuid.New(), access.Full, &capture{})
	path := "/children/" + uuid.NewString() + "/record"
	require.Equal(t, http.StatusInternalServerError, call(h, http.MethodGet, path, "").Code)
	require.Equal(t, http.StatusInternalServerError, call(h, http.MethodPut, path, `{"expectedVersion":0}`).Code)
	_ = pool
}

// TestErrorLogsNeverCarryTheRecord: whatever the failure, what the parent wrote never reaches error_logs (Principio II).
func TestErrorLogsNeverCarryTheRecord(t *testing.T) {
	pool := testPool(t)
	log := &capture{}
	fam := newAccount(t, pool, "Ana", true)
	h := serve(pool, fam.accountID, access.Full, log)
	path := "/children/" + fam.childID.String() + "/record"
	secret := "ALERGIA-RECONOCIBLE-9917"

	bodies := []string{
		fmt.Sprintf(`{"expectedVersion":0,"bloodType":"Z+","generalNote":%q,"allergies":[{"name":%q,"kind":"nope","note":%q}],"conditions":[{"name":""}],"pediatrician":{"phone":%q}}`, secret, secret, secret, secret),
		fmt.Sprintf(`{"expectedVersion":0,"allergies":[{"name":%q}]`, secret), // malformed
		fmt.Sprintf(`{"allergies":[{"name":%q}]}`, secret),                    // no version
	}
	for _, b := range bodies {
		require.Equal(t, http.StatusBadRequest, call(h, http.MethodPut, path, b).Code)
	}
	// A real save and then a conflict that carries the sheet in its body, plus an unknown child.
	require.Equal(t, http.StatusOK, call(h, http.MethodPut, path, fmt.Sprintf(`{"expectedVersion":0,"allergies":[{"name":%q}]}`, secret)).Code)
	require.Equal(t, http.StatusConflict, call(h, http.MethodPut, path, fmt.Sprintf(`{"expectedVersion":0,"allergies":[{"name":%q}]}`, secret+"2")).Code)
	require.Equal(t, http.StatusNotFound, call(h, http.MethodPut, "/children/"+uuid.NewString()+"/record", fmt.Sprintf(`{"expectedVersion":0,"generalNote":%q}`, secret)).Code)

	entries := log.all()
	require.NotEmpty(t, entries)
	for _, e := range entries {
		require.NotContains(t, e.Message, secret)
		require.NotContains(t, e.Endpoint, secret)
		require.NotContains(t, e.File, secret)
	}
}
