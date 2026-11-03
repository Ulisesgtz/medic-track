package access_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
)

// specs/058-consultas-del-titular (research R3): a person's own consultations are theirs alone until they share them; then the
// owner and the Tutors of their family see and mark (Mark), nobody else.

// ownConsultationOf saves a consultation of the person themself (no child) straight in the database.
func ownConsultationOf(t *testing.T, pool *pgxpool.Pool, p person) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO consultations (account_id, doctor_name, consult_date, photo) VALUES ($1, 'Dr. Paz', current_date, '')
		RETURNING id`, p.accountID).Scan(&id))
	return id
}

func ownAppointmentOf(t *testing.T, pool *pgxpool.Pool, p person) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO consultation_appointments (account_id, starts_at, utc_offset_minutes, created_by_account_id)
		VALUES ($1, now() + interval '3 days', -360, $1) RETURNING id`, p.accountID).Scan(&id))
	return id
}

func share(t *testing.T, pool *pgxpool.Pool, p person, on bool) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO own_consultation_sharing (account_id, shared) VALUES ($1, $2)
		ON CONFLICT (account_id) DO UPDATE SET shared = EXCLUDED.shared, changed_at = now()`, p.accountID, on)
	require.NoError(t, err)
}

type ownLevels struct {
	consultation, appointment, person access.Level
}

func ownLevelsOf(t *testing.T, repo *access.Repository, who person, consultationID, appointmentID, personID uuid.UUID) ownLevels {
	t.Helper()
	ctx := context.Background()
	c, err := repo.OnConsultation(ctx, who.clerkID, consultationID)
	require.NoError(t, err)
	a, err := repo.OnAppointment(ctx, who.clerkID, appointmentID)
	require.NoError(t, err)
	p, err := repo.OnPerson(ctx, who.clerkID, personID)
	require.NoError(t, err)
	return ownLevels{c.Level, a.Level, p.Level}
}

func TestOwn_TheOwnersConsultationsByRoleAndSwitch(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)

	owner, ownerAcc := newAccount(t, pool, account.PlanPaid, 1)
	tutor, _ := newAccount(t, pool, account.PlanFree, 0)
	caregiver, _ := newAccount(t, pool, account.PlanFree, 0)
	childMember, _ := newAccount(t, pool, account.PlanFree, 0)
	removed, _ := newAccount(t, pool, account.PlanFree, 0)
	stranger, _ := newAccount(t, pool, account.PlanPaid, 0)
	join(t, pool, owner, tutor, "tutor", nil)
	join(t, pool, owner, caregiver, "caregiver", nil)
	join(t, pool, owner, childMember, "child", &ownerAcc.Children[0].ID)
	end(t, pool, join(t, pool, owner, removed, "tutor", nil), "left")

	k := ownConsultationOf(t, pool, owner)
	ap := ownAppointmentOf(t, pool, owner)
	all := func(l access.Level) ownLevels { return ownLevels{l, l, l} }

	check := func(step string, want map[string]ownLevels) {
		for name, who := range map[string]person{
			"owner": owner, "tutor": tutor, "caregiver": caregiver, "child member": childMember, "removed": removed, "stranger": stranger,
		} {
			require.Equal(t, want[name], ownLevelsOf(t, repo, who, k, ap, owner.accountID), "%s: %s", step, name)
		}
	}
	closed := map[string]ownLevels{
		"owner": all(access.Full), "tutor": all(access.None), "caregiver": all(access.None),
		"child member": all(access.None), "removed": all(access.None), "stranger": all(access.None),
	}
	shared := map[string]ownLevels{
		"owner": all(access.Full), "tutor": all(access.Mark), "caregiver": all(access.None),
		"child member": all(access.None), "removed": all(access.None), "stranger": all(access.None),
	}

	check("never touched", closed)
	share(t, pool, owner, false)
	check("off", closed)
	share(t, pool, owner, true)
	check("on", shared)
	// Once shared, a family that stops paying keeps seeing and marking (research R5).
	setPlan(t, pool, owner, "free")
	check("on, family lapsed", shared)
	share(t, pool, owner, false)
	check("off again", closed)
}

func TestOwn_AnInvitedPersonSharesWithTheFamilysOwnerAndItsTutors(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)

	familyOwner, _ := newAccount(t, pool, account.PlanPaid, 0)
	invited, _ := newAccount(t, pool, account.PlanFree, 0)
	otherTutor, _ := newAccount(t, pool, account.PlanFree, 0)
	caregiver, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, familyOwner, invited, "tutor", nil)
	join(t, pool, familyOwner, otherTutor, "tutor", nil)
	join(t, pool, familyOwner, caregiver, "caregiver", nil)

	k := ownConsultationOf(t, pool, invited)
	ap := ownAppointmentOf(t, pool, invited)
	share(t, pool, invited, true)

	require.Equal(t, ownLevels{access.Full, access.Full, access.Full}, ownLevelsOf(t, repo, invited, k, ap, invited.accountID))
	require.Equal(t, ownLevels{access.Mark, access.Mark, access.Mark}, ownLevelsOf(t, repo, familyOwner, k, ap, invited.accountID))
	require.Equal(t, ownLevels{access.Mark, access.Mark, access.Mark}, ownLevelsOf(t, repo, otherTutor, k, ap, invited.accountID))
	require.Equal(t, ownLevels{access.None, access.None, access.None}, ownLevelsOf(t, repo, caregiver, k, ap, invited.accountID))

	// The family owner's own consultations are not the invited person's to edit: Mark at most, never Full.
	ownerK := ownConsultationOf(t, pool, familyOwner)
	share(t, pool, familyOwner, true)
	got, err := repo.OnConsultation(context.Background(), invited.clerkID, ownerK)
	require.NoError(t, err)
	require.Equal(t, access.Mark, got.Level)
}

func TestOwn_SharingWithoutAFamilyReachesNobody(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	alone, _ := newAccount(t, pool, account.PlanPaid, 0)
	stranger, _ := newAccount(t, pool, account.PlanPaid, 0)
	k := ownConsultationOf(t, pool, alone)
	ap := ownAppointmentOf(t, pool, alone)
	share(t, pool, alone, true)
	require.Equal(t, ownLevels{access.None, access.None, access.None}, ownLevelsOf(t, repo, stranger, k, ap, alone.accountID))

	// A family whose only member left is no family to share with.
	owner, _ := newAccount(t, pool, account.PlanPaid, 0)
	left, _ := newAccount(t, pool, account.PlanFree, 0)
	end(t, pool, join(t, pool, owner, left, "tutor", nil), "left")
	share(t, pool, owner, true)
	k2 := ownConsultationOf(t, pool, owner)
	ap2 := ownAppointmentOf(t, pool, owner)
	require.Equal(t, ownLevels{access.None, access.None, access.None}, ownLevelsOf(t, repo, left, k2, ap2, owner.accountID))
}

func TestOwn_AChildsConsultationIsUnchanged(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	owner, ownerAcc := newAccount(t, pool, account.PlanPaid, 1)
	tutor, _ := newAccount(t, pool, account.PlanFree, 0)
	caregiver, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, tutor, "tutor", nil)
	join(t, pool, owner, caregiver, "caregiver", nil)
	k := consultationOf(t, pool, ownerAcc.Children[0].ID)
	// The owner's switch has nothing to do with the children.
	share(t, pool, owner, false)

	for who, want := range map[person]access.Level{owner: access.Full, tutor: access.Full, caregiver: access.Mark} {
		got, err := repo.OnConsultation(context.Background(), who.clerkID, k)
		require.NoError(t, err)
		require.Equal(t, want, got.Level)
	}
}

func TestOwn_NobodyAndNothing(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	owner, _ := newAccount(t, pool, account.PlanPaid, 0)
	ctx := context.Background()

	got, err := repo.OnPerson(ctx, "", owner.accountID)
	require.NoError(t, err)
	require.Equal(t, access.None, got.Level)
	got, err = repo.OnPerson(ctx, owner.clerkID, uuid.New())
	require.NoError(t, err)
	require.Equal(t, access.None, got.Level)
	got, err = repo.OnPerson(ctx, "user_nobody_"+uuid.NewString(), owner.accountID)
	require.NoError(t, err)
	require.Equal(t, access.None, got.Level)
}

func TestOfAccountOnConsultation_TheReminderButtonOnAnOwnDose(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	ctx := context.Background()
	owner, _ := newAccount(t, pool, account.PlanPaid, 0)
	tutor, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, tutor, "tutor", nil)
	k := ownConsultationOf(t, pool, owner)

	level, err := repo.OfAccountOnConsultation(ctx, owner.accountID, k)
	require.NoError(t, err)
	require.Equal(t, access.Full, level)
	level, err = repo.OfAccountOnConsultation(ctx, tutor.accountID, k)
	require.NoError(t, err)
	require.Equal(t, access.None, level)
	share(t, pool, owner, true)
	level, err = repo.OfAccountOnConsultation(ctx, tutor.accountID, k)
	require.NoError(t, err)
	require.Equal(t, access.Mark, level)
}
