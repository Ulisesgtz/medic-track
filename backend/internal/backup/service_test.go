package backup

import (
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"filippo.io/age"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
)

// --- fakes

type fakeRuns struct {
	mu         sync.Mutex
	runs       map[uuid.UUID]*Run
	checked    map[uuid.UUID]uuid.UUID // check run -> the backup it looked at
	order      []uuid.UUID
	failOK     error
	failNew    error
	failLatest error
	failStates error
}

func newFakeRuns() *fakeRuns {
	return &fakeRuns{runs: map[uuid.UUID]*Run{}, checked: map[uuid.UUID]uuid.UUID{}}
}

// checkFailed mirrors checkFailedSQL: the backup's most recent finished check failed at restore or verify.
func (f *fakeRuns) checkFailed(backup uuid.UUID) bool {
	for i := len(f.order) - 1; i >= 0; i-- {
		c := f.runs[f.order[i]]
		if c.Kind != KindCheck || c.Status == "running" || f.checked[c.ID] != backup {
			continue
		}
		return c.Status == "failed" && (*c.Failure == string(FailRestore) || *c.Failure == string(FailVerify))
	}
	return false
}

func (f *fakeRuns) ObjectStates(_ context.Context, env string) (map[string]string, error) {
	if f.failStates != nil {
		return nil, f.failStates
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	out := map[string]string{}
	for _, r := range f.runs {
		if r.Kind == KindBackup && r.Status == "ok" && r.Env == env {
			out[*r.ObjectKey] = StateOK
			if f.checkFailed(r.ID) {
				out[*r.ObjectKey] = StateCheckFailed
			}
		}
	}
	return out, nil
}

// record adds a finished backup of an object, as if a run had made it.
func (f *fakeRuns) record(env, key string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id := uuid.New()
	f.runs[id] = &Run{ID: id, Kind: KindBackup, Env: env, Status: "ok", ObjectKey: &key, TableCounts: map[string]int64{}}
	f.order = append(f.order, id)
}

func (f *fakeRuns) Start(_ context.Context, kind, env string) (uuid.UUID, error) {
	if f.failNew != nil {
		return uuid.Nil, f.failNew
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	id := uuid.New()
	f.runs[id] = &Run{ID: id, Kind: kind, Env: env, Status: "running", StartedAt: time.Now()}
	f.order = append(f.order, id)
	return id, nil
}

func (f *fakeRuns) FinishOK(_ context.Context, id uuid.UUID, key string, size *int64, counts map[string]int64, checked *uuid.UUID) error {
	if f.failOK != nil {
		return f.failOK
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	r := f.runs[id]
	r.Status, r.ObjectKey, r.SizeBytes, r.TableCounts = "ok", &key, size, counts
	if checked != nil {
		f.checked[id] = *checked
	}
	return nil
}

func (f *fakeRuns) FinishFailed(_ context.Context, id uuid.UUID, fl Failure, key *string, checked *uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	r := f.runs[id]
	s := string(fl)
	r.Status, r.Failure, r.ObjectKey = "failed", &s, key
	if checked != nil {
		f.checked[id] = *checked
	}
	return nil
}

func (f *fakeRuns) LatestValidBackup(_ context.Context, env string) (*Run, error) {
	if f.failLatest != nil {
		return nil, f.failLatest
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := len(f.order) - 1; i >= 0; i-- {
		r := f.runs[f.order[i]]
		if r.Kind == KindBackup && r.Status == "ok" && r.Env == env && !f.checkFailed(r.ID) {
			return r, nil
		}
	}
	return nil, ErrNoValidBackup
}

func (f *fakeRuns) BackupByObjectKey(_ context.Context, key string) (*Run, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, r := range f.runs {
		if r.Kind == KindBackup && r.Status == "ok" && r.ObjectKey != nil && *r.ObjectKey == key {
			return r, nil
		}
	}
	return nil, ErrNoValidBackup
}

func (f *fakeRuns) last() *Run { return f.runs[f.order[len(f.order)-1]] }

type fakeDumper struct {
	content string
	counts  map[string]int64
	err     error
}

func (d *fakeDumper) Dump(_ context.Context, w io.Writer) (map[string]int64, error) {
	if _, err := io.WriteString(w, d.content); err != nil {
		return nil, stepErr(FailDump, err)
	}
	if d.err != nil {
		return nil, d.err
	}
	return d.counts, nil
}

type fakeRestorer struct {
	got    map[string]int64
	err    error
	plain  string
	called bool
}

func (r *fakeRestorer) RestoreAndCount(_ context.Context, src io.Reader) (map[string]int64, error) {
	r.called = true
	b, _ := io.ReadAll(src)
	r.plain = string(b)
	return r.got, r.err
}

type recorder struct {
	mu      sync.Mutex
	entries []errorlog.Entry
	err     error
}

func (r *recorder) Create(_ context.Context, e *errorlog.Entry) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.entries = append(r.entries, *e)
	return r.err
}

func (r *recorder) messages() []string {
	var out []string
	for _, e := range r.entries {
		out = append(out, e.Message)
	}
	return out
}

func lockOK(context.Context) (func(), bool, error) { return func() {}, true, nil }

type harness struct {
	svc      *Service
	runs     *fakeRuns
	store    *MemoryStore
	dumper   *fakeDumper
	restorer *fakeRestorer
	rec      *recorder
	owner    *age.X25519Identity
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	owner, err := age.GenerateX25519Identity()
	require.NoError(t, err)
	check, err := age.GenerateX25519Identity()
	require.NoError(t, err)
	counts := map[string]int64{"accounts": 3, "doses": 40}
	h := &harness{
		runs:     newFakeRuns(),
		store:    NewMemoryStore(),
		dumper:   &fakeDumper{content: "PGDMP… Mateo amoxicilina", counts: counts},
		restorer: &fakeRestorer{got: map[string]int64{"accounts": 3, "doses": 40}},
		rec:      &recorder{},
		owner:    owner,
	}
	h.svc = &Service{
		Env:        "dev",
		Recipients: []age.Recipient{owner.Recipient(), check.Recipient()},
		Check:      check,
		Runs:       h.runs,
		Store:      h.store,
		Dumper:     h.dumper,
		Restorer:   h.restorer,
		Reporter:   NewReporter(h.rec),
		Lock:       lockOK,
		Now:        func() time.Time { return time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC) },
	}
	return h
}

// --- backup

func TestRunBackup_StoresAnEncryptedCopyAndRecordsIt(t *testing.T) {
	h := newHarness(t)
	res, err := h.svc.RunBackup(context.Background())
	require.NoError(t, err)
	require.Equal(t, "dev/2026-11-16T090000Z.dump.age", res.ObjectKey)
	require.Equal(t, 2, res.Tables)

	data, ok := h.store.Bytes(res.ObjectKey)
	require.True(t, ok)
	require.EqualValues(t, len(data), res.Size)
	require.True(t, strings.HasPrefix(string(data), "age-encryption.org/v1"))
	require.NotContains(t, string(data), "Mateo")

	run := h.runs.last()
	require.Equal(t, "ok", run.Status)
	require.Equal(t, int64(40), run.TableCounts["doses"])
	require.Empty(t, h.rec.entries, "a success writes nothing to error_logs")
}

func TestRunBackup_EachFailureLeavesNoCopyItsRunAndOneFixedRow(t *testing.T) {
	cases := []struct {
		name  string
		setup func(h *harness)
		want  Failure
	}{
		{"dump", func(h *harness) {
			h.dumper.err = stepErr(FailDump, errors.New("pg_dump: password authentication failed for postgres://u:p@host"))
		}, FailDump},
		{"snapshot", func(h *harness) { h.dumper.err = stepErr(FailSnapshot, errors.New("conn refused")) }, FailSnapshot},
		{"unknown dump error", func(h *harness) { h.dumper.err = errors.New("plain") }, FailDump},
		{"upload", func(h *harness) {
			h.store.FailPut = errors.New("403 at acc.r2.cloudflarestorage.com/peditrack-backups")
		}, FailUpload},
		{"record", func(h *harness) { h.runs.failOK = errors.New("db down") }, FailRecord},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(t)
			tc.setup(h)
			_, err := h.svc.RunBackup(context.Background())
			require.Error(t, err)
			list, _ := h.store.List(context.Background(), "")
			require.Empty(t, list, "no copy stays")
			require.Equal(t, []string{tc.want.Message()}, h.rec.messages())
			require.Equal(t, Endpoint, h.rec.entries[0].Endpoint)
			if tc.name != "record" {
				require.Equal(t, "failed", h.runs.last().Status)
				require.Equal(t, string(tc.want), *h.runs.last().Failure)
			}
		})
	}
}

