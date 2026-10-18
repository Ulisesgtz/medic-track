package payments

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// The table of states of contracts/webhook.md, pure: what a subscription becomes given what the provider reports.

var stateNow = time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)

func tp(t time.Time) *time.Time { return &t }

func TestNextState(t *testing.T) {
	future, past := stateNow.Add(48*time.Hour), stateNow.Add(-48*time.Hour)
	year := stateNow.AddDate(1, 0, 0)
	approved := &RemotePayment{Status: "approved"}
	rejected := &RemotePayment{Status: "rejected"}
	recycling := &RemotePayment{Status: "recycling"}

	cases := []struct {
		name     string
		sub      Subscription
		remote   Remote
		pay      *RemotePayment
		want     Status
		through  *time.Time // expected paid_through (nil = not checked)
		wantNext *time.Time
	}{
		{"first payment activates", Subscription{Status: StatusPending}, Remote{Status: "authorized", NextPaymentDate: tp(year)}, approved, StatusActive, tp(year), tp(year)},
		{"authorized without a date gets a year", Subscription{Status: StatusPending}, Remote{Status: "authorized"}, approved, StatusActive, tp(year), nil},
		{"a renewal extends", Subscription{Status: StatusActive, PaidThrough: tp(future)}, Remote{Status: "authorized", NextPaymentDate: tp(year)}, approved, StatusActive, tp(year), tp(year)},
		{"an older date never shortens", Subscription{Status: StatusActive, PaidThrough: tp(year)}, Remote{Status: "authorized", NextPaymentDate: tp(future)}, nil, StatusActive, tp(year), tp(future)},
		{"carried days are kept when the new date is earlier", Subscription{Status: StatusPending, PaidThrough: tp(year)}, Remote{Status: "authorized", NextPaymentDate: tp(future)}, approved, StatusActive, tp(year), tp(future)},
		{"no date and days left keeps them", Subscription{Status: StatusActive, PaidThrough: tp(future)}, Remote{Status: "authorized"}, nil, StatusActive, tp(future), nil},
		{"a rejection of an active one is grace", Subscription{Status: StatusActive, PaidThrough: tp(future)}, Remote{Status: "authorized"}, rejected, StatusGrace, nil, nil},
		{"recycling is grace too", Subscription{Status: StatusActive, PaidThrough: tp(future)}, Remote{Status: "authorized"}, recycling, StatusGrace, nil, nil},
		{"a rejection of one that never paid is nothing", Subscription{Status: StatusPending}, Remote{Status: "authorized"}, rejected, StatusPending, nil, nil},
		{"paused is grace", Subscription{Status: StatusActive, PaidThrough: tp(future)}, Remote{Status: "paused"}, nil, StatusGrace, nil, nil},
		{"paused before paying is nothing", Subscription{Status: StatusPending}, Remote{Status: "paused"}, nil, StatusPending, nil, nil},
		{"the subscription alone does not end a grace", Subscription{Status: StatusGrace, PaidThrough: tp(future), GraceUntil: tp(future)}, Remote{Status: "authorized", NextPaymentDate: tp(future)}, nil, StatusGrace, nil, nil},
		{"a newer period does", Subscription{Status: StatusGrace, PaidThrough: tp(future), GraceUntil: tp(future)}, Remote{Status: "authorized", NextPaymentDate: tp(year)}, nil, StatusActive, tp(year), tp(year)},
		{"an approved charge ends a grace", Subscription{Status: StatusGrace, PaidThrough: tp(future), GraceUntil: tp(future)}, Remote{Status: "authorized", NextPaymentDate: tp(year)}, approved, StatusActive, tp(year), tp(year)},
		{"cancelled with days is canceled", Subscription{Status: StatusActive, PaidThrough: tp(future)}, Remote{Status: "cancelled"}, nil, StatusCanceled, nil, nil},
		{"cancelled with none ends", Subscription{Status: StatusActive, PaidThrough: tp(past)}, Remote{Status: "cancelled"}, nil, StatusEnded, nil, nil},
		{"cancelled before paying ends", Subscription{Status: StatusPending}, Remote{Status: "cancelled"}, nil, StatusEnded, nil, nil},
		{"a late authorized does not undo a cancellation", Subscription{Status: StatusCanceled, PaidThrough: tp(future)}, Remote{Status: "authorized", NextPaymentDate: tp(year)}, approved, StatusCanceled, nil, nil},
		{"pending stays pending", Subscription{Status: StatusPending}, Remote{Status: "pending"}, nil, StatusPending, nil, nil},
		{"an unknown state changes nothing", Subscription{Status: StatusActive, PaidThrough: tp(future)}, Remote{Status: "mystery"}, nil, StatusActive, nil, nil},
		{"ended is terminal", Subscription{Status: StatusEnded}, Remote{Status: "authorized", NextPaymentDate: tp(year)}, approved, StatusEnded, nil, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := nextState(c.sub, c.remote, c.pay, stateNow, 7)

			require.Equal(t, c.want, got.Status)
			if c.through != nil {
				require.NotNil(t, got.PaidThrough)
				require.True(t, got.PaidThrough.Equal(*c.through), "paid through %v, want %v", got.PaidThrough, c.through)
			}
			if c.wantNext != nil {
				require.NotNil(t, got.NextRenewalAt)
				require.True(t, got.NextRenewalAt.Equal(*c.wantNext))
			}
			require.NotNil(t, got.LastCheckedAt)
		})
	}
}

func TestNextState_TheGraceLastsTheConfiguredDays(t *testing.T) {
	got := nextState(Subscription{Status: StatusActive, PaidThrough: tp(stateNow.Add(time.Hour))}, Remote{Status: "paused"}, nil, stateNow, 10)

	require.Equal(t, StatusGrace, got.Status)
	require.True(t, got.GraceUntil.Equal(stateNow.AddDate(0, 0, 10)))
}

func TestGrantsPlan(t *testing.T) {
	future, past := stateNow.Add(time.Hour), stateNow.Add(-time.Hour)
	require.True(t, Subscription{Status: StatusActive}.grantsPlan(stateNow))
	require.True(t, Subscription{Status: StatusGrace, GraceUntil: &future}.grantsPlan(stateNow))
	require.False(t, Subscription{Status: StatusGrace, GraceUntil: &past}.grantsPlan(stateNow))
	require.False(t, Subscription{Status: StatusGrace}.grantsPlan(stateNow))
	require.True(t, Subscription{Status: StatusCanceled, PaidThrough: &future}.grantsPlan(stateNow))
	require.False(t, Subscription{Status: StatusCanceled, PaidThrough: &past}.grantsPlan(stateNow))
	require.True(t, Subscription{Status: StatusPending, PaidThrough: &future}.grantsPlan(stateNow))
	require.False(t, Subscription{Status: StatusPending}.grantsPlan(stateNow))
	require.False(t, Subscription{Status: StatusEnded, PaidThrough: &future}.grantsPlan(stateNow))
}
