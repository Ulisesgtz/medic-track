package reminder_test

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// specs/018: what fails in the ticker also goes to error_logs, through a FailureReporter.

type reported struct {
	kind, message string
	account       *uuid.UUID
}

type fakeReporter struct {
	mu        sync.Mutex
	reports   []reported
	recovered []string
}

func (f *fakeReporter) Report(kind, message string, accountID *uuid.UUID) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reports = append(f.reports, reported{kind, message, accountID})
}

func (f *fakeReporter) Recovered(kind string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.recovered = append(f.recovered, kind)
}

func TestService_Tick_ReportsWhenTheDueDosesCannotBeRead(t *testing.T) {
	svc := reminder.NewService(reminder.NewRepository(closedPool(t)), &fakeSender{}, testConfig)
	rep := &fakeReporter{}
	svc.SetReporter(rep)

	_, err := svc.Tick(context.Background())

	require.Error(t, err)
	require.Equal(t, []reported{{"tick", "reminder tick failed: could not read the due doses", nil}}, rep.reports)
	require.Empty(t, rep.recovered)
}

func TestService_Tick_ADeliveryFailureIsReportedWithItsAccount(t *testing.T) {
	now := uniqueNow()
	pool := testPool(t)
	f := newFamily(t, pool, nil)
	flaky := uniqueEndpoint()
	sender := &fakeSender{results: map[string]reminder.SendResult{flaky: reminder.Failed}}
	svc, repo := newService(t, sender, now)
	rep := &fakeReporter{}
	svc.SetReporter(rep)
	device := f.device(t, repo, flaky)
	activatedAt(t, pool, device.ID, now.Add(-time.Hour))
	_ = f.dose(t, pool, now.Add(-time.Minute), false)

	_, err := svc.Tick(context.Background())
	require.NoError(t, err)

	require.Equal(t, []reported{{"deliver", "1 of 1 reminders could not be delivered", &f.accountID}}, rep.reports)
	require.ElementsMatch(t, []string{"tick", "prepare"}, rep.recovered)
	// Nothing that identifies a device or a key ever reaches the message.
	for _, r := range rep.reports {
		for _, secret := range []string{flaky, "https://", testConfig.VAPIDPrivateKey, testConfig.ActionSecret} {
			require.NotContains(t, r.message, secret)
		}
	}
}

func TestService_Tick_FailuresOfSeveralAccountsCarryNoAccount(t *testing.T) {
	now := uniqueNow()
	pool := testPool(t)
	a, b := newFamily(t, pool, nil), newFamily(t, pool, nil)
	endpointA, endpointB := uniqueEndpoint(), uniqueEndpoint()
	sender := &fakeSender{results: map[string]reminder.SendResult{endpointA: reminder.Failed, endpointB: reminder.Failed}}
	svc, repo := newService(t, sender, now)
	rep := &fakeReporter{}
	svc.SetReporter(rep)
	for _, d := range []struct {
		f        family
		endpoint string
	}{{a, endpointA}, {b, endpointB}} {
		device := d.f.device(t, repo, d.endpoint)
		activatedAt(t, pool, device.ID, now.Add(-time.Hour))
		_ = d.f.dose(t, pool, now.Add(-time.Minute), false)
	}

	_, err := svc.Tick(context.Background())
	require.NoError(t, err)

	require.Len(t, rep.reports, 1)
	require.Equal(t, "deliver", rep.reports[0].kind)
	require.True(t, strings.HasPrefix(rep.reports[0].message, "2 of 2 "), rep.reports[0].message)
	require.Nil(t, rep.reports[0].account)
}

func TestService_Tick_AGoneDeviceIsNotAFailureAndACleanCycleReportsNothing(t *testing.T) {
	now := uniqueNow()
	pool := testPool(t)
	f := newFamily(t, pool, nil)
	gone := uniqueEndpoint()
	sender := &fakeSender{results: map[string]reminder.SendResult{gone: reminder.Gone}}
	svc, repo := newService(t, sender, now)
	rep := &fakeReporter{}
	svc.SetReporter(rep)
	device := f.device(t, repo, gone)
	activatedAt(t, pool, device.ID, now.Add(-time.Hour))
	okDevice := f.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, okDevice.ID, now.Add(-time.Hour))
	_ = f.dose(t, pool, now.Add(-time.Minute), false)

	delivered, err := svc.Tick(context.Background())
	require.NoError(t, err)

	require.Equal(t, 1, delivered)
	require.Empty(t, rep.reports, "404/410 is normal: the device is turned off")
	require.ElementsMatch(t, []string{"tick", "prepare", "deliver"}, rep.recovered)
}

func TestService_Tick_AnIdleCycleOnlyProvesTheReadingWorks(t *testing.T) {
	svc, _ := newService(t, &fakeSender{}, uniqueNow())
	rep := &fakeReporter{}
	svc.SetReporter(rep)

	_, err := svc.Tick(context.Background())

	require.NoError(t, err)
	require.Empty(t, rep.reports)
	// Nothing was prepared or delivered, so nothing is proven about those kinds: a failure that comes back after
	// an idle cycle is still grouped with the one before it.
	require.Equal(t, []string{"tick"}, rep.recovered)
}

func TestService_Tick_ShuttingDownIsNotAFailure(t *testing.T) {
	svc := reminder.NewService(reminder.NewRepository(closedPool(t)), &fakeSender{}, testConfig)
	rep := &fakeReporter{}
	svc.SetReporter(rep)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := svc.Tick(ctx)

	require.Error(t, err)
	require.Empty(t, rep.reports)
}

func TestService_Tick_WorksWithoutAReporter(t *testing.T) {
	svc := reminder.NewService(reminder.NewRepository(closedPool(t)), &fakeSender{}, testConfig)

	_, err := svc.Tick(context.Background())

	require.Error(t, err) // reported nowhere, and nothing panics
}
