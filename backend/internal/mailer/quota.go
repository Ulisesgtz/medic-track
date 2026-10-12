package mailer

import (
	"context"
	"errors"
	"fmt"
	"time"

	_ "time/tzdata" // distroless and Windows have no zone database

	"github.com/google/uuid"
)

// Class says who is asking for a place in the day's quota: the invitations have a lower cap, which keeps the last places for
// the weekly error digest.
type Class int

const (
	ClassInvitation Class = iota
	ClassDigest
)

// ErrQuotaExceeded: the day has no place left for that class.
var ErrQuotaExceeded = errors.New("daily e-mail quota exceeded")

// The kinds of failure the mailer reports (specs/018) as job:mailer. The messages are fixed sentences with counts only: never an
// address, a link, a key or a provider's text.
const (
	FailureSend  = "send"
	FailureQuota = "quota"
	FailureStore = "store"
	FailureSweep = "sweep"
)

const (
	quotaMessage = "daily e-mail quota reached the warning threshold: %d of %d"
	storeMessage = "mail quota counter failed: could not read or update the daily count"
)

// Store is the durable counter of the day (satisfied by *Repository).
type Store interface {
	Reserve(ctx context.Context, day time.Time, cap int) (count int, ok bool, err error)
	Release(ctx context.Context, day time.Time) error
	MarkWarned(ctx context.Context, day time.Time, threshold int) (first bool, err error)
}

// Reporter records a failure of a background process in error_logs (satisfied by *jobreport.Reporter).
type Reporter interface {
	Report(kind, message string, accountID *uuid.UUID)
	Recovered(kind string)
}

// Ticket is a reserved place; Refund gives back the one of that same day.
type Ticket struct{ Day time.Time }

// Quota counts the e-mails sent each day (Mexico City time) for everything that sends, across all copies of the API.
type Quota struct {
	store    Store
	cfg      Config
	reporter Reporter
	now      func() time.Time
}

// NewQuota creates a Quota. The reporter is optional.
func NewQuota(store Store, cfg Config, reporter Reporter) *Quota {
	return &Quota{store: store, cfg: cfg, reporter: reporter, now: time.Now}
}

var mexicoCity = func() *time.Location {
	if loc, err := time.LoadLocation("America/Mexico_City"); err == nil {
		return loc
	}
	return time.FixedZone("CST", -6*3600)
}()

// DayOf is the calendar day of t in Mexico City, as a UTC midnight (what a DATE column compares equal to).
func DayOf(t time.Time) time.Time {
	local := t.In(mexicoCity)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
}

// Reserve takes a place of today for the class. ErrQuotaExceeded when there is none; any other error is the counter failing
// (reported as kind "store"). Reaching the warning threshold is reported once per day, whoever reaches it.
func (q *Quota) Reserve(ctx context.Context, class Class) (Ticket, error) {
	day := DayOf(q.now())
	cap := q.cfg.InvitationCap
	if class == ClassDigest {
		cap = q.cfg.DailyCap
	}
	count, ok, err := q.store.Reserve(ctx, day, cap)
	if err != nil {
		q.report(ctx, FailureStore, storeMessage)
		return Ticket{}, fmt.Errorf("reserving a place of the day: %w", err)
	}
	if !ok {
		return Ticket{}, ErrQuotaExceeded
	}
	if count >= q.cfg.WarnAt {
		if first, err := q.store.MarkWarned(ctx, day, q.cfg.WarnAt); err != nil {
			q.report(ctx, FailureStore, storeMessage)
		} else if first {
			q.report(ctx, FailureQuota, fmt.Sprintf(quotaMessage, count, q.cfg.InvitationCap))
		}
	}
	return Ticket{Day: day}, nil
}

// Refund gives the ticket's place back (the send failed for good). A failure to do it only leaves the count one too high.
func (q *Quota) Refund(ctx context.Context, t Ticket) {
	if t.Day.IsZero() {
		return
	}
	if err := q.store.Release(ctx, t.Day); err != nil {
		q.report(ctx, FailureStore, storeMessage)
	}
}

func (q *Quota) report(ctx context.Context, kind, message string) {
	if q.reporter == nil || ctx.Err() != nil {
		return
	}
	q.reporter.Report(kind, message, nil)
}

// MexicoCity is the zone the quota days and the e-mails dates use (fixed UTC-6 when the zone database is missing).
func MexicoCity() *time.Location { return mexicoCity }
