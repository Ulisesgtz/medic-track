package vaccination_test

import (
	"context"
	"math/rand/v2"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/vaccination"
)

func newService(t *testing.T) (*vaccination.Service, family) {
	t.Helper()
	pool := testPool(t)
	return vaccination.NewService(vaccination.NewRepository(pool)), newFamily(t, pool)
}

func TestService_RecordsADoseFromTheCatalogAndReadsItBackWithItsName(t *testing.T) {
	svc, f := newService(t)

	v, err := svc.Create(context.Background(), f.childID, f.accountID, vaccination.Input{VaccineCode: "hepatitis_b", AppliedOn: "2024-05-01", DoseNumber: intp(2), Lot: "AB123", Place: "Centro de salud", Notes: "Sin molestias"})

	require.NoError(t, err)
	require.Equal(t, "Hepatitis B", v.Name)
	require.Equal(t, "hepatitis_b", *v.VaccineCode)
	require.Nil(t, v.CustomName)
	require.Equal(t, "2024-05-01", v.AppliedOn)
	require.Equal(t, 2, *v.DoseNumber)
	require.Equal(t, "Ana", v.CreatedByName)
	require.Nil(t, v.CorrectedByName)
	require.Nil(t, v.CorrectedAt)
}

func TestService_RecordsTheParentsOwnNameAsWritten(t *testing.T) {
	svc, f := newService(t)

	v, err := svc.Create(context.Background(), f.childID, f.accountID, vaccination.Input{CustomName: "Vacuna del Dr. Pérez", AppliedOn: "2024-05-01"})

	require.NoError(t, err)
	require.Equal(t, "Vacuna del Dr. Pérez", v.Name)
	require.Nil(t, v.VaccineCode)
}

func TestService_ListsTheMostRecentFirstAndOnlyThisChilds(t *testing.T) {
	svc, f := newService(t)
	ctx := context.Background()
	other := f.addChild(t, testPool(t))
	_, err := svc.Create(ctx, f.childID, f.accountID, dose("bcg", "2022-01-10"))
	require.NoError(t, err)
	_, err = svc.Create(ctx, f.childID, f.accountID, dose("rotavirus", "2024-06-01"))
	require.NoError(t, err)
	_, err = svc.Create(ctx, other, f.accountID, dose("bcg", "2023-02-02"))
	require.NoError(t, err)

	list, err := svc.List(ctx, f.childID)

	require.NoError(t, err)
	require.Len(t, list, 2)
	require.Equal(t, "Rotavirus", list[0].Name)
	require.Equal(t, "BCG", list[1].Name)
	empty, err := svc.List(ctx, f.addChild(t, testPool(t)))
	require.NoError(t, err)
	require.NotNil(t, empty, "[] and not null")
	require.Empty(t, empty)
}

