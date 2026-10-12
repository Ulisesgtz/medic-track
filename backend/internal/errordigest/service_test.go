package errordigest

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
)

// fakeSender records what it is asked to send and fails as told.
type fakeSender struct {
	mu       sync.Mutex
	sent     []Message
	attempts int
	// results are the answers to the first calls, in order; after them it succeeds.
	results []error
}

func (f *fakeSender) Send(_ context.Context, m Message) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.attempts++
	if len(f.results) > 0 {
		err := f.results[0]
		f.results = f.results[1:]
		if err != nil {
			return err
		}
	}
	f.sent = append(f.sent, m)
	return nil
}

func (f *fakeSender) messages() []Message {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]Message(nil), f.sent...)
}

var testConfig = Config{APIKey: "re_key", To: "soporte@pedi-track.com", From: "PediTrack <alertas@pedi-track.com>", Weekday: 1, Hour: 8, EnvLabel: "DEV"}

func TestSendWeek_SendsOneEmailWithTheConfiguredAddressesAndTheWeeksIdempotencyKey(t *testing.T) {
	src := newFake()
	src.all = errorlog.Stats{Entries: 2, Groups: 1, Accounts: 1}
	src.requests = src.all
	src.requestRows = []errorlog.SummaryRow{row("/accounts/me", statusPtr(404), "Account not found", 2, now, now)}
	sender := &fakeSender{}

	err := sendWeek(NewService(src, sender, nil, testConfig, 90), context.Background(), now)

	require.NoError(t, err)
	got := sender.messages()
	require.Len(t, got, 1)
	require.Equal(t, "PediTrack <alertas@pedi-track.com>", got[0].From)
	require.Equal(t, "soporte@pedi-track.com", got[0].To)
	require.Equal(t, "error-digest-2026-W42", got[0].IdempotencyKey)
	require.Contains(t, got[0].Subject, "[PediTrack DEV]")
	require.Contains(t, got[0].Subject, ": 2")
	require.Contains(t, got[0].Text, "/accounts/me")
}

func TestSendWeek_AWeekWithoutErrorsIsSentToo(t *testing.T) {
	sender := &fakeSender{}

	require.NoError(t, sendWeek(NewService(newFake(), sender, nil, testConfig, 90), context.Background(), now))

	got := sender.messages()
	require.Len(t, got, 1)
	require.Contains(t, got[0].Text, "No hubo errores esta semana.")
}

func TestSendWeek_AFailureToBuildSendsNothing(t *testing.T) {
	src := newFake()
	src.err = errors.New("database is down")
	sender := &fakeSender{}

	err := sendWeek(NewService(src, sender, nil, testConfig, 90), context.Background(), now)

	require.Error(t, err)
	require.Zero(t, sender.attempts)
}

func TestSendWeek_APropagatesTheProvidersError(t *testing.T) {
	sender := &fakeSender{results: []error{&SendError{Retryable: false, Status: 401}}}

	err := sendWeek(NewService(newFake(), sender, nil, testConfig, 90), context.Background(), now)

	var sendErr *SendError
	require.True(t, errors.As(err, &sendErr))
	require.Equal(t, 401, sendErr.Status)
}

func TestSendWeek_UsesTheRetentionToDecideTheComparison(t *testing.T) {
	src := newFake()
	src.previous = errorlog.Stats{Entries: 3}
	older := now.Add(-30 * 24 * time.Hour)
	src.oldest = &older
	withRetention, short := &fakeSender{}, &fakeSender{}

	require.NoError(t, sendWeek(NewService(src, withRetention, nil, testConfig, 90), context.Background(), now))
	require.NoError(t, sendWeek(NewService(src, short, nil, testConfig, 7), context.Background(), now))

	require.Contains(t, withRetention.messages()[0].Subject, "vs. semana anterior")
	require.NotContains(t, short.messages()[0].Subject, "vs. semana anterior")
	require.Contains(t, short.messages()[0].Text, "sin comparación")
}

// sendWeek builds the e-mail of a week and hands it to the sender once, with no claim or retries: what Tick does between them.
func sendWeek(s *Service, ctx context.Context, now time.Time) error {
	m, err := s.message(ctx, now)
	if err != nil {
		return err
	}
	return s.sender.Send(ctx, m)
}
