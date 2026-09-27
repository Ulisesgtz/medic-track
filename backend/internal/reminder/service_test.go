package reminder_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

func newService(t *testing.T, sender reminder.Sender, now time.Time) (*reminder.Service, *reminder.Repository) {
	t.Helper()
	repo := reminder.NewRepository(testPool(t))
	svc := reminder.NewService(repo, sender, testConfig)
	reminder.SetNow(svc, func() time.Time { return now })
	return svc, repo
}

func decode(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var m map[string]any
	require.NoError(t, json.Unmarshal(raw, &m))
	return m
}

func TestService_Tick_OneReminderPerDevicePerDose(t *testing.T) {
	now := uniqueNow()
	sender := &fakeSender{}
	svc, repo := newService(t, sender, now)
	pool := testPool(t)
	f := newFamily(t, pool, strPtr("detailed"))
	phone := f.device(t, repo, uniqueEndpoint())
	pc := f.device(t, repo, uniqueEndpoint())
	activatedAt(t, pool, phone.ID, now.Add(-time.Hour))
	activatedAt(t, pool, pc.ID, now.Add(-time.Hour))
	dose := f.dose(t, pool, now.Add(-time.Minute), false)
	_ = f.dose(t, pool, now.Add(-2*time.Minute), true) // marked before its time: no reminder

	delivered, err := svc.Tick(context.Background())
	require.NoError(t, err)
	require.Equal(t, 2, delivered)
	require.Len(t, sender.sentTo(phone.ID), 1)
	require.Len(t, sender.sentTo(pc.ID), 1)

	p := decode(t, sender.sentTo(phone.ID)[0].payload)
	require.Equal(t, "detailed", p["kind"])
	require.Equal(t, dose.String(), p["doseId"])
	require.Equal(t, f.consultationID.String(), p["consultationId"])
	require.Equal(t, "Amoxicilina", p["medication"])
	require.Equal(t, "Mateo", p["child"])
	require.NotEmpty(t, p["actionToken"])

	// The next tick sends nothing: the dose was already reminded.
	delivered, err = svc.Tick(context.Background())
	require.NoError(t, err)
	require.Zero(t, delivered)
	require.Len(t, sender.sentTo(phone.ID), 1)
}

func TestService_Tick_GenericReminderCarriesNoHealthData(t *testing.T) {
	for _, detail := range []*string{strPtr("generic"), nil} { // nil: not chosen yet → generic
		now := uniqueNow()
		sender := &fakeSender{}
		svc, repo := newService(t, sender, now)
		pool := testPool(t)
		f := newFamily(t, pool, detail)
		device := f.device(t, repo, uniqueEndpoint())
		activatedAt(t, pool, device.ID, now.Add(-time.Hour))
		_ = f.dose(t, pool, now.Add(-time.Minute), false)

		_, err := svc.Tick(context.Background())
		require.NoError(t, err)
		sent := sender.sentTo(device.ID)
		require.Len(t, sent, 1)
		raw := string(sent[0].payload)
		p := decode(t, sent[0].payload)
		require.Equal(t, "generic", p["kind"])
		require.NotContains(t, p, "medication")
		require.NotContains(t, p, "child")
		require.NotContains(t, raw, "Amoxicilina")
		require.NotContains(t, raw, "Mateo")
	}
}

func TestService_Tick_GoneDevicesAreTurnedOffOthersKeepGoing(t *testing.T) {
	now := uniqueNow()
	pool := testPool(t)
	f := newFamily(t, pool, nil)
	gone := uniqueEndpoint()
	flaky := uniqueEndpoint()
	sender := &fakeSender{results: map[string]reminder.SendResult{gone: reminder.Gone, flaky: reminder.Failed}}
	svc, repo := newService(t, sender, now)
	goneDevice := f.device(t, repo, gone)
	flakyDevice := f.device(t, repo, flaky)
	okDevice := f.device(t, repo, uniqueEndpoint())
	for _, d := range []uuid.UUID{goneDevice.ID, flakyDevice.ID, okDevice.ID} {
		activatedAt(t, pool, d, now.Add(-time.Hour))
	}
	_ = f.dose(t, pool, now.Add(-time.Minute), false)

	delivered, err := svc.Tick(context.Background())
	require.NoError(t, err)
	require.Equal(t, 1, delivered)
	require.False(t, deviceActive(t, pool, goneDevice.ID), "404/410: the subscription no longer exists")
	require.True(t, deviceActive(t, pool, flakyDevice.ID), "a failure isn't a reason to turn it off")
	require.True(t, deviceActive(t, pool, okDevice.ID))

	// Not retried: the dose was claimed.
	_, err = svc.Tick(context.Background())
	require.NoError(t, err)
	require.Len(t, sender.sentTo(flakyDevice.ID), 1)
}

