package backup

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func env(vars map[string]string) func(string) string {
	return func(k string) string { return vars[k] }
}

func validVars(t *testing.T) map[string]string {
	t.Helper()
	ownerPub, _, err := GenerateKey()
	require.NoError(t, err)
	_, checkPriv, err := GenerateKey()
	require.NoError(t, err)
	return map[string]string{
		"DATABASE_URL":           "postgres://u:secret@postgres.railway.internal:5432/railway",
		"BACKUP_ENV":             "dev",
		"R2_ACCOUNT_ID":          "acc123",
		"R2_ACCESS_KEY_ID":       "AKID",
		"R2_SECRET_ACCESS_KEY":   "r2-secret-value",
		"BACKUP_OWNER_RECIPIENT": ownerPub,
		"BACKUP_CHECK_IDENTITY":  checkPriv,
	}
}

func TestLoadConfig(t *testing.T) {
	vars := validVars(t)
	cfg, err := LoadConfig(env(vars))
	require.NoError(t, err)
	require.Equal(t, "dev", cfg.Env)
	require.Equal(t, DefaultBucket, cfg.Bucket)
	require.Equal(t, 1, cfg.CheckWeekday)
	require.Len(t, cfg.Recipients(), 2)

	// The description never carries a secret.
	desc := cfg.String()
	for _, secret := range []string{vars["R2_SECRET_ACCESS_KEY"], vars["BACKUP_CHECK_IDENTITY"], "secret@", "AKID"} {
		require.NotContains(t, desc, secret)
	}
	require.Contains(t, desc, vars["BACKUP_OWNER_RECIPIENT"])

	vars["R2_BUCKET"] = "other"
	vars["BACKUP_CHECK_WEEKDAY"] = "0"
	cfg, err = LoadConfig(env(vars))
	require.NoError(t, err)
	require.Equal(t, "other", cfg.Bucket)
	require.Equal(t, 0, cfg.CheckWeekday)
}

func TestLoadConfig_NamesWhatIsMissingOrInvalidNeverTheValues(t *testing.T) {
	_, err := LoadConfig(env(map[string]string{}))
	var cerr *ConfigError
	require.ErrorAs(t, err, &cerr)
	require.Equal(t, []string{"BACKUP_CHECK_IDENTITY", "BACKUP_ENV", "BACKUP_OWNER_RECIPIENT", "DATABASE_URL", "R2_ACCESS_KEY_ID", "R2_ACCOUNT_ID", "R2_SECRET_ACCESS_KEY"}, cerr.Missing)

	vars := validVars(t)
	vars["BACKUP_ENV"] = "Producción"
	vars["BACKUP_OWNER_RECIPIENT"] = "age1notakey"
	vars["BACKUP_CHECK_IDENTITY"] = "AGE-SECRET-KEY-1BROKEN"
	vars["BACKUP_CHECK_WEEKDAY"] = "9"
	_, err = LoadConfig(env(vars))
	require.ErrorAs(t, err, &cerr)
	require.Equal(t, []string{"BACKUP_CHECK_IDENTITY", "BACKUP_CHECK_WEEKDAY", "BACKUP_ENV", "BACKUP_OWNER_RECIPIENT"}, cerr.Invalid)
	require.NotContains(t, err.Error(), "BROKEN")
	require.Contains(t, err.Error(), "invalid")
}

func TestLoadReadConfig_NeedsNoKeyAndNoDatabase(t *testing.T) {
	vars := validVars(t)
	delete(vars, "BACKUP_OWNER_RECIPIENT")
	delete(vars, "BACKUP_CHECK_IDENTITY")
	delete(vars, "DATABASE_URL")
	cfg, err := LoadReadConfig(env(vars))
	require.NoError(t, err)
	require.Equal(t, "dev", cfg.Env)
	require.Empty(t, cfg.DatabaseURL)
	require.Nil(t, cfg.CheckIdentity)

	_, err = LoadReadConfig(env(map[string]string{"BACKUP_ENV": "X"}))
	var cerr *ConfigError
	require.ErrorAs(t, err, &cerr)
	require.Equal(t, []string{"R2_ACCESS_KEY_ID", "R2_ACCOUNT_ID", "R2_SECRET_ACCESS_KEY"}, cerr.Missing)
	require.Equal(t, []string{"BACKUP_ENV"}, cerr.Invalid)
}

func TestObjectKey(t *testing.T) {
	at := time.Date(2026, 11, 12, 9, 0, 30, 0, time.UTC)
	key := ObjectKey("dev", at.In(time.FixedZone("x", -6*3600)))
	require.Equal(t, "dev/2026-11-12T090030Z.dump.age", key, "to the second, in UTC")
	e, got, ok := ParseObjectKey(key)
	require.True(t, ok)
	require.Equal(t, "dev", e)
	require.Equal(t, at, got)

	for _, bad := range []string{"dev/notes.txt", "dev/2026-11-12T090000Z.dump", "DEV/2026-11-12T090000Z.dump.age", "dev/2026-13-40T999999Z.dump.age", "x/dev/2026-11-12T090000Z.dump.age"} {
		_, _, ok := ParseObjectKey(bad)
		require.False(t, ok, bad)
	}
}

