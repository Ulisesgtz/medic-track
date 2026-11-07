package cabinet_test

import (
	"bytes"
	"context"
	"encoding/base64"
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
	"github.com/Ulisesgtz/medic-track/backend/internal/cabinet"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// specs/062: the family's medicine cabinet, against the real database.

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

func newAccount(t *testing.T, pool *pgxpool.Pool, plan account.Plan) uuid.UUID {
	t.Helper()
	suffix := fmt.Sprintf("%d.%s", time.Now().UnixNano(), uuid.NewString()[:6])
	acc := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: "cabinet." + suffix + "@example.com", Plan: plan,
		Children: []account.Child{{FirstName: "Hijo", LastName: "Prueba", BirthDate: time.Now().AddDate(-3, 0, 0)}},
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return acc.ID
}

func intp(n int) *int { return &n }

func med(name string) cabinet.Input {
	return cabinet.Input{Name: name, Strength: "160 mg/5 ml", Quantity: 2, Unit: "bottle", Expires: cabinet.Expires{Year: 2027, Month: 3}}
}

// jpeg is a bare JPEG signature: enough for imagecheck.
var jpeg = append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{1}, 32)...)

func TestValidate(t *testing.T) {
	in, errs := cabinet.Validate(cabinet.Input{Name: "  Paracetamol  ", Strength: " 500 mg ", Quantity: 0, Unit: "tablet",
		Expires: cabinet.Expires{Year: 2027, Month: 2, Day: intp(28)}, Note: " cajón "})
	require.Empty(t, errs)
	require.Equal(t, "Paracetamol", in.Name)
	require.Equal(t, "500 mg", in.Strength)
	require.Equal(t, "cajón", in.Note)

	_, errs = cabinet.Validate(cabinet.Input{Name: " ", Strength: strings.Repeat("x", 61), Quantity: 1000, Unit: "jar",
		Expires: cabinet.Expires{Year: 2027, Month: 2, Day: intp(30)}, Note: strings.Repeat("n", 501)})
	fields := []string{}
	for _, e := range errs {
		fields = append(fields, e.Field)
	}
	require.Equal(t, []string{"name", "strength", "quantity", "unit", "expires", "note"}, fields)
	require.Contains(t, errs.Error(), "name")

	for _, e := range []cabinet.Expires{{Year: 1999, Month: 1}, {Year: 2027, Month: 13}, {Year: 2027, Month: 1, Day: intp(0)}} {
		_, errs = cabinet.Validate(cabinet.Input{Name: "x", Unit: "ml", Expires: e})
		require.Len(t, errs, 1)
	}
	_, errs = cabinet.Validate(cabinet.Input{Name: strings.Repeat("ñ", 121), Unit: "ml", Expires: cabinet.Expires{Year: 2027, Month: 1}})
	require.Equal(t, "name", errs[0].Field)
}

func TestDecodePhoto(t *testing.T) {
	raw, errs := cabinet.DecodePhoto(base64.StdEncoding.EncodeToString(jpeg))
	require.Empty(t, errs)
	require.Equal(t, jpeg, raw)
	for _, bad := range []string{"%%%", "", base64.StdEncoding.EncodeToString([]byte("not an image at all"))} {
		_, errs = cabinet.DecodePhoto(bad)
		require.Len(t, errs, 1)
	}
	_, errs = cabinet.DecodePhoto(base64.StdEncoding.EncodeToString(append(jpeg, make([]byte, 5<<20)...)))
	require.Equal(t, "La foto puede pesar hasta 5 MB.", errs[0].Message)
}