func TestService_Tick_DoesNothingWithoutConfig(t *testing.T) {
	repo := reminder.NewRepository(closedPool(t))
	svc := reminder.NewService(repo, &fakeSender{}, reminder.Config{})
	delivered, err := svc.Tick(context.Background())
	require.NoError(t, err)
	require.Zero(t, delivered)
	require.False(t, svc.Available())
	require.Empty(t, svc.VAPIDPublicKey())
}

func TestService_Tick_DatabaseError(t *testing.T) {
	svc := reminder.NewService(reminder.NewRepository(closedPool(t)), &fakeSender{}, testConfig)
	_, err := svc.Tick(context.Background())
	require.Error(t, err)
}

func TestService_ActivateDevice_Validation(t *testing.T) {
	svc, _ := newService(t, &fakeSender{}, time.Now())
	f := newFamily(t, testPool(t), nil)
	ctx := context.Background()

	for _, endpoint := range []string{
		"",
		"not a url",
		"http://fcm.googleapis.com/fcm/send/x",     // not https
		"https://evil.example.com/fcm/send/x",      // not a push service
		"https://fcm.googleapis.com.evil.com/x",    // look-alike
		"http://127.0.0.1:9/local",                 // local, not allowed outside tests
		"https://169.254.169.254/latest/meta-data", // internal address
	} {
		_, _, err := svc.ActivateDevice(ctx, f.accountID, endpoint, "k", "a")
		errs, ok := reminder.IsValidationError(err)
		require.True(t, ok, endpoint)
		require.Equal(t, "endpoint", errs[0].Field, endpoint)
	}

	_, _, err := svc.ActivateDevice(ctx, f.accountID, uniqueEndpoint(), " ", "")
	errs, ok := reminder.IsValidationError(err)
	require.True(t, ok)
	require.Len(t, errs, 2)
	require.NotEmpty(t, errs.Error())
	require.Equal(t, "validation error", reminder.ValidationErrors{}.Error())

	for _, endpoint := range []string{
		uniqueEndpoint(),
		"https://updates.push.services.mozilla.com/wpush/v2/" + uuid.NewString(),
		"https://web.push.apple.com/" + uuid.NewString(),
		"https://wns2-par02p.notify.windows.com/w/?token=" + uuid.NewString(),
	} {
		d, created, err := svc.ActivateDevice(ctx, f.accountID, endpoint, "k", "a")
		require.NoError(t, err, endpoint)
		require.True(t, created)
		require.True(t, d.Active)
	}
}

func TestService_ActivateDevice_Unavailable(t *testing.T) {
	svc := reminder.NewService(reminder.NewRepository(testPool(t)), &fakeSender{}, reminder.Config{})
	_, _, err := svc.ActivateDevice(context.Background(), uuid.New(), uniqueEndpoint(), "k", "a")
	require.ErrorIs(t, err, reminder.ErrRemindersUnavailable)
}

func TestService_DeactivateDevice_NeedsAnEndpoint(t *testing.T) {
	svc, _ := newService(t, &fakeSender{}, time.Now())
	_, ok := reminder.IsValidationError(svc.DeactivateDevice(context.Background(), uuid.New(), "  "))
	require.True(t, ok)
}

func TestService_MarkTakenWithToken(t *testing.T) {
	now := time.Now()
	svc, repo := newService(t, &fakeSender{}, now)
	pool := testPool(t)
	f := newFamily(t, pool, nil)
	device := f.device(t, repo, uniqueEndpoint())
	dose := f.dose(t, pool, now, false)
	ctx := context.Background()

	_, ok := reminder.IsValidationError(svc.MarkTakenWithToken(ctx, ""))
	require.True(t, ok)
	require.ErrorIs(t, svc.MarkTakenWithToken(ctx, "forged.token"), reminder.ErrInvalidActionToken)

	token := reminder.SignActionToken(testConfig.ActionSecret, dose, device.ID, now.Add(time.Hour))
	require.NoError(t, svc.MarkTakenWithToken(ctx, token))
	require.True(t, doseTaken(t, pool, dose))
}

func TestBuildPayload_NeverImperative(t *testing.T) {
	detailed := reminder.DetailDetailed
	p := reminder.BuildPayload(reminder.DueDose{
		DoseID: uuid.New(), ConsultationID: uuid.New(), ScheduledAt: time.Date(2026, 9, 27, 14, 0, 0, 0, time.FixedZone("", -6*3600)),
		MedicationName: "Amoxicilina", ChildFirstName: "Mateo", Detail: &detailed,
	}, "tok")
	require.Equal(t, "2026-09-27T20:00:00Z", p.ScheduledAt, "UTC; the device formats it in its own zone")
	raw, err := json.Marshal(p)
	require.NoError(t, err)
	for _, word := range []string{"debes", "dale", "administra", "dosis"} {
		require.NotContains(t, strings.ToLower(string(raw)), word)
	}
}