func TestEncryptForTwoKeysEachOpensAThirdDoesNot(t *testing.T) {
	ownerPub, ownerPriv, err := GenerateKey()
	require.NoError(t, err)
	checkPub, checkPriv, err := GenerateKey()
	require.NoError(t, err)
	_, otherPriv, err := GenerateKey()
	require.NoError(t, err)
	owner, err := ParseRecipient(ownerPub)
	require.NoError(t, err)
	check, err := ParseRecipient(checkPub)
	require.NoError(t, err)

	var buf bytes.Buffer
	w, err := Encrypt(&buf, owner, check)
	require.NoError(t, err)
	_, _ = w.Write([]byte("CREATE TABLE children (first_name text); Mateo"))
	require.NoError(t, w.Close())
	require.True(t, strings.HasPrefix(buf.String(), "age-encryption.org/v1"))
	require.NotContains(t, buf.String(), "Mateo")

	for _, priv := range []string{ownerPriv, checkPriv} {
		id, err := ParseIdentity(priv)
		require.NoError(t, err)
		r, err := Decrypt(bytes.NewReader(buf.Bytes()), id)
		require.NoError(t, err)
		plain, err := io.ReadAll(r)
		require.NoError(t, err)
		require.Contains(t, string(plain), "Mateo")
	}
	other, err := ParseIdentity(otherPriv)
	require.NoError(t, err)
	_, err = Decrypt(bytes.NewReader(buf.Bytes()), other)
	require.Error(t, err)

	_, err = Encrypt(&buf)
	require.Error(t, err)
	_, err = ParseRecipient("nope")
	require.Error(t, err)
	_, err = ParseIdentity("AGE-SECRET-KEY-1NOPE")
	require.Error(t, err)
	require.NotContains(t, err.Error(), "NOPE")
}

func TestParseIdentityFile(t *testing.T) {
	_, priv, err := GenerateKey()
	require.NoError(t, err)
	id, err := ParseIdentityFile("# created: 2026-11-12\n# public key: age1…\n\n" + priv + "\n")
	require.NoError(t, err)
	require.NotNil(t, id)
	_, err = ParseIdentityFile("# only comments\n")
	require.Error(t, err)
}

func objectsAt(env string, times ...time.Time) []Object {
	var out []Object
	for _, t := range times {
		out = append(out, Object{Key: ObjectKey(env, t)})
	}
	return out
}

func keys(objs []Object) []string {
	var out []string
	for _, o := range objs {
		out = append(out, o.Key)
	}
	return out
}

func TestKeep_SevenDailyFourWeeklySixMonthly(t *testing.T) {
	// Every day at 03:00 Mexico City (09:00 UTC) for 400 days, ending on Thursday 12 Nov 2026.
	end := time.Date(2026, 11, 12, 9, 0, 0, 0, time.UTC)
	var times []time.Time
	for i := 0; i < 400; i++ {
		times = append(times, end.AddDate(0, 0, -i))
	}
	keep, remove := Keep(objectsAt("dev", times...), "dev", nil)
	require.Len(t, keep, len(keys(keep)))
	require.Equal(t, 400, len(keep)+len(remove))

	kept := map[string]bool{}
	for _, k := range keys(keep) {
		kept[k] = true
	}
	// The 7 most recent days.
	for i := 0; i < 7; i++ {
		require.True(t, kept[ObjectKey("dev", end.AddDate(0, 0, -i))], "day %d", i)
	}
	// Sundays (the newest of each earlier ISO week) up to 4 weeks, and the newest of each of 6 months.
	require.True(t, kept[ObjectKey("dev", time.Date(2026, 11, 8, 9, 0, 0, 0, time.UTC))])
	require.True(t, kept[ObjectKey("dev", time.Date(2026, 10, 31, 9, 0, 0, 0, time.UTC))]) // end of October
	require.True(t, kept[ObjectKey("dev", time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC))])  // 6th month back
	require.False(t, kept[ObjectKey("dev", time.Date(2026, 5, 31, 9, 0, 0, 0, time.UTC))]) // 7th month: gone
	require.LessOrEqual(t, len(keep), KeepDaily+KeepWeekly+KeepMonthly)
}

func TestKeep_NeverTheNewestNeverForeignOrMalformed(t *testing.T) {
	only := objectsAt("dev", time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC))
	keep, remove := Keep(only, "dev", nil)
	require.Len(t, keep, 1)
	require.Empty(t, remove)

	mixed := append(objectsAt("dev", time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)),
		Object{Key: "dev/notes.txt"}, Object{Key: "prod/2020-01-01T090000Z.dump.age"})
	keep, remove = Keep(mixed, "dev", nil)
	require.Equal(t, []string{"dev/2026-01-01T090000Z.dump.age"}, keys(keep))
	require.Empty(t, remove)

	// Two copies on one day: only the newest of the day counts for that day.
	two := objectsAt("dev", time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC), time.Date(2026, 3, 2, 10, 0, 0, 0, time.UTC))
	keep, remove = Keep(two, "dev", nil)
	require.Equal(t, []string{"dev/2026-03-02T100000Z.dump.age"}, keys(keep))
	require.Equal(t, []string{"dev/2026-03-02T090000Z.dump.age"}, keys(remove))
}

