// Package retention keeps error_logs from growing forever: once a day it deletes the entries older than the retention
// period (specs/021-consulta-y-retencion-error-logs). It runs in the API process, like the reminders ticker.
package retention

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
)

const (
	// DefaultDays is how long an error is kept when nothing says otherwise.
	DefaultDays = 90
	// MinDays is the least it may be configured to: a mistake in the configuration can't erase the recent record.
	MinDays = 7
	// BatchSize: each delete takes at most this many rows, so the locks are short and new errors are written meanwhile.
	BatchSize = 1000
	// Interval is how often it runs.
	Interval = 24 * time.Hour
)

// Purger deletes one batch of entries older than a cutoff (satisfied by *errorlog.Repository).
type Purger interface {
	DeleteOlderThan(ctx context.Context, cutoff time.Time, batch int) (int, error)
}

// FailureReporter records a failure of a background process in error_logs (satisfied by *jobreport.Reporter, specs/018).
type FailureReporter interface {
	Report(kind, message string, accountID *uuid.UUID)
	Recovered(kind string)
}

// Config is how long entries are kept.
type Config struct {
	Days int
}

// ConfigFromEnv reads ERROR_LOGS_RETENTION_DAYS: 90 when it is missing or isn't a positive whole number, and never less
// than 7.
func ConfigFromEnv() Config { return Config{Days: parseDays(os.Getenv("ERROR_LOGS_RETENTION_DAYS"))} }

func parseDays(v string) int {
	n, err := strconv.Atoi(v)
	switch {
	case err != nil || n <= 0:
		return DefaultDays
	case n < MinDays:
		return MinDays
	default:
		return n
	}
}

// Cutoff is the instant before which an entry is too old.
func (c Config) Cutoff(now time.Time) time.Time { return now.AddDate(0, 0, -c.Days) }

// Purge deletes everything older than the cutoff, a batch at a time, and says how many it deleted. It stops at the first
// error, having deleted what it had.
func Purge(ctx context.Context, p Purger, now time.Time, cfg Config) (int, error) {
	cutoff := cfg.Cutoff(now)
	total := 0
	for {
		n, err := p.DeleteOlderThan(ctx, cutoff, BatchSize)
		total += n
		if err != nil {
			return total, err
		}
		if n < BatchSize {
			return total, nil
		}
	}
}

// Run purges right away and then every Interval until ctx is done. A failure is printed and reported like any other
// background process's (kind "purge"); one caused by the server shutting down is not a failure. A reporter may be nil.
func Run(ctx context.Context, p Purger, reporter FailureReporter, cfg Config) {
	RunEvery(ctx, p, reporter, cfg, Interval)
}

// RunEvery is Run with its own interval (tests).
func RunEvery(ctx context.Context, p Purger, reporter FailureReporter, cfg Config, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		deleted, err := Purge(ctx, p, time.Now(), cfg)
		switch {
		case err != nil && ctx.Err() == nil:
			log.Printf("retention: could not delete the old error log entries: %v", err)
			if reporter != nil {
				reporter.Report("purge", "error log retention failed: could not delete the old entries", nil)
			}
		case err == nil:
			if reporter != nil {
				reporter.Recovered("purge")
			}
		}
		if deleted > 0 {
			log.Printf("retention: deleted %d error log entries older than %d days", deleted, cfg.Days)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
