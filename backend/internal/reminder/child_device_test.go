package reminder_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

// specs/047-dispositivo-del-hijo, US4: the phone of a child is a recipient of its own. It is reminded of the doses, supplements and
// activities of ITS child, once each, and never of anything else.

// phone links an active phone to the family's child, with a reminder device turned on an hour before `now`.
func phone(t *testing.T, pool *pgxpool.Pool, repo *reminder.Repository, f family, now time.Time, detail *string) (linkID uuid.UUID, device reminder.Device) {
	t.Helper()
	ctx := context.Background()
	require.NoError(t, pool.QueryRow(ctx, `
		INSERT INTO child_device_links (child_id, account_id, name, created_by_account_id, status, expires_at, redeemed_at, credential_hash, rotated_at, reminder_detail)
		VALUES ($1, $2, 'Teléfono', $2, 'active', now(), now(), decode(md5(random()::text) || md5(random()::text), 'hex'), now(), $3) RETURNING id`,
		f.childID, f.accountID, detail).Scan(&linkID))
	device, _, err := repo.UpsertChildDevice(ctx, linkID, uniqueEndpoint(), "p256dh", "auth")
	require.NoError(t, err)
	activatedAt(t, pool, device.ID, now.Add(-time.Hour))
	return linkID, device
}

func linksOf(due []reminder.DueDose) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(due))
	for _, d := range due {
		out = append(out, d.ChildLinkID)
	}
	return out
}

func TestClaimDueChildDevices_TheDosesSupplementsAndActivitiesOfItsChild(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	link, _ := phone(t, pool, repo, f, now, nil)
	med := f.dose(t, pool, now.Add(-5*time.Minute), false)
	routine := f.routine(t, pool, "active")
	sup := supplementDose(t, pool, routine, now.Add(-4*time.Minute), false)
	activity := f.routine(t, pool, "active")
	_, err := pool.Exec(context.Background(), `UPDATE supplement_routines SET kind = 'activity', period = 'window', times = '{}', window_start = '08:00', window_end = '09:00', interval_minutes = 30 WHERE id = $1`, activity)
	require.NoError(t, err)
	act := supplementDose(t, pool, activity, now.Add(-3*time.Minute), false)

	due, err := repo.ClaimDueChildDevices(context.Background(), now, window)
	require.NoError(t, err)
	require.Len(t, due, 3)
	bySource := map[reminder.Source]reminder.DueDose{}
	for _, d := range due {
		require.Equal(t, link, d.ChildLinkID)
		require.Equal(t, uuid.Nil, d.AccountID, "the reminder is for the phone, not for an account")
		require.Equal(t, "Mateo", d.ChildFirstName)
		bySource[d.Source] = d
	}
	require.Equal(t, med, bySource[reminder.SourceMedication].DoseID)
	require.Equal(t, f.consultationID, bySource[reminder.SourceMedication].ConsultationID)
	require.Equal(t, "Amoxicilina", bySource[reminder.SourceMedication].MedicationName)
	require.Equal(t, sup, bySource[reminder.SourceSupplement].DoseID)
	require.Equal(t, routine, bySource[reminder.SourceSupplement].RoutineID)
	require.Equal(t, act, bySource[reminder.SourceActivity].DoseID)

	again, err := repo.ClaimDueChildDevices(context.Background(), now.Add(time.Second), window)
	require.NoError(t, err)
	require.Empty(t, again, "a dose is reminded to a phone once")
}

func TestClaimDueChildDevices_NeverForAnotherChildNorForADoseAlreadyMarked(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	mine := newFamily(t, pool, nil)
	other := newFamily(t, pool, nil)
	phone(t, pool, repo, mine, now, nil)
	otherLink, _ := phone(t, pool, repo, other, now, nil)
	mine.dose(t, pool, now.Add(-5*time.Minute), true)                                      // already marked
	supplementDose(t, pool, mine.routine(t, pool, "paused"), now.Add(-time.Minute), false) // a paused routine
	theirs := other.dose(t, pool, now.Add(-5*time.Minute), false)

	due, err := repo.ClaimDueChildDevices(context.Background(), now, window)
	require.NoError(t, err)
	require.Len(t, due, 1, "only the other child's own dose, for the other child's phone")
	require.Equal(t, theirs, due[0].DoseID)
	require.Equal(t, otherLink, due[0].ChildLinkID)
}