func TestKeep_OnlyRecordedCopiesCount(t *testing.T) {
	day := time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC)
	good := ObjectKey("dev", day)
	orphan := ObjectKey("dev", day.Add(time.Hour))
	keep, remove := Keep([]Object{{Key: good}, {Key: orphan}}, "dev", map[string]bool{good: true})
	require.Equal(t, []string{good}, keys(keep), "the unrecorded copy doesn't take the day")
	require.Empty(t, remove, "and is never removed")
}

func TestCompareCounts(t *testing.T) {
	require.Empty(t, CompareCounts(map[string]int64{"a": 1, "b": 0}, map[string]int64{"a": 1, "b": 0}))
	got := CompareCounts(map[string]int64{"a": 2, "b": 1, "c": 3}, map[string]int64{"a": 2, "b": 0, "d": 4})
	require.Equal(t, []Mismatch{{Table: "b", Expected: 1, Got: 0}, {Table: "c", Expected: 3, Got: -1}, {Table: "d", Expected: -1, Got: 4}}, got)
}

func TestIsCheckDay(t *testing.T) {
	// Monday 03:00 in Mexico City is Monday 09:00 UTC.
	require.True(t, IsCheckDay(time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC), 1))
	// Monday 02:00 UTC is still Sunday in Mexico City.
	require.False(t, IsCheckDay(time.Date(2026, 11, 16, 2, 0, 0, 0, time.UTC), 1))
}

func TestMemoryStore(t *testing.T) {
	ctx := context.Background()
	m := NewMemoryStore()
	n, err := m.Put(ctx, "dev/a", "dev", strings.NewReader("abc"))
	require.NoError(t, err)
	require.EqualValues(t, 3, n)
	m.SetObject("prod/b", []byte("x"))
	list, err := m.List(ctx, "dev/")
	require.NoError(t, err)
	require.Equal(t, []Object{{Key: "dev/a", Size: 3}}, list)
	r, err := m.Get(ctx, "dev/a")
	require.NoError(t, err)
	b, _ := io.ReadAll(r)
	require.Equal(t, "abc", string(b))
	_, err = m.Get(ctx, "nope")
	require.ErrorIs(t, err, ErrNotFound)
	require.NoError(t, m.Delete(ctx, "dev/a"))
	_, ok := m.Bytes("dev/a")
	require.False(t, ok)

	boom := errors.New("boom")
	m.FailPut, m.FailGet, m.FailList, m.FailDelete = boom, boom, boom, boom
	_, err = m.Put(ctx, "dev/c", "dev", strings.NewReader("abc"))
	require.ErrorIs(t, err, boom)
	_, ok = m.Bytes("dev/c")
	require.False(t, ok, "a failed upload leaves nothing")
	_, err = m.Get(ctx, "prod/b")
	require.ErrorIs(t, err, boom)
	_, err = m.List(ctx, "")
	require.ErrorIs(t, err, boom)
	require.ErrorIs(t, m.Delete(ctx, "prod/b"), boom)
	_, err = m.Put(ctx, "dev/d", "dev", iotestErrReader{})
	require.Error(t, err)
}

type iotestErrReader struct{}

func (iotestErrReader) Read([]byte) (int, error) { return 0, errors.New("read failed") }

func TestR2Endpoint(t *testing.T) {
	require.Equal(t, "acc.r2.cloudflarestorage.com", R2Endpoint("acc"))
	cfg, err := LoadConfig(env(validVars(t)))
	require.NoError(t, err)
	s, err := NewR2Store(cfg)
	require.NoError(t, err)
	require.Equal(t, DefaultBucket, s.bucket)
}

func TestStepError(t *testing.T) {
	base := errors.New("inner")
	err := stepErr(FailDump, base)
	require.ErrorIs(t, err, base)
	require.Equal(t, "dump: inner", err.Error())
	require.Equal(t, "The backup failed", Failure("other").Message())
}

func TestDumpArgsAndEphemeralArgs(t *testing.T) {
	args := DumpArgs("00000003-0000001B-1", "postgres://x")
	require.Contains(t, args, "--format=custom")
	require.Contains(t, args, "--snapshot=00000003-0000001B-1")
	require.Contains(t, args, "--no-owner")
	initdb, start, create, restore, stop := EphemeralArgs("/tmp/r", 54321, "/tmp/r/pwfile")
	require.Contains(t, initdb, "--auth=scram-sha-256")
	require.Contains(t, initdb, "--pwfile=/tmp/r/pwfile")
	require.NotContains(t, strings.Join(initdb, " "), "trust")
	require.Contains(t, strings.Join(start, " "), "listen_addresses=127.0.0.1")
	require.Contains(t, strings.Join(start, " "), "unix_socket_directories=")
	require.Contains(t, create, "54321")
	require.Contains(t, create, "restore_check")
	require.Contains(t, restore, "--exit-on-error")
	require.Contains(t, stop, "fast")
}
