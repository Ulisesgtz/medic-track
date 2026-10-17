package payments

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestFake_TheWholeLifeOfASubscription(t *testing.T) {
	ctx := context.Background()
	f := NewFake("http://localhost:5173")
	clock := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	f.now = func() time.Time { return clock }

	created, err := f.CreateSubscription(ctx, CreateRequest{ExternalReference: "acc-1"})
	require.NoError(t, err)
	require.Equal(t, "http://localhost:5173/planes/pago-de-prueba?sub="+created.ID, created.CheckoutURL)
	remote, err := f.GetSubscription(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, "pending", remote.Status)
	require.Equal(t, "acc-1", remote.ExternalReference)
	require.Equal(t, "fake", f.Name())

	next := clock.AddDate(1, 0, 0)
	pay, err := f.Approve(created.ID, next)
	require.NoError(t, err)
	remote, _ = f.GetSubscription(ctx, created.ID)
	require.Equal(t, "authorized", remote.Status)
	require.True(t, remote.NextPaymentDate.Equal(next))
	payment, err := f.GetAuthorizedPayment(ctx, pay)
	require.NoError(t, err)
	require.Equal(t, "approved", payment.Status)
	require.Equal(t, created.ID, payment.SubscriptionID)
	same, _ := f.GetPayment(ctx, pay)
	require.Equal(t, payment, same)

	rejected, err := f.Reject(created.ID)
	require.NoError(t, err)
	payment, _ = f.GetAuthorizedPayment(ctx, rejected)
	require.Equal(t, "rejected", payment.Status)
	remote, _ = f.GetSubscription(ctx, created.ID)
	require.True(t, remote.NextPaymentDate.Equal(next), "a rejected charge does not move the next date")

	renewed, err := f.Renew(created.ID, next.AddDate(1, 0, 0))
	require.NoError(t, err)
	require.NotEqual(t, pay, renewed)

	require.NoError(t, f.Pause(created.ID))
	remote, _ = f.GetSubscription(ctx, created.ID)
	require.Equal(t, "paused", remote.Status)

	require.NoError(t, f.CancelSubscription(ctx, created.ID))
	remote, _ = f.GetSubscription(ctx, created.ID)
	require.Equal(t, "cancelled", remote.Status)
	_, err = f.Approve(created.ID, next)
	require.Error(t, err, "a cancelled subscription cannot be charged")
}

func TestFake_UnknownThingsAreNotFound(t *testing.T) {
	ctx := context.Background()
	f := NewFake("http://localhost")

	_, err := f.GetSubscription(ctx, "nope")
	require.ErrorIs(t, err, ErrRemoteNotFound)
	_, err = f.GetAuthorizedPayment(ctx, "nope")
	require.ErrorIs(t, err, ErrRemoteNotFound)
	require.ErrorIs(t, f.CancelSubscription(ctx, "nope"), ErrRemoteNotFound)
	require.ErrorIs(t, f.Pause("nope"), ErrRemoteNotFound)
	_, err = f.Approve("nope", time.Now())
	require.ErrorIs(t, err, ErrRemoteNotFound)
}