func TestClaimDueChildDevices_NotWithoutADeviceOnOrOnLateOrForARemovedPhone(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	linkOff, deviceOff := phone(t, pool, repo, f, now, nil)
	f.dose(t, pool, now.Add(-5*time.Minute), false)

	// The device was turned on after the dose: it doesn't count for that dose.
	activatedAt(t, pool, deviceOff.ID, now)
	due, err := repo.ClaimDueChildDevices(context.Background(), now, window)
	require.NoError(t, err)
	require.Empty(t, due)

	// Turned off.
	activatedAt(t, pool, deviceOff.ID, now.Add(-time.Hour))
	_, err = pool.Exec(context.Background(), `UPDATE reminder_devices SET active = false WHERE id = $1`, deviceOff.ID)
	require.NoError(t, err)
	due, err = repo.ClaimDueChildDevices(context.Background(), now, window)
	require.NoError(t, err)
	require.Empty(t, due)

	// On again but the phone was removed.
	_, err = pool.Exec(context.Background(), `UPDATE reminder_devices SET active = true WHERE id = $1`, deviceOff.ID)
	require.NoError(t, err)
	_, err = pool.Exec(context.Background(), `UPDATE child_device_links SET status = 'revoked', revoked_at = now(), credential_hash = NULL WHERE id = $1`, linkOff)
	require.NoError(t, err)
	due, err = repo.ClaimDueChildDevices(context.Background(), now, window)
	require.NoError(t, err)
	require.Empty(t, due)
}

func TestClaimDueChildDevices_APersonalRoutineIsNeverAPhonesAndAccountsStayAsTheyWere(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	phone(t, pool, repo, f, now, nil)
	parent := ready(t, f, repo, now)
	_, err := pool.Exec(context.Background(), `
		INSERT INTO supplement_routines (account_id, child_id, name, period, times, first_date, utc_offset_minutes, generated_until, created_by_account_id)
		VALUES ($1, NULL, 'Mía', 'daily', ARRAY['08:00']::time[], current_date - 2, 0, now() + interval '14 days', $1)`, f.accountID)
	require.NoError(t, err)
	dose := f.dose(t, pool, now.Add(-5*time.Minute), false)

	children, err := repo.ClaimDueChildDevices(context.Background(), now, window)
	require.NoError(t, err)
	require.Len(t, children, 1)

	// The parent's own claim is untouched by the phone's device: the owner (who has a device) gets the dose, the phone does not take her place.
	due, err := repo.ClaimDueDoses(context.Background(), now, window)
	require.NoError(t, err)
	require.Len(t, due, 1)
	require.Equal(t, f.accountID, due[0].AccountID)
	require.Equal(t, dose, due[0].DoseID)
	require.Equal(t, uuid.Nil, due[0].ChildLinkID)
	_ = parent
}

func TestClaimDueChildDevices_TwoTicksAtOnceNeverShareAPair(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	phone(t, pool, repo, f, now, nil)
	f.dose(t, pool, now.Add(-5*time.Minute), false)
	supplementDose(t, pool, f.routine(t, pool, "active"), now.Add(-4*time.Minute), false)

	var wg sync.WaitGroup
	var mu sync.Mutex
	total := 0
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			due, err := repo.ClaimDueChildDevices(context.Background(), now, window)
			require.NoError(t, err)
			mu.Lock()
			total += len(due)
			mu.Unlock()
		}()
	}
	wg.Wait()
	require.Equal(t, 2, total, "each dose once")
}