func TestRunBackup_StartFailure(t *testing.T) {
	h := newHarness(t)
	h.runs.failNew = errors.New("db down")
	_, err := h.svc.RunBackup(context.Background())
	require.Error(t, err)
	require.Equal(t, []string{FailRecord.Message()}, h.rec.messages())
}

func TestRunBackup_Lock(t *testing.T) {
	h := newHarness(t)
	h.svc.Lock = func(context.Context) (func(), bool, error) { return func() {}, false, nil }
	_, err := h.svc.RunBackup(context.Background())
	require.ErrorIs(t, err, ErrBusy)
	require.Empty(t, h.rec.entries, "another run in progress is not a failure")
	require.Empty(t, h.runs.order)

	h.svc.Lock = func(context.Context) (func(), bool, error) { return nil, false, errors.New("conn") }
	_, err = h.svc.RunBackup(context.Background())
	require.Error(t, err)
	require.Equal(t, []string{FailLock.Message()}, h.rec.messages())
}

func TestRunBackup_EncryptFailsWithNoRecipient(t *testing.T) {
	h := newHarness(t)
	h.svc.Recipients = nil
	_, err := h.svc.RunBackup(context.Background())
	require.Error(t, err)
	require.Equal(t, []string{FailEncrypt.Message()}, h.rec.messages())
}