func TestRepository_AlphabeticalEditRemovePhoto(t *testing.T) {
	pool := testPool(t)
	svc := cabinet.NewService(cabinet.NewRepository(pool))
	ctx := context.Background()
	owner := newAccount(t, pool, account.PlanPaid)

	for _, n := range []string{"Suero oral", "ácido fólico", "Amoxicilina", "Paracetamol"} {
		_, err := svc.Create(ctx, owner, owner, med(n), "")
		require.NoError(t, err)
	}
	items, paid, err := svc.List(ctx, owner)
	require.NoError(t, err)
	require.True(t, paid)
	names := []string{}
	for _, it := range items {
		names = append(names, it.Name)
	}
	require.Equal(t, []string{"ácido fólico", "Amoxicilina", "Paracetamol", "Suero oral"}, names, "alphabetical without accents")
	require.Equal(t, "Ana", items[0].CreatedBy)
	require.Nil(t, items[0].UpdatedBy)

	// With a photo; editing keeps it, replaces it or removes it.
	it, err := svc.Create(ctx, owner, owner, med("Loratadina"), base64.StdEncoding.EncodeToString(jpeg))
	require.NoError(t, err)
	require.True(t, it.HasPhoto)
	photo, err := svc.Photo(ctx, owner, it.ID)
	require.NoError(t, err)
	require.Equal(t, jpeg, photo)

	edit := med("Loratadina")
	edit.Quantity = 1
	edit.Expires.Day = intp(12)
	it, err = svc.Update(ctx, owner, it.ID, owner, edit, nil)
	require.NoError(t, err)
	require.True(t, it.HasPhoto)
	require.Equal(t, 1, it.Quantity)
	require.Equal(t, 12, *it.Expires.Day)
	require.Equal(t, "Ana", *it.UpdatedBy)
	require.NotNil(t, it.UpdatedAt)

	other := base64.StdEncoding.EncodeToString(append(jpeg, 9))
	it, err = svc.Update(ctx, owner, it.ID, owner, edit, &other)
	require.NoError(t, err)
	photo, _ = svc.Photo(ctx, owner, it.ID)
	require.Equal(t, append(jpeg, 9), photo)

	empty := ""
	it, err = svc.Update(ctx, owner, it.ID, owner, edit, &empty)
	require.NoError(t, err)
	require.False(t, it.HasPhoto)
	_, err = svc.Photo(ctx, owner, it.ID)
	require.ErrorIs(t, err, cabinet.ErrItemNotFound)

	bad := "nope"
	_, err = svc.Update(ctx, owner, it.ID, owner, edit, &bad)
	require.Error(t, err)

	require.NoError(t, svc.Delete(ctx, owner, it.ID))
	require.ErrorIs(t, svc.Delete(ctx, owner, it.ID), cabinet.ErrItemNotFound)
	_, err = svc.Get(ctx, owner, it.ID)
	require.ErrorIs(t, err, cabinet.ErrItemNotFound)
	_, err = svc.Update(ctx, owner, it.ID, owner, edit, nil)
	require.ErrorIs(t, err, cabinet.ErrItemNotFound)

	// Another family's medicine is never reached.
	stranger := newAccount(t, pool, account.PlanPaid)
	_, err = svc.Get(ctx, stranger, items[0].ID)
	require.ErrorIs(t, err, cabinet.ErrItemNotFound)
	_, err = svc.Create(ctx, owner, owner, cabinet.Input{}, "")
	require.Error(t, err)
	_, err = svc.Create(ctx, owner, owner, med("x"), "bad")
	require.Error(t, err)
}