func TestService_AnUnknownOrRetiredVaccineIsRefusedAtCreation(t *testing.T) {
	pool := testPool(t)
	svc := vaccination.NewService(vaccination.NewRepository(pool))
	f := newFamily(t, pool)
	retired := "test_retired_" + uuid.NewString()[:8]
	_, err := pool.Exec(context.Background(), `INSERT INTO vaccine_catalog (code, name, sort_order, active) VALUES ($1, 'Retirada', $2, false)`, retired, 2_000_000+rand.IntN(1_000_000_000))
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM vaccine_catalog WHERE code = $1`, retired) })

	_, unknown := svc.Create(context.Background(), f.childID, f.accountID, dose("nope", "2024-05-01"))
	_, retiredErr := svc.Create(context.Background(), f.childID, f.accountID, dose(retired, "2024-05-01"))

	var verrs vaccination.ValidationErrors
	require.ErrorAs(t, unknown, &verrs)
	require.Equal(t, "vaccine", verrs[0].Field)
	require.ErrorAs(t, retiredErr, &verrs)
}

func TestService_ADoseWithARetiredVaccineKeepsItsNameAndCanStillBeCorrected(t *testing.T) {
	pool := testPool(t)
	svc := vaccination.NewService(vaccination.NewRepository(pool))
	f := newFamily(t, pool)
	ctx := context.Background()
	code := "test_later_retired_" + uuid.NewString()[:8]
	_, err := pool.Exec(ctx, `INSERT INTO vaccine_catalog (code, name, sort_order, active) VALUES ($1, 'Vacuna del pasado', $2, true)`, code, 2_000_000+rand.IntN(1_000_000_000))
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM vaccine_records WHERE vaccine_code = $1`, code)
		_, _ = pool.Exec(context.Background(), `DELETE FROM vaccine_catalog WHERE code = $1`, code)
	})
	v, err := svc.Create(ctx, f.childID, f.accountID, dose(code, "2024-05-01"))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE vaccine_catalog SET active = false WHERE code = $1`, code)
	require.NoError(t, err)

	list, err := svc.List(ctx, f.childID)
	require.NoError(t, err)
	require.Equal(t, "Vacuna del pasado", list[0].Name, "the name is still shown")
	fixed, err := svc.Update(ctx, f.childID, v.ID, f.accountID, vaccination.Input{VaccineCode: code, AppliedOn: "2024-05-02"})

	require.NoError(t, err, "the same retired vaccine can be kept when correcting the date")
	require.Equal(t, "2024-05-02", fixed.AppliedOn)
}

func TestService_TheDatabaseItselfRefusesWhatTheServiceShouldNeverSend(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool)
	other := newFamily(t, pool)
	ctx := context.Background()
	insert := func(childID, accountID uuid.UUID, code, name any, dose any, lot any, corrected bool) error {
		corrBy, corrAt := any(nil), any(nil)
		if corrected {
			corrBy = f.accountID
		}
		_, err := pool.Exec(ctx, `
			INSERT INTO vaccine_records (child_id, account_id, vaccine_code, custom_name, applied_on, dose_number, lot, created_by_account_id, corrected_by_account_id, corrected_at)
			VALUES ($1, $2, $3, $4, '2024-05-01', $5, $6, $7, $8, $9)`, childID, accountID, code, name, dose, lot, f.accountID, corrBy, corrAt)
		return err
	}

	require.NoError(t, insert(f.childID, f.accountID, "bcg", nil, nil, nil, false))
	require.Error(t, insert(f.childID, other.accountID, "bcg", nil, nil, nil, false), "another account's id with this child: the composite key rejects it")
	require.Error(t, insert(other.childID, f.accountID, "bcg", nil, nil, nil, false), "this account with another child")
	require.Error(t, insert(f.childID, f.accountID, nil, nil, nil, nil, false), "neither a code nor a name")
	require.Error(t, insert(f.childID, f.accountID, "bcg", "Otra", nil, nil, false), "both a code and a name")
	require.Error(t, insert(f.childID, f.accountID, nil, strings.Repeat("a", 101), nil, nil, false), "a name over 100")
	require.Error(t, insert(f.childID, f.accountID, "bcg", nil, 0, nil, false), "dose 0")
	require.Error(t, insert(f.childID, f.accountID, "bcg", nil, 21, nil, false), "dose 21")
	require.Error(t, insert(f.childID, f.accountID, "bcg", nil, nil, strings.Repeat("l", 61), false), "a lot over 60")
	require.Error(t, insert(f.childID, f.accountID, "bcg", nil, nil, nil, true), "corrected_by without corrected_at")
	_, err := pool.Exec(ctx, `INSERT INTO vaccine_card_photos (child_id, account_id, photo, created_by_account_id) VALUES ($1, $2, '\x', $2)`, f.childID, f.accountID)
	require.Error(t, err, "an empty photo")
	_, err = pool.Exec(ctx, `INSERT INTO vaccine_card_photos (child_id, account_id, photo, created_by_account_id) VALUES ($1, $2, '\xff', $2)`, f.childID, other.accountID)
	require.Error(t, err, "a photo of this child under another account")
}

func TestService_FindsTheSameDoseWithoutRegardToCaseOrAccentsAndAllowsItWhenConfirmed(t *testing.T) {
	svc, f := newService(t)
	ctx := context.Background()
	_, err := svc.Create(ctx, f.childID, f.accountID, vaccination.Input{CustomName: "Vacuna Niño", AppliedOn: "2024-05-01", DoseNumber: intp(1)})
	require.NoError(t, err)

	_, same := svc.Create(ctx, f.childID, f.accountID, vaccination.Input{CustomName: " vacuna NINO ", AppliedOn: "2024-05-01", DoseNumber: intp(1)})
	_, otherDose := svc.Create(ctx, f.childID, f.accountID, vaccination.Input{CustomName: "Vacuna Niño", AppliedOn: "2024-05-01", DoseNumber: intp(2)})
	_, otherDate := svc.Create(ctx, f.childID, f.accountID, vaccination.Input{CustomName: "Vacuna Niño", AppliedOn: "2024-05-02", DoseNumber: intp(1)})
	confirmed, ok := svc.Create(ctx, f.childID, f.accountID, vaccination.Input{CustomName: "Vacuna Niño", AppliedOn: "2024-05-01", DoseNumber: intp(1), AllowDuplicate: true})

	require.ErrorIs(t, same, vaccination.ErrDuplicate)
	require.NoError(t, otherDose)
	require.NoError(t, otherDate)
	require.NoError(t, ok)
	require.NotNil(t, confirmed)
	list, err := svc.List(ctx, f.childID)
	require.NoError(t, err)
	require.Len(t, list, 4)
}

func TestService_ACatalogDoseWithNoNumberIsADuplicateOnlyOfAnotherWithNoNumber(t *testing.T) {
	svc, f := newService(t)
	ctx := context.Background()
	_, err := svc.Create(ctx, f.childID, f.accountID, dose("bcg", "2024-05-01"))
	require.NoError(t, err)

	_, same := svc.Create(ctx, f.childID, f.accountID, dose("bcg", "2024-05-01"))
	_, numbered := svc.Create(ctx, f.childID, f.accountID, vaccination.Input{VaccineCode: "bcg", AppliedOn: "2024-05-01", DoseNumber: intp(1)})

	require.ErrorIs(t, same, vaccination.ErrDuplicate)
	require.NoError(t, numbered)
}

func TestService_CorrectingStampsWhoAndWhenWithTheFirstNameAndKeepsTheRest(t *testing.T) {
	pool := testPool(t)
	svc := vaccination.NewService(vaccination.NewRepository(pool))
	f := newFamily(t, pool)
	ctx := context.Background()
	v, err := svc.Create(ctx, f.childID, f.accountID, dose("bcg", "2024-05-01"))
	require.NoError(t, err)

	fixed, err := svc.Update(ctx, f.childID, v.ID, f.accountID, vaccination.Input{VaccineCode: "bcg", AppliedOn: "2024-05-03", Notes: "Corregida"})

	require.NoError(t, err)
	require.Equal(t, v.ID, fixed.ID)
	require.Equal(t, "2024-05-03", fixed.AppliedOn)
	require.Equal(t, "Corregida", *fixed.Notes)
	require.Equal(t, "Ana", *fixed.CorrectedByName, "the first name, never the e-mail")
	require.WithinDuration(t, time.Now(), *fixed.CorrectedAt, time.Minute)
	require.Equal(t, "Ana", fixed.CreatedByName)
	list, err := svc.List(ctx, f.childID)
	require.NoError(t, err)
	require.Len(t, list, 1, "corrected in place, no history")
}

func TestService_ACorrectionThatWouldDuplicateAnotherDoseIsRefusedUnlessConfirmed(t *testing.T) {
	svc, f := newService(t)
	ctx := context.Background()
	_, err := svc.Create(ctx, f.childID, f.accountID, dose("bcg", "2024-05-01"))
	require.NoError(t, err)
	second, err := svc.Create(ctx, f.childID, f.accountID, dose("bcg", "2024-06-01"))
	require.NoError(t, err)

	_, refused := svc.Update(ctx, f.childID, second.ID, f.accountID, dose("bcg", "2024-05-01"))
	_, itself := svc.Update(ctx, f.childID, second.ID, f.accountID, dose("bcg", "2024-06-01"))
	_, confirmed := svc.Update(ctx, f.childID, second.ID, f.accountID, vaccination.Input{VaccineCode: "bcg", AppliedOn: "2024-05-01", AllowDuplicate: true})

	require.ErrorIs(t, refused, vaccination.ErrDuplicate)
	require.NoError(t, itself, "a dose is never a duplicate of itself")
	require.NoError(t, confirmed)
}

func TestService_ADoseOfAnotherChildIsNotFoundWhenCorrectedOrDeleted(t *testing.T) {
	pool := testPool(t)
	svc := vaccination.NewService(vaccination.NewRepository(pool))
	f := newFamily(t, pool)
	stranger := newFamily(t, pool)
	ctx := context.Background()
	v, err := svc.Create(ctx, f.childID, f.accountID, dose("bcg", "2024-05-01"))
	require.NoError(t, err)

	_, upErr := svc.Update(ctx, stranger.childID, v.ID, stranger.accountID, dose("bcg", "2024-05-02"))
	delErr := svc.Delete(ctx, stranger.childID, v.ID)
	_, missing := svc.Update(ctx, f.childID, uuid.New(), f.accountID, dose("bcg", "2024-05-02"))

	require.ErrorIs(t, upErr, vaccination.ErrNotFound)
	require.ErrorIs(t, delErr, vaccination.ErrNotFound)
	require.ErrorIs(t, missing, vaccination.ErrNotFound)
	list, err := svc.List(ctx, f.childID)
	require.NoError(t, err)
	require.Len(t, list, 1, "nothing changed")
	require.Equal(t, "2024-05-01", list[0].AppliedOn)
}

func TestService_DeletingIsForGood(t *testing.T) {
	svc, f := newService(t)
	ctx := context.Background()
	v, err := svc.Create(ctx, f.childID, f.accountID, dose("bcg", "2024-05-01"))
	require.NoError(t, err)

	require.NoError(t, svc.Delete(ctx, f.childID, v.ID))

	list, err := svc.List(ctx, f.childID)
	require.NoError(t, err)
	require.Empty(t, list)
	require.ErrorIs(t, svc.Delete(ctx, f.childID, v.ID), vaccination.ErrNotFound)
}

func TestService_AnUnknownChildAndAnInvalidInputNeverReachTheTransaction(t *testing.T) {
	svc, f := newService(t)
	ctx := context.Background()

	_, noChild := svc.Create(ctx, uuid.New(), f.accountID, dose("bcg", "2024-05-01"))
	_, noInput := svc.Create(ctx, f.childID, f.accountID, vaccination.Input{})
	_, listed := svc.List(ctx, uuid.New())

	require.ErrorIs(t, noChild, vaccination.ErrChildNotFound)
	var verrs vaccination.ValidationErrors
	require.ErrorAs(t, noInput, &verrs)
	require.NoError(t, listed, "a child with nothing is an empty list")
}

func TestRepository_FailuresOfTheDatabaseAreReturnedNotSwallowed(t *testing.T) {
	testPool(t)
	repo := vaccination.NewRepository(closedPool(t))
	ctx := context.Background()
	cleaned := vaccination.Cleaned{VaccineCode: strp("bcg"), AppliedOn: time.Now()}

	_, err := repo.ChildBirthDate(ctx, uuid.New())
	require.Error(t, err)
	_, err = repo.List(ctx, uuid.New())
	require.Error(t, err)
	_, err = repo.Create(ctx, uuid.New(), uuid.New(), cleaned, false)
	require.Error(t, err)
	_, err = repo.Update(ctx, uuid.New(), uuid.New(), uuid.New(), cleaned, false)
	require.Error(t, err)
	require.Error(t, repo.Delete(ctx, uuid.New(), uuid.New()))
}

func strp(s string) *string { return &s }
