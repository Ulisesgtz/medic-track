package errordigest

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/mailer"
)

// specs/040: the digest takes a place of the day's quota with the digest class (which keeps working when the invitations' cap is
// reached) and gives it back when the send fails.

type fakeQuota struct {
	classes  []mailer.Class
	refunded int
	err      error
}

func (q *fakeQuota) Reserve(_ context.Context, class mailer.Class) (mailer.Ticket, error) {
	q.classes = append(q.classes, class)
	return mailer.Ticket{Day: time.Now()}, q.err
}

func (q *fakeQuota) Refund(context.Context, mailer.Ticket) { q.refunded++ }

func TestTick_ReservesAPlaceWithTheDigestClassAndKeepsItWhenSent(t *testing.T) {
	pool := testPool(t)
	due, _ := farWeek(t, pool)
	sender := &fakeSender{}
	svc := newTickService(pool, sender)
	quota := &fakeQuota{}
	svc.SetQuota(quota)

	require.NoError(t, svc.Tick(context.Background(), due))
	require.Len(t, sender.messages(), 1)
	require.Equal(t, []mailer.Class{mailer.ClassDigest}, quota.classes, "SC-006: the digest's class, whose cap is the provider's")
	require.Zero(t, quota.refunded)
}

func TestTick_GivesThePlaceBackWhenTheSendFails(t *testing.T) {
	pool := testPool(t)
	due, _ := farWeek(t, pool)
	sender := &fakeSender{results: []error{&mailer.SendError{Retryable: false, Status: 401}}}
	svc := newTickService(pool, sender)
	quota := &fakeQuota{}
	svc.SetQuota(quota)

	require.Error(t, svc.Tick(context.Background(), due))
	require.Equal(t, 1, quota.refunded)
}

func TestTick_WithTheDayFullDoesNotSendAndReleasesTheWeek(t *testing.T) {
	pool := testPool(t)
	due, week := farWeek(t, pool)
	sender := &fakeSender{}
	svc := newTickService(pool, sender)
	rep := &fakeReporter{}
	svc.SetReporter(rep)
	quota := &fakeQuota{err: mailer.ErrQuotaExceeded}
	svc.SetQuota(quota)

	err := svc.Tick(context.Background(), due)
	require.ErrorIs(t, err, mailer.ErrQuotaExceeded)
	require.Empty(t, sender.messages())
	require.Len(t, rep.reports, 1)
	require.Equal(t, failureSend, rep.reports[0].kind)
	var rows int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM error_digest_runs WHERE week_key = $1 AND status = 'failed'`, week).Scan(&rows))
	require.Zero(t, rows, "the week is not given up on")

	// the next day has places again: the same week is sent
	quota.err = nil
	require.NoError(t, svc.Tick(context.Background(), due.Add(24*time.Hour)))
	require.Len(t, sender.messages(), 1)
}

func TestTick_AFailingCounterDoesNotStopTheDigest(t *testing.T) {
	pool := testPool(t)
	due, _ := farWeek(t, pool)
	sender := &fakeSender{}
	svc := newTickService(pool, sender)
	svc.SetQuota(&fakeQuota{err: errors.New("the counter is down")})

	require.NoError(t, svc.Tick(context.Background(), due))
	require.Len(t, sender.messages(), 1)
}
