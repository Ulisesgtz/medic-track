package reminder_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

type countingTicker struct {
	ticks atomic.Int32
	err   error
}

func (c *countingTicker) Tick(context.Context) (int, error) {
	c.ticks.Add(1)
	return 0, c.err
}

func TestRun_TicksRightAwayThenEveryIntervalUntilCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	ticker := &countingTicker{err: errors.New("db down")} // a failing tick doesn't stop the loop
	done := make(chan struct{})
	go func() {
		reminder.Run(ctx, ticker, 10*time.Millisecond)
		close(done)
	}()

	require.Eventually(t, func() bool { return ticker.ticks.Load() >= 3 }, 2*time.Second, 5*time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not stop when its context was cancelled")
	}
}

func TestRunScheduler_ReturnsAtOnceWithoutConfig(t *testing.T) {
	svc := reminder.NewService(reminder.NewRepository(closedPool(t)), &fakeSender{}, reminder.Config{})
	done := make(chan struct{})
	go func() {
		svc.RunScheduler(context.Background())
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("RunScheduler kept running without VAPID keys")
	}
}

func TestRunScheduler_RunsWithConfigUntilCancelled(t *testing.T) {
	svc := reminder.NewService(reminder.NewRepository(testPool(t)), &fakeSender{}, testConfig)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		svc.RunScheduler(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("RunScheduler did not stop when its context was cancelled")
	}
}

func TestConfigFromEnv(t *testing.T) {
	t.Setenv("VAPID_PUBLIC_KEY", " pub ")
	t.Setenv("VAPID_PRIVATE_KEY", "priv")
	t.Setenv("VAPID_SUBJECT", "mailto:tutor@example.com")
	t.Setenv("REMINDER_ACTION_SECRET", "secret")
	c := reminder.ConfigFromEnv()
	require.Equal(t, "pub", c.VAPIDPublicKey)
	require.Equal(t, "tutor@example.com", c.VAPIDSubject, "the library adds mailto: itself")
	require.True(t, c.Available())

	t.Setenv("REMINDER_ACTION_SECRET", "")
	require.False(t, reminder.ConfigFromEnv().Available())
}
