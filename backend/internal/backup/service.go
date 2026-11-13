package backup

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"filippo.io/age"
	"github.com/google/uuid"
)

// Runs is what the service needs of backup_runs (*Repository).
type Runs interface {
	Start(ctx context.Context, kind, env string) (uuid.UUID, error)
	FinishOK(ctx context.Context, id uuid.UUID, objectKey string, size *int64, counts map[string]int64, checked *uuid.UUID) error
	FinishFailed(ctx context.Context, id uuid.UUID, f Failure, objectKey *string, checked *uuid.UUID) error
	LatestValidBackup(ctx context.Context, env string) (*Run, error)
	BackupByObjectKey(ctx context.Context, key string) (*Run, error)
	ObjectStates(ctx context.Context, env string) (map[string]string, error)
}

// Locker takes the run lock (TryLock over the pool).
type Locker func(ctx context.Context) (release func(), ok bool, err error)

// Service makes a backup, applies the retention, checks the latest copy and restores one by hand. Every failure ends its run
// as failed and leaves one fixed row in error_logs; a success writes nothing there.
type Service struct {
	Env        string
	Recipients []age.Recipient
	Check      age.Identity
	Runs       Runs
	Store      Store
	Dumper     Dumper
	Restorer   Restorer
	Reporter   *Reporter
	Lock       Locker
	Now        func() time.Time
}

// ErrBusy: another run holds the lock; nothing was done.
var ErrBusy = errors.New("another backup run is in progress")

// Result of a backup.
type Result struct {
	ObjectKey string
	Size      int64
	Tables    int
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *Service) fail(ctx context.Context, id uuid.UUID, f Failure, objectKey *string) {
	s.failCheck(ctx, id, f, objectKey, nil)
}

// failCheck is fail for a check: checked is the backup it looked at.
func (s *Service) failCheck(ctx context.Context, id uuid.UUID, f Failure, objectKey *string, checked *uuid.UUID) {
	if id != uuid.Nil {
		_ = s.Runs.FinishFailed(ctx, id, f, objectKey, checked)
	}
	s.Reporter.Report(ctx, f)
}

// RunBackup makes one copy: lock → snapshot and counts → pg_dump → encrypt → upload → the run is ok. A failure at any step
// leaves no valid copy (FR-002).
func (s *Service) RunBackup(ctx context.Context) (*Result, error) {
	release, ok, err := s.Lock(ctx)
	if err != nil {
		s.fail(ctx, uuid.Nil, FailLock, nil)
		return nil, stepErr(FailLock, err)
	}
	if !ok {
		return nil, ErrBusy
	}
	defer release()

	id, err := s.Runs.Start(ctx, KindBackup, s.Env)
	if err != nil {
		s.fail(ctx, uuid.Nil, FailRecord, nil)
		return nil, stepErr(FailRecord, err)
	}
	key := ObjectKey(s.Env, s.now())

	pr, pw := io.Pipe()
	type dumpOut struct {
		counts map[string]int64
		err    error
	}
	done := make(chan dumpOut, 1)
	go func() {
		enc, err := Encrypt(pw, s.Recipients...)
		if err != nil {
			_ = pw.CloseWithError(err)
			done <- dumpOut{err: stepErr(FailEncrypt, err)}
			return
		}
		counts, err := s.Dumper.Dump(ctx, enc)
		if err == nil {
			if cerr := enc.Close(); cerr != nil {
				err = stepErr(FailEncrypt, cerr)
			}
		}
		_ = pw.CloseWithError(err) // nil = a clean end of the stream
		done <- dumpOut{counts: counts, err: err}
	}()

	src := &sourceReader{r: pr}
	size, putErr := s.Store.Put(ctx, key, s.Env, src)
	_ = pr.CloseWithError(errors.New("upload ended"))
	out := <-done

	// The storage failed first (the dump then fails writing to a closed pipe): an upload failure.
	if putErr != nil && !src.failed {
		s.fail(ctx, id, FailUpload, nil)
		return nil, stepErr(FailUpload, putErr)
	}
	if out.err != nil {
		if putErr == nil {
			_ = s.Store.Delete(context.WithoutCancel(ctx), key) // never keep a copy whose dump failed
		}
		step := FailDump
		var se *StepError
		if errors.As(out.err, &se) {
			step = se.Step
		}
		s.fail(ctx, id, step, nil)
		return nil, out.err
	}
	if putErr != nil {
		s.fail(ctx, id, FailUpload, nil)
		return nil, stepErr(FailUpload, putErr)
	}
	if err := s.Runs.FinishOK(ctx, id, key, &size, out.counts, nil); err != nil {
		_ = s.Store.Delete(context.WithoutCancel(ctx), key) // a copy nothing records is never the valid one
		s.fail(ctx, id, FailRecord, nil)
		return nil, stepErr(FailRecord, err)
	}
	return &Result{ObjectKey: key, Size: size, Tables: len(out.counts)}, nil
}