func TestRepository_PlanAndCap(t *testing.T) {
	pool := testPool(t)
	svc := cabinet.NewService(cabinet.NewRepository(pool))
	ctx := context.Background()

	free := newAccount(t, pool, account.PlanFree)
	_, err := svc.Create(ctx, free, free, med("Zinc"), "")
	require.ErrorIs(t, err, cabinet.ErrPlanRequired)

	// What was saved while paid stays: seen, edited and removed with the plan lapsed.
	owner := newAccount(t, pool, account.PlanPaid)
	it, err := svc.Create(ctx, owner, owner, med("Zinc"), "")
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, owner)
	require.NoError(t, err)
	items, paid, err := svc.List(ctx, owner)
	require.NoError(t, err)
	require.False(t, paid)
	require.Len(t, items, 1)
	_, err = svc.Update(ctx, owner, it.ID, owner, med("Zinc"), nil)
	require.NoError(t, err)
	require.NoError(t, svc.Delete(ctx, owner, it.ID))

	// The cap, with simultaneous adds: never more than MaxItems.
	full := newAccount(t, pool, account.PlanPaid)
	_, err = pool.Exec(ctx, `
		INSERT INTO medicine_cabinet_items (account_id, name, quantity, unit, expires_year, expires_month, created_by_account_id)
		SELECT $1, 'M' || g, 1, 'box', 2027, 1, $1 FROM generate_series(1, $2::int - 2) g`, full, cabinet.MaxItems)
	require.NoError(t, err)
	var wg sync.WaitGroup
	errs := make([]error, 5)
	for i := range errs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = svc.Create(ctx, full, full, med(fmt.Sprintf("Extra %d", i)), "")
		}(i)
	}
	wg.Wait()
	var kept int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM medicine_cabinet_items WHERE account_id = $1`, full).Scan(&kept))
	require.Equal(t, cabinet.MaxItems, kept)
	limited := 0
	for _, e := range errs {
		if e != nil {
			require.ErrorIs(t, e, cabinet.ErrLimit)
			limited++
		}
	}
	require.Equal(t, 3, limited)

	// An account that doesn't exist reads as not paid.
	_, paid, err = svc.List(ctx, uuid.New())
	require.NoError(t, err)
	require.False(t, paid)
}

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

func router(pool *pgxpool.Pool, rec *capture, level access.Level, actor uuid.UUID) http.Handler {
	h := cabinet.NewHandler(cabinet.NewService(cabinet.NewRepository(pool)), httpx.NewResponder(rec))
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(access.WithAccess(r.Context(), access.Access{Level: level, ActorAccountID: actor})))
		})
	})
	r.Get("/accounts/{accountId}/medicine-cabinet", h.ListItems)
	r.Post("/accounts/{accountId}/medicine-cabinet", h.CreateItem)
	r.Get("/accounts/{accountId}/medicine-cabinet/{itemId}", h.GetItem)
	r.Put("/accounts/{accountId}/medicine-cabinet/{itemId}", h.UpdateItem)
	r.Delete("/accounts/{accountId}/medicine-cabinet/{itemId}", h.DeleteItem)
	r.Get("/accounts/{accountId}/medicine-cabinet/{itemId}/photo", h.GetPhoto)
	return r
}

func call(t *testing.T, r http.Handler, method, path, body string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	var out map[string]any
	if rec.Body.Len() > 0 {
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out), rec.Body.String())
	}
	return rec.Code, out
}

func TestHandler(t *testing.T) {
	pool := testPool(t)
	owner := newAccount(t, pool, account.PlanPaid)
	log := &capture{}
	r := router(pool, log, access.Full, owner)
	base := "/accounts/" + owner.String() + "/medicine-cabinet"

	code, list := call(t, r, http.MethodGet, base, "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, []any{}, list["items"])
	require.Equal(t, true, list["canAdd"])
	require.Equal(t, true, list["canEdit"])
	require.Equal(t, float64(200), list["limit"])

	body := `{"name":"Secreto Paracetamol","strength":"160 mg/5 ml","quantity":2,"unit":"bottle","expires":{"year":2027,"month":3},"note":"nota secreta","photoBase64":"` +
		base64.StdEncoding.EncodeToString(jpeg) + `"}`
	code, item := call(t, r, http.MethodPost, base, body)
	require.Equal(t, http.StatusCreated, code, item)
	require.Equal(t, "Secreto Paracetamol", item["name"])
	require.Equal(t, true, item["hasPhoto"])
	require.Equal(t, map[string]any{"year": float64(2027), "month": float64(3), "day": nil}, item["expires"])
	id := item["id"].(string)

	code, item = call(t, r, http.MethodGet, base+"/"+id, "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "Ana", item["createdBy"])
	code, photo := call(t, r, http.MethodGet, base+"/"+id+"/photo", "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, base64.StdEncoding.EncodeToString(jpeg), photo["photoBase64"])

	code, item = call(t, r, http.MethodPut, base+"/"+id, `{"name":"Secreto Paracetamol","quantity":1,"unit":"bottle","expires":{"year":2027,"month":3,"day":12}}`)
	require.Equal(t, http.StatusOK, code, item)
	require.Equal(t, float64(1), item["quantity"])
	require.Equal(t, true, item["hasPhoto"], "absent keeps the photo")
	require.NotNil(t, item["updatedAt"])

	// Invalid bodies: field errors by name, never the values.
	code, bad := call(t, r, http.MethodPost, base, `{"name":"Secreto","unit":"jar","expires":{"year":2027,"month":3}}`)
	require.Equal(t, http.StatusBadRequest, code)
	require.Contains(t, fmt.Sprint(bad["details"]), "quantity")
	require.Contains(t, fmt.Sprint(bad["details"]), "unit")
	code, _ = call(t, r, http.MethodPut, base+"/"+id, `{"name":"","quantity":1,"unit":"ml","expires":{"year":2027,"month":1}}`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = call(t, r, http.MethodPut, base+"/"+id, `{"name":"x","unit":"ml","expires":{"year":2027,"month":1}}`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = call(t, r, http.MethodPost, base, `{`)
	require.Equal(t, http.StatusBadRequest, code)
	code, _ = call(t, r, http.MethodPut, base+"/"+id, `{`)
	require.Equal(t, http.StatusBadRequest, code)

	// Not found and malformed ids.
	for _, p := range []string{base + "/" + uuid.NewString(), base + "/not-a-uuid", base + "/" + uuid.NewString() + "/photo"} {
		code, _ = call(t, r, http.MethodGet, p, "")
		require.Equal(t, http.StatusNotFound, code, p)
	}
	code, _ = call(t, r, http.MethodGet, "/accounts/nope/medicine-cabinet", "")
	require.Equal(t, http.StatusNotFound, code)
	code, _ = call(t, r, http.MethodPut, base+"/"+uuid.NewString(), `{"name":"x","quantity":1,"unit":"ml","expires":{"year":2027,"month":1}}`)
	require.Equal(t, http.StatusNotFound, code)

	// A Caregiver (Mark) reads with canEdit false.
	mark := router(pool, &capture{}, access.Mark, owner)
	code, list = call(t, mark, http.MethodGet, base, "")
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, false, list["canAdd"])
	require.Equal(t, false, list["items"].([]any)[0].(map[string]any)["canEdit"])

	code, _ = call(t, r, http.MethodDelete, base+"/"+id, "")
	require.Equal(t, http.StatusNoContent, code)
	code, _ = call(t, r, http.MethodDelete, base+"/"+id, "")
	require.Equal(t, http.StatusNotFound, code)

	// The free plan: 422 medicine_cabinet; the cap: 422 cabinet_limit_exceeded.
	free := newAccount(t, pool, account.PlanFree)
	fr := router(pool, log, access.Full, free)
	code, refused := call(t, fr, http.MethodPost, "/accounts/"+free.String()+"/medicine-cabinet", body)
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "medicine_cabinet", refused["reason"])

	full := newAccount(t, pool, account.PlanPaid)
	_, err := pool.Exec(context.Background(), `
		INSERT INTO medicine_cabinet_items (account_id, name, quantity, unit, expires_year, expires_month, created_by_account_id)
		SELECT $1, 'M' || g, 1, 'box', 2027, 1, $1 FROM generate_series(1, $2::int) g`, full, cabinet.MaxItems)
	require.NoError(t, err)
	code, refused = call(t, router(pool, log, access.Full, full), http.MethodPost, "/accounts/"+full.String()+"/medicine-cabinet", body)
	require.Equal(t, http.StatusUnprocessableEntity, code)
	require.Equal(t, "cabinet_limit_exceeded", refused["error"])

	// Nothing the parent wrote reaches error_logs.
	time.Sleep(50 * time.Millisecond)
	log.mu.Lock()
	defer log.mu.Unlock()
	require.NotEmpty(t, log.entries)
	for _, e := range log.entries {
		require.NotContains(t, e.Message, "Secreto")
		require.NotContains(t, e.Message, "nota secreta")
	}
}

func TestHandler_DatabaseUnavailable(t *testing.T) {
	pool := testPool(t)
	closed, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	require.NoError(t, err)
	closed.Close()
	owner := newAccount(t, pool, account.PlanPaid)
	r := router(closed, &capture{}, access.Full, owner)
	base := "/accounts/" + owner.String() + "/medicine-cabinet"
	id := uuid.NewString()
	ok := `{"name":"x","quantity":1,"unit":"ml","expires":{"year":2027,"month":1}}`
	for _, c := range []struct{ method, path, body string }{
		{http.MethodGet, base, ""}, {http.MethodPost, base, ok}, {http.MethodGet, base + "/" + id, ""},
		{http.MethodPut, base + "/" + id, ok}, {http.MethodDelete, base + "/" + id, ""}, {http.MethodGet, base + "/" + id + "/photo", ""},
	} {
		code, _ := call(t, r, c.method, c.path, c.body)
		require.Equal(t, http.StatusInternalServerError, code, c.method+" "+c.path)
	}
}