func TestTick_AChildPhoneGetsItsOwnReminderGenericByDefaultAndDetailedWhenChosen(t *testing.T) {
	now := uniqueNow()
	sender := &fakeSender{}
	svc, repo := newService(t, sender, now)
	pool := testPool(t)
	f := newFamily(t, pool, strPtr("detailed"))
	_, generic := phone(t, pool, repo, f, now, nil)
	_, detailed := phone(t, pool, repo, f, now, strPtr("detailed"))
	owner := ready(t, f, repo, now)
	dose := f.dose(t, pool, now.Add(-time.Minute), false)
	supplementDose(t, pool, f.routine(t, pool, "active"), now.Add(-time.Minute), false)

	delivered, err := svc.Tick(context.Background())
	require.NoError(t, err)
	require.Equal(t, 6, delivered, "the owner two plus each phone two")
	require.Len(t, sender.sentTo(owner.ID), 2)
	require.Len(t, sender.sentTo(generic.ID), 2)
	require.Len(t, sender.sentTo(detailed.ID), 2)

	for _, p := range sender.sentTo(generic.ID) {
		raw := string(p.payload)
		body := decode(t, p.payload)
		require.Equal(t, "generic", body["kind"])
		require.NotContains(t, raw, "Amoxicilina")
		require.NotContains(t, raw, "Vitamina D")
		require.NotContains(t, raw, "Mateo", "a generic reminder carries nothing of the child")
		require.NotEmpty(t, body["actionToken"])
		require.Equal(t, "child", body["scope"], "tapping it opens the child's screen")
	}
	for _, p := range sender.sentTo(owner.ID) {
		require.NotContains(t, decode(t, p.payload), "scope", "the parents' reminders are as they were")
	}
	var medication map[string]any
	for _, p := range sender.sentTo(detailed.ID) {
		body := decode(t, p.payload)
		require.Equal(t, "detailed", body["kind"])
		require.Equal(t, "Mateo", body["child"])
		if body["source"] == nil {
			medication = body
		}
	}
	require.Equal(t, dose.String(), medication["doseId"])
	require.Equal(t, "Amoxicilina", medication["medication"])
	require.Equal(t, f.consultationID.String(), medication["consultationId"])

	delivered, err = svc.Tick(context.Background())
	require.NoError(t, err)
	require.Zero(t, delivered)
}

func TestTick_APushServiceThatForgotAChildPhoneTurnsOnlyThatDeviceOff(t *testing.T) {
	now := uniqueNow()
	pool := testPool(t)
	f := newFamily(t, pool, nil)
	sender := &fakeSender{results: map[string]reminder.SendResult{}}
	svc, repo := newService(t, sender, now)
	_, gone := phone(t, pool, repo, f, now, nil)
	_, kept := phone(t, pool, repo, f, now, nil)
	f.dose(t, pool, now.Add(-time.Minute), false)
	sender.results[deviceEndpoint(t, pool, gone.ID)] = reminder.Gone

	_, err := svc.Tick(context.Background())
	require.NoError(t, err)
	require.False(t, deviceActive(t, pool, gone.ID))
	require.True(t, deviceActive(t, pool, kept.ID))
}