// ApplyRetention removes the copies the rule doesn't keep (call it only after a successful backup). Returns how many went.
func (s *Service) ApplyRetention(ctx context.Context) (int, error) {
	objects, err := s.Store.List(ctx, s.Env+"/")
	if err != nil {
		s.Reporter.Report(ctx, FailRetention)
		return 0, stepErr(FailRetention, err)
	}
	states, err := s.Runs.ObjectStates(ctx, s.Env)
	if err != nil {
		s.Reporter.Report(ctx, FailRetention)
		return 0, stepErr(FailRetention, err)
	}
	recorded := make(map[string]bool, len(states))
	for key := range states {
		recorded[key] = true
	}
	_, remove := Keep(objects, s.Env, recorded)
	removed := 0
	for _, o := range remove {
		if err := s.Store.Delete(ctx, o.Key); err != nil {
			s.Reporter.Report(ctx, FailRetention)
			return removed, stepErr(FailRetention, err)
		}
		removed++
	}
	return removed, nil
}

// CheckResult of the weekly check.
type CheckResult struct {
	ObjectKey  string
	Tables     int
	Mismatches []Mismatch
}

// RunCheck restores the latest valid copy in a disposable server and compares its tables and counts with those recorded when
// it was made (FR-011). It reads no row.
func (s *Service) RunCheck(ctx context.Context) (*CheckResult, error) {
	latest, err := s.Runs.LatestValidBackup(ctx, s.Env)
	if err != nil {
		failure := FailDownload
		if !errors.Is(err, ErrNoValidBackup) {
			failure = FailRecord // the database couldn't be read, not the storage
		}
		id, _ := s.Runs.Start(ctx, KindCheck, s.Env)
		s.fail(ctx, id, failure, nil)
		return nil, stepErr(failure, err)
	}
	key, checked := *latest.ObjectKey, &latest.ID
	id, err := s.Runs.Start(ctx, KindCheck, s.Env)
	if err != nil {
		s.fail(ctx, uuid.Nil, FailRecord, &key)
		return nil, stepErr(FailRecord, err)
	}

	src, err := s.Store.Get(ctx, key)
	if err != nil {
		s.failCheck(ctx, id, FailDownload, &key, checked)
		return nil, stepErr(FailDownload, err)
	}
	defer src.Close()
	plain, err := Decrypt(src, s.Check)
	if err != nil {
		s.failCheck(ctx, id, FailDecrypt, &key, checked)
		return nil, stepErr(FailDecrypt, err)
	}
	got, err := s.Restorer.RestoreAndCount(ctx, plain)
	if err != nil {
		s.failCheck(ctx, id, FailRestore, &key, checked)
		return nil, stepErr(FailRestore, err)
	}
	result := &CheckResult{ObjectKey: key, Tables: len(got), Mismatches: CompareCounts(latest.TableCounts, got)}
	if len(result.Mismatches) > 0 {
		s.failCheck(ctx, id, FailVerify, &key, checked)
		return result, stepErr(FailVerify, fmt.Errorf("%d tables differ", len(result.Mismatches)))
	}
	if err := s.Runs.FinishOK(ctx, id, key, nil, got, checked); err != nil {
		s.failCheck(ctx, id, FailRecord, &key, checked)
		return result, stepErr(FailRecord, err)
	}
	return result, nil
}

