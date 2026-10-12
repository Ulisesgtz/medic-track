package mailer

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// scripted answers each Send with the next error of its list (nil = success) and counts the calls.
type scripted struct {
	results []error
	calls   int
}

func (s *scripted) Send(context.Context, Message) error {
	i := s.calls
	s.calls++
	if i >= len(s.results) {
		return s.results[len(s.results)-1]
	}
	return s.results[i]
}

func noSleep(slept *[]time.Duration) func(context.Context, time.Duration) error {
	return func(_ context.Context, d time.Duration) error {
		*slept = append(*slept, d)
		return nil
	}
}

var waits = []time.Duration{time.Second, 2 * time.Second}

func TestSendWithRetriesSucceedsOnTheSecondTry(t *testing.T) {
	s := &scripted{results: []error{&SendError{Retryable: true, Status: 503}, nil}}
	var slept []time.Duration
	require.NoError(t, SendWithRetries(context.Background(), s, Message{}, waits, time.Second, noSleep(&slept)))
	require.Equal(t, 2, s.calls)
	require.Equal(t, []time.Duration{time.Second}, slept)
}

func TestSendWithRetriesGivesUpAtOnceOnAPermanentRefusal(t *testing.T) {
	s := &scripted{results: []error{&SendError{Retryable: false, Status: 422}}}
	var slept []time.Duration
	err := SendWithRetries(context.Background(), s, Message{}, waits, time.Second, noSleep(&slept))
	require.Error(t, err)
	require.Equal(t, 1, s.calls)
	require.Empty(t, slept)
}

func TestSendWithRetriesReturnsTheLastErrorWhenTheTriesRunOut(t *testing.T) {
	s := &scripted{results: []error{&SendError{Retryable: true, Status: 500}}}
	var slept []time.Duration
	err := SendWithRetries(context.Background(), s, Message{}, waits, time.Second, noSleep(&slept))
	var sendErr *SendError
	require.ErrorAs(t, err, &sendErr)
	require.Equal(t, 3, s.calls)
	require.Equal(t, waits, slept)
}

func TestSendWithRetriesStopsWhenTheContextIsDone(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	s := &scripted{results: []error{errors.New("boom")}}
	cancelling := func(context.Context, time.Duration) error { cancel(); return ctx.Err() }
	err := SendWithRetries(ctx, s, Message{}, waits, time.Second, cancelling)
	require.ErrorIs(t, err, context.Canceled)
	require.Equal(t, 1, s.calls)
}

func TestSendWithRetriesReturnsTheContextErrorWhenItWasCancelledDuringTheSend(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := &scripted{results: []error{&SendError{Retryable: true}}}
	err := SendWithRetries(ctx, s, Message{}, waits, time.Second, SleepContext)
	require.ErrorIs(t, err, context.Canceled)
	require.Equal(t, 1, s.calls)
}

func TestSleepContext(t *testing.T) {
	require.NoError(t, SleepContext(context.Background(), time.Millisecond))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	require.ErrorIs(t, SleepContext(ctx, time.Hour), context.Canceled)
}