func deviceEndpoint(t *testing.T, pool *pgxpool.Pool, id uuid.UUID) string {
	t.Helper()
	var endpoint string
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT endpoint FROM reminder_devices WHERE id = $1`, id).Scan(&endpoint))
	return endpoint
}

func TestTomada_OfAChildPhoneMarksInTheChildsNameWhileItIsStillLinked(t *testing.T) {
	now := uniqueNow()
	sender := &fakeSender{}
	svc, repo := newService(t, sender, now)
	pool := testPool(t)
	f := newFamily(t, pool, nil)
	link, device := phone(t, pool, repo, f, now, nil)
	dose := f.dose(t, pool, now.Add(-time.Minute), false)
	sup := supplementDose(t, pool, f.routine(t, pool, "active"), now.Add(-time.Minute), false)

	token := func(doseID uuid.UUID) string {
		return reminder.SignActionToken(testConfig.ActionSecret, doseID, device.ID, now.Add(time.Hour))
	}
	require.NoError(t, svc.MarkTakenWithToken(context.Background(), token(dose)))
	require.NoError(t, svc.MarkTakenWithToken(context.Background(), token(sup)))

	var byAccount, byDevice *uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT taken_by_account_id, taken_by_child_device_id FROM doses WHERE id = $1`, dose).Scan(&byAccount, &byDevice))
	require.Nil(t, byAccount)
	require.Equal(t, link, *byDevice)
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT taken_by_account_id, taken_by_child_device_id FROM supplement_doses WHERE id = $1`, sup).Scan(&byAccount, &byDevice))
	require.Nil(t, byAccount)
	require.Equal(t, link, *byDevice)

	// Marking again changes nothing and is not an error.
	require.NoError(t, svc.MarkTakenWithToken(context.Background(), token(dose)))
}

func TestTomada_OfAChildPhoneIsRefusedForAnotherChildsDoseAndOnceRemoved(t *testing.T) {
	now := uniqueNow()
	svc, repo := newService(t, &fakeSender{}, now)
	pool := testPool(t)
	f := newFamily(t, pool, nil)
	other := newFamily(t, pool, nil)
	link, device := phone(t, pool, repo, f, now, nil)
	others := other.dose(t, pool, now.Add(-time.Minute), false)
	mine := f.dose(t, pool, now.Add(-time.Minute), false)
	token := func(doseID uuid.UUID) string {
		return reminder.SignActionToken(testConfig.ActionSecret, doseID, device.ID, now.Add(time.Hour))
	}

	require.ErrorIs(t, svc.MarkTakenWithToken(context.Background(), token(others)), reminder.ErrInvalidActionToken)
	require.False(t, doseTaken(t, pool, others))
	require.ErrorIs(t, svc.MarkTakenWithToken(context.Background(), token(uuid.New())), reminder.ErrInvalidActionToken)

	_, err := pool.Exec(context.Background(), `UPDATE child_device_links SET status = 'revoked', revoked_at = now(), credential_hash = NULL WHERE id = $1`, link)
	require.NoError(t, err)
	require.ErrorIs(t, svc.MarkTakenWithToken(context.Background(), token(mine)), reminder.ErrInvalidActionToken)
	require.False(t, doseTaken(t, pool, mine), "a removed phone marks nothing")
}

func TestUpsertChildDevice_AnEndpointBelongsToOneRecipientAtATime(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	now := uniqueNow()
	f := newFamily(t, pool, nil)
	link, _ := phone(t, pool, repo, f, now, nil)
	endpoint := uniqueEndpoint()
	ctx := context.Background()

	d, created, err := repo.UpsertChildDevice(ctx, link, endpoint, "k", "a")
	require.NoError(t, err)
	require.True(t, created)
	_, created, err = repo.UpsertChildDevice(ctx, link, endpoint, "k2", "a2")
	require.NoError(t, err)
	require.False(t, created)

	// The same browser turned on for an account moves it away from the phone, and back.
	moved, _, err := repo.UpsertDevice(ctx, f.accountID, endpoint, "k", "a")
	require.NoError(t, err)
	require.Equal(t, d.ID, moved.ID)
	var account, child *uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT account_id, child_link_id FROM reminder_devices WHERE id = $1`, d.ID).Scan(&account, &child))
	require.NotNil(t, account)
	require.Nil(t, child)
	_, _, err = repo.UpsertChildDevice(ctx, link, endpoint, "k", "a")
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `SELECT account_id, child_link_id FROM reminder_devices WHERE id = $1`, d.ID).Scan(&account, &child))
	require.Nil(t, account)
	require.NotNil(t, child)

	// Only this phone turns its own device off.
	require.NoError(t, repo.DeactivateChildDevice(ctx, uuid.New(), endpoint))
	require.True(t, deviceActive(t, pool, d.ID))
	require.NoError(t, repo.DeactivateChildDevice(ctx, link, endpoint))
	require.False(t, deviceActive(t, pool, d.ID))
}

func TestChildDevices_DatabaseFailures(t *testing.T) {
	pool := testPool(t)
	repo := reminder.NewRepository(pool)
	pool.Close()
	ctx := context.Background()
	_, _, err := repo.UpsertChildDevice(ctx, uuid.New(), uniqueEndpoint(), "k", "a")
	require.Error(t, err)
	require.Error(t, repo.DeactivateChildDevice(ctx, uuid.New(), "x"))
	_, err = repo.ActiveDevicesForLink(ctx, uuid.New(), time.Now())
	require.Error(t, err)
	_, err = repo.ClaimDueChildDevices(ctx, time.Now(), window)
	require.Error(t, err)
	require.Error(t, repo.MarkTakenByAction(ctx, uuid.New(), uuid.New()))
}

func TestService_ChildDevicesNeedThePushKeysAndAKnownPushService(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool, nil)
	repo := reminder.NewRepository(pool)
	link, _ := phone(t, pool, repo, f, time.Now(), nil)
	svc := reminder.NewService(repo, &fakeSender{}, testConfig)
	_, _, err := svc.ActivateChildDevice(context.Background(), link, "https://evil.example.com/x", "k", "a")
	_, isValidation := reminder.IsValidationError(err)
	require.True(t, isValidation)
	_, _, err = svc.ActivateChildDevice(context.Background(), link, uniqueEndpoint(), "", "")
	_, isValidation = reminder.IsValidationError(err)
	require.True(t, isValidation)
	require.Error(t, svc.DeactivateChildDevice(context.Background(), link, "  "))

	off := reminder.NewService(repo, &fakeSender{}, reminder.Config{})
	_, _, err = off.ActivateChildDevice(context.Background(), link, uniqueEndpoint(), "k", "a")
	require.ErrorIs(t, err, reminder.ErrRemindersUnavailable)
}