// IsCheckDay says whether the weekly check is due on t's day in Mexico City time.
func IsCheckDay(t time.Time, weekday int) bool {
	return int(t.In(mexicoCity).Weekday()) == weekday
}

// ErrTargetNotEmpty: restore refuses a database that already has tables — always restore into a NEW one.
var ErrTargetNotEmpty = errors.New("la base destino no está vacía: restaura siempre en una base nueva")

// RestoreTarget is the database a copy is restored into by hand.
type RestoreTarget interface {
	// TableCount says how many tables its public schema has.
	TableCount(ctx context.Context) (int, error)
	// Restore loads a plain copy and returns its table counts.
	Restore(ctx context.Context, r io.Reader) (map[string]int64, error)
}

// Restore restores a copy (by key, or "latest") into an EMPTY database with the owner's key, and compares the counts with
// those recorded for that copy when they are known.
func (s *Service) Restore(ctx context.Context, owner age.Identity, objectKey string, target RestoreTarget) (*CheckResult, error) {
	n, err := target.TableCount(ctx)
	if err != nil {
		return nil, fmt.Errorf("reading the target database: %w", err)
	}
	if n > 0 {
		return nil, ErrTargetNotEmpty
	}
	var expected map[string]int64
	if objectKey == "latest" && s.Runs == nil {
		// Without the live database (it may be what was lost): the newest copy of this environment in the storage.
		if objectKey, err = s.newestObject(ctx); err != nil {
			return nil, err
		}
	} else if objectKey == "latest" {
		run, err := s.Runs.LatestValidBackup(ctx, s.Env)
		if err != nil {
			return nil, fmt.Errorf("finding the latest backup: %w", err)
		}
		objectKey, expected = *run.ObjectKey, run.TableCounts
	} else if s.Runs != nil {
		if run, err := s.Runs.BackupByObjectKey(ctx, objectKey); err == nil {
			expected = run.TableCounts
		}
	}
	src, err := s.Store.Get(ctx, objectKey)
	if err != nil {
		return nil, fmt.Errorf("downloading the backup")
	}
	defer src.Close()
	plain, err := Decrypt(src, owner)
	if err != nil {
		return nil, fmt.Errorf("the key does not open this backup")
	}
	got, err := target.Restore(ctx, plain)
	if err != nil {
		return nil, fmt.Errorf("restoring the backup: %w", err)
	}
	result := &CheckResult{ObjectKey: objectKey, Tables: len(got)}
	if expected != nil {
		result.Mismatches = CompareCounts(expected, got)
	}
	return result, nil
}

// newestObject is the most recent copy of this environment in the storage, by the date in its name.
func (s *Service) newestObject(ctx context.Context) (string, error) {
	objects, err := s.Store.List(ctx, s.Env+"/")
	if err != nil {
		return "", fmt.Errorf("listing the backups")
	}
	var newest string
	var newestAt time.Time
	for _, o := range objects {
		if env, at, ok := ParseObjectKey(o.Key); ok && env == s.Env && at.After(newestAt) {
			newest, newestAt = o.Key, at
		}
	}
	if newest == "" {
		return "", ErrNoValidBackup
	}
	return newest, nil
}

// sourceReader remembers whether reading the dump failed (the dump's side broke) as opposed to the storage refusing.
type sourceReader struct {
	r      io.Reader
	failed bool
}

func (s *sourceReader) Read(p []byte) (int, error) {
	n, err := s.r.Read(p)
	if err != nil && !errors.Is(err, io.EOF) {
		s.failed = true
	}
	return n, err
}