// --- retention

func TestApplyRetention(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	put := func(at time.Time) {
		key := ObjectKey("dev", at)
		h.store.SetObject(key, []byte("x"))
		h.runs.record("dev", key)
	}
	for i := 0; i < 20; i++ {
		put(time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC).AddDate(0, 0, -i))
	}
	h.store.SetObject("dev/readme.txt", []byte("x"))
	removed, err := h.svc.ApplyRetention(ctx)
	require.NoError(t, err)
	require.Greater(t, removed, 0)
	list, _ := h.store.List(ctx, "dev/")
	require.Len(t, list, 20-removed+1)
	_, ok := h.store.Bytes("dev/readme.txt")
	require.True(t, ok, "a foreign object is never touched")
	_, ok = h.store.Bytes(ObjectKey("dev", time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC)))
	require.True(t, ok, "the newest stays")

	h.store.FailList = errors.New("x")
	_, err = h.svc.ApplyRetention(ctx)
	require.Error(t, err)
	h.store.FailList = nil
	h.runs.failStates = errors.New("db down")
	_, err = h.svc.ApplyRetention(ctx)
	require.Error(t, err)
	h.runs.failStates = nil
	for i := 0; i < 20; i++ {
		put(time.Date(2025, 1, 1, 9, 0, 0, 0, time.UTC).AddDate(0, 0, -i))
	}
	h.store.FailDelete = errors.New("x")
	_, err = h.svc.ApplyRetention(ctx)
	require.Error(t, err)
	require.Equal(t, []string{FailRetention.Message(), FailRetention.Message(), FailRetention.Message()}, h.rec.messages())
}

func TestApplyRetention_AnUnrecordedCopyNeverReplacesTheGoodOne(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	day := time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC)
	good := ObjectKey("dev", day)
	h.store.SetObject(good, []byte("x"))
	h.runs.record("dev", good)
	// The same day, later: a run that died after the upload (nothing records it).
	orphan := ObjectKey("dev", day.Add(6*time.Hour))
	h.store.SetObject(orphan, []byte("x"))
	// And the next day's good one.
	next := ObjectKey("dev", day.AddDate(0, 0, 1))
	h.store.SetObject(next, []byte("x"))
	h.runs.record("dev", next)

	removed, err := h.svc.ApplyRetention(ctx)
	require.NoError(t, err)
	require.Zero(t, removed)
	for _, key := range []string{good, orphan, next} {
		_, ok := h.store.Bytes(key)
		require.True(t, ok, key)
	}
}

// --- check

func TestRunCheck_RestoresTheLatestCopyAndComparesCounts(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	_, err := h.svc.RunBackup(ctx)
	require.NoError(t, err)

	res, err := h.svc.RunCheck(ctx)
	require.NoError(t, err)
	require.Empty(t, res.Mismatches)
	require.Equal(t, "PGDMP… Mateo amoxicilina", h.restorer.plain, "the check key opens the copy")
	require.Equal(t, KindCheck, h.runs.last().Kind)
	require.Equal(t, "ok", h.runs.last().Status)
	require.Empty(t, h.rec.entries)
}

func TestRunCheck_Failures(t *testing.T) {
	ctx := context.Background()

	h := newHarness(t)
	_, err := h.svc.RunCheck(ctx)
	require.Error(t, err, "no backup yet")
	require.Equal(t, []string{FailDownload.Message()}, h.rec.messages())

	h = newHarness(t)
	_, _ = h.svc.RunBackup(ctx)
	h.store.FailGet = errors.New("x")
	_, err = h.svc.RunCheck(ctx)
	require.Error(t, err)
	require.Equal(t, []string{FailDownload.Message()}, h.rec.messages())

	h = newHarness(t)
	res, _ := h.svc.RunBackup(ctx)
	h.store.SetObject(res.ObjectKey, []byte("not an age file"))
	_, err = h.svc.RunCheck(ctx)
	require.Error(t, err)
	require.Equal(t, []string{FailDecrypt.Message()}, h.rec.messages())

	h = newHarness(t)
	_, _ = h.svc.RunBackup(ctx)
	h.restorer.err = errors.New("pg_restore: error at host")
	_, err = h.svc.RunCheck(ctx)
	require.Error(t, err)
	require.Equal(t, []string{FailRestore.Message()}, h.rec.messages())

	h = newHarness(t)
	_, _ = h.svc.RunBackup(ctx)
	h.restorer.got = map[string]int64{"accounts": 3, "doses": 39}
	res2, err := h.svc.RunCheck(ctx)
	require.Error(t, err)
	require.Len(t, res2.Mismatches, 1)
	require.Equal(t, []string{FailVerify.Message()}, h.rec.messages())
	require.Equal(t, "failed", h.runs.last().Status)

	h = newHarness(t)
	_, _ = h.svc.RunBackup(ctx)
	h.runs.failOK = errors.New("db down")
	_, err = h.svc.RunCheck(ctx)
	require.ErrorAs(t, err, new(*StepError))
	require.Equal(t, []string{FailRecord.Message()}, h.rec.messages(), "a check that can't be recorded is a failure too")
	require.Equal(t, "failed", h.runs.last().Status)

	h = newHarness(t)
	h.runs.failLatest = errors.New("db down")
	_, err = h.svc.RunCheck(ctx)
	require.Error(t, err)
	require.Equal(t, []string{FailRecord.Message()}, h.rec.messages(), "the database, not the storage")

	h = newHarness(t)
	_, _ = h.svc.RunBackup(ctx)
	h.runs.failNew = errors.New("db down")
	_, err = h.svc.RunCheck(ctx)
	require.Error(t, err)
	require.Equal(t, []string{FailRecord.Message()}, h.rec.messages())
}

func TestRunCheck_AFailedCheckMakesTheCopyInvalid(t *testing.T) {
	ctx := context.Background()
	h := newHarness(t)
	h.svc.Now = func() time.Time { return time.Date(2026, 11, 15, 9, 0, 0, 0, time.UTC) }
	older, err := h.svc.RunBackup(ctx)
	require.NoError(t, err)
	h.svc.Now = func() time.Time { return time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC) }
	broken, err := h.svc.RunBackup(ctx)
	require.NoError(t, err)

	h.restorer.got = map[string]int64{"accounts": 3, "doses": 39}
	_, err = h.svc.RunCheck(ctx)
	require.Error(t, err)

	latest, err := h.runs.LatestValidBackup(ctx, "dev")
	require.NoError(t, err)
	require.Equal(t, older.ObjectKey, *latest.ObjectKey, "the broken copy is skipped")
	states, err := h.runs.ObjectStates(ctx, "dev")
	require.NoError(t, err)
	require.Equal(t, StateCheckFailed, states[broken.ObjectKey])
	require.Equal(t, StateOK, states[older.ObjectKey])

	got, err := h.svc.Restore(ctx, h.owner, "latest", &fakeTarget{got: map[string]int64{"accounts": 3, "doses": 40}})
	require.NoError(t, err)
	require.Equal(t, older.ObjectKey, got.ObjectKey, "restore latest takes the last good copy")

	// The next check looks at the older copy; when it passes, that one stays the valid one.
	h.restorer.got = map[string]int64{"accounts": 3, "doses": 40}
	res, err := h.svc.RunCheck(ctx)
	require.NoError(t, err)
	require.Equal(t, older.ObjectKey, res.ObjectKey)
}

// --- restore by hand

type fakeTarget struct {
	tables int
	got    map[string]int64
	err    error
}

func (f *fakeTarget) TableCount(context.Context) (int, error) { return f.tables, f.err }
func (f *fakeTarget) Restore(_ context.Context, r io.Reader) (map[string]int64, error) {
	_, _ = io.ReadAll(r)
	return f.got, nil
}

func TestRestore(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	res, err := h.svc.RunBackup(ctx)
	require.NoError(t, err)

	_, err = h.svc.Restore(ctx, h.owner, "latest", &fakeTarget{tables: 3})
	require.ErrorIs(t, err, ErrTargetNotEmpty)

	got, err := h.svc.Restore(ctx, h.owner, "latest", &fakeTarget{got: map[string]int64{"accounts": 3, "doses": 40}})
	require.NoError(t, err)
	require.Empty(t, got.Mismatches)

	got, err = h.svc.Restore(ctx, h.owner, res.ObjectKey, &fakeTarget{got: map[string]int64{"accounts": 3}})
	require.NoError(t, err)
	require.Len(t, got.Mismatches, 1)

	other, _ := age.GenerateX25519Identity()
	_, err = h.svc.Restore(ctx, other, "latest", &fakeTarget{})
	require.Error(t, err)

	_, err = h.svc.Restore(ctx, h.owner, "dev/2020-01-01T090000Z.dump.age", &fakeTarget{})
	require.Error(t, err, "no such object")
	_, err = h.svc.Restore(ctx, h.owner, "latest", &fakeTarget{err: errors.New("x")})
	require.Error(t, err)

	empty := newHarness(t)
	_, err = empty.svc.Restore(ctx, empty.owner, "latest", &fakeTarget{})
	require.Error(t, err)
}

func TestRestore_WithoutTheLiveDatabase(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	res, err := h.svc.RunBackup(ctx)
	require.NoError(t, err)
	h.store.SetObject(h.svc.Env+"/2020-01-01T090000Z.dump.age", []byte("older"))
	h.store.SetObject("prod/2099-01-01T090000Z.dump.age", []byte("another environment"))
	h.store.SetObject(h.svc.Env+"/notes.txt", []byte("not a copy"))

	h.svc.Runs = nil // the owner's computer, with no DATABASE_URL
	got, err := h.svc.Restore(ctx, h.owner, "latest", &fakeTarget{got: map[string]int64{"accounts": 3}})
	require.NoError(t, err)
	require.Equal(t, res.ObjectKey, got.ObjectKey, "the newest of this environment, by its name")
	require.Empty(t, got.Mismatches, "nothing to compare with")

	got, err = h.svc.Restore(ctx, h.owner, res.ObjectKey, &fakeTarget{got: map[string]int64{"accounts": 3}})
	require.NoError(t, err)
	require.Empty(t, got.Mismatches)

	h.store.FailList = errors.New("down")
	_, err = h.svc.Restore(ctx, h.owner, "latest", &fakeTarget{})
	require.Error(t, err)
	h.store.FailList = nil

	empty := newHarness(t)
	empty.svc.Runs = nil
	_, err = empty.svc.Restore(ctx, empty.owner, "latest", &fakeTarget{})
	require.ErrorIs(t, err, ErrNoValidBackup)
}

// --- privacy of the reports

func TestReports_NeverCarryAddressesKeysOrThirdPartyText(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.dumper.err = stepErr(FailDump, errors.New("pg_dump: connection to postgres://root:abcd1234@postgres.railway.internal failed AGE-SECRET-KEY-1XYZ"))
	_, _ = h.svc.RunBackup(ctx)
	h.dumper.err = nil
	h.store.FailPut = errors.New("PUT https://acc.r2.cloudflarestorage.com/peditrack-backups 403")
	_, _ = h.svc.RunBackup(ctx)

	for f := range messages {
		h.svc.Reporter.Report(ctx, f)
	}
	require.NotEmpty(t, h.rec.entries)
	for _, e := range h.rec.entries {
		for _, leak := range []string{"postgres://", "abcd1234", "railway.internal", "AGE-SECRET-KEY", "cloudflarestorage", "peditrack-backups", "Mateo"} {
			require.NotContains(t, e.Message, leak)
		}
		require.Equal(t, Endpoint, e.Endpoint)
		require.Nil(t, e.HTTPStatus)
		require.Nil(t, e.AccountID)
		require.NotEmpty(t, e.File)
	}
}

func TestReporter_WithoutRecorderOrWithAFailingOne(t *testing.T) {
	NewReporter(nil).Report(context.Background(), FailDump)
	var nilReporter *Reporter
	nilReporter.Report(context.Background(), FailDump)
	rec := &recorder{err: errors.New("db down")}
	NewReporter(rec).Report(context.Background(), FailDump)
	require.Len(t, rec.entries, 1)
}
