package access_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/032-compartir-con-familia: what a session can do with a child, by role and by the owner's plan.

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

type person struct {
	clerkID   string
	accountID uuid.UUID
}

// newAccount creates an account on the given plan with n children (and, if asked, a consultation for the first one).
func newAccount(t *testing.T, pool *pgxpool.Pool, plan account.Plan, children int) (person, *account.Account) {
	t.Helper()
	suffix := time.Now().UnixNano()
	clerkID := fmt.Sprintf("user_access_%d_%s", suffix, uuid.NewString()[:6])
	acc := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: fmt.Sprintf("access.%d.%s@example.com", suffix, uuid.NewString()[:6]),
		Plan: plan, ClerkUserID: &clerkID,
	}
	for i := 0; i < children; i++ {
		acc.Children = append(acc.Children, account.Child{FirstName: fmt.Sprintf("Hijo%c", 'A'+i), LastName: "Prueba", BirthDate: time.Now().AddDate(-12, 0, 0)})
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return person{clerkID: clerkID, accountID: acc.ID}, acc
}

// join makes `member` an active member of `family`'s family with the role (and, for 'child', the child).
func join(t *testing.T, pool *pgxpool.Pool, family, member person, role string, childID *uuid.UUID) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO family_members (family_account_id, account_id, role, child_id, invited_by_account_id)
		VALUES ($1, $2, $3, $4, $1) RETURNING id`, family.accountID, member.accountID, role, childID).Scan(&id))
	return id
}

func end(t *testing.T, pool *pgxpool.Pool, memberID uuid.UUID, status string) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `UPDATE family_members SET status = $2, ended_at = now(), ended_by_account_id = account_id WHERE id = $1`, memberID, status)
	require.NoError(t, err)
}

func setPlan(t *testing.T, pool *pgxpool.Pool, p person, plan string) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `UPDATE accounts SET plan = $2 WHERE id = $1`, p.accountID, plan)
	require.NoError(t, err)
}

func consultationOf(t *testing.T, pool *pgxpool.Pool, childID uuid.UUID) uuid.UUID {
	t.Helper()
	start := "08:00"
	c, err := consultation.NewService(consultation.NewRepository(pool)).CreateConsultation(context.Background(), childID, consultation.CreateConsultationInput{
		DoctorName: "Dra. López", ConsultDate: time.Now(), Photo: []byte("fake"),
		Medications: []consultation.CreateMedicationInput{{Name: "Amoxicilina", FrequencyHours: 8, DurationDays: 1, StartTime: &start}},
	})
	require.NoError(t, err)
	return c.ID
}

func TestLevel_AtLeastAndOrder(t *testing.T) {
	require.True(t, access.Full.AtLeast(access.Mark))
	require.True(t, access.Mark.AtLeast(access.Mark))
	require.False(t, access.None.AtLeast(access.Mark))
	require.False(t, access.Mark.AtLeast(access.Full))
}

func TestContext_StoresWhatTheSessionCanDo(t *testing.T) {
	_, ok := access.FromContext(context.Background())
	require.False(t, ok)

	want := access.Access{Level: access.Mark, ActorAccountID: uuid.New()}
	got, ok := access.FromContext(access.WithAccess(context.Background(), want))
	require.True(t, ok)
	require.Equal(t, want, got)
}

// The matrix: one family (paid owner, two children), every kind of person, on a child and on its consultation.
func TestRoles_OnAChildAndItsConsultation(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	ctx := context.Background()
	owner, acc := newAccount(t, pool, account.PlanPaid, 2)
	childA, childB := acc.Children[0].ID, acc.Children[1].ID
	consultationA := consultationOf(t, pool, childA)

	tutor, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, tutor, "tutor", nil)
	caregiver, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, caregiver, "caregiver", nil)
	kid, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, kid, "child", &childA)
	stranger, _ := newAccount(t, pool, account.PlanPaid, 1)

	cases := []struct {
		name     string
		who      person
		child    uuid.UUID
		wantKind access.Level
	}{
		{"the owner, her child", owner, childA, access.Full},
		{"the owner, the other child", owner, childB, access.Full},
		{"a tutor", tutor, childB, access.Full},
		{"a caregiver sees and marks", caregiver, childA, access.Mark},
		{"a caregiver, the other child too", caregiver, childB, access.Mark},
		{"a child-role member, their own child", kid, childA, access.Mark},
		{"a child-role member never sees a sibling", kid, childB, access.None},
		{"a stranger", stranger, childA, access.None},
		{"a session without a clerk id", person{}, childA, access.None},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			onChild, err := repo.OnChild(ctx, tc.who.clerkID, tc.child)
			require.NoError(t, err)
			require.Equal(t, tc.wantKind, onChild.Level)
			if tc.wantKind != access.None {
				require.Equal(t, tc.who.accountID, onChild.ActorAccountID, "the actor is the session's own account")
			}

			if tc.child == childA {
				onConsultation, err := repo.OnConsultation(ctx, tc.who.clerkID, consultationA)
				require.NoError(t, err)
				require.Equal(t, tc.wantKind, onConsultation.Level, "a consultation is resolved through its child")
			}
		})
	}
}

func TestRoles_NothingThatDoesNotExistIsReachable(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	owner, _ := newAccount(t, pool, account.PlanPaid, 1)

	onChild, err := repo.OnChild(context.Background(), owner.clerkID, uuid.New())
	require.NoError(t, err)
	require.Equal(t, access.None, onChild.Level)
	onConsultation, err := repo.OnConsultation(context.Background(), owner.clerkID, uuid.New())
	require.NoError(t, err)
	require.Equal(t, access.None, onConsultation.Level)
	onAccount, err := repo.OnAccount(context.Background(), owner.clerkID, uuid.New())
	require.NoError(t, err)
	require.Equal(t, access.None, onAccount.Level)

	// A session whose account doesn't exist yet reaches nothing either.
	_, acc := newAccount(t, pool, account.PlanPaid, 1)
	onChild, err = repo.OnChild(context.Background(), "user_without_an_account", acc.Children[0].ID)
	require.NoError(t, err)
	require.Equal(t, access.None, onChild.Level)
	require.Equal(t, uuid.Nil, onChild.ActorAccountID)
}

// FR-028 / SC-007: leaving or being removed takes everything at once; a different family's membership gives nothing.
func TestRoles_AMemberWhoLeftOrWasRemovedHasNothing(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	ctx := context.Background()
	owner, acc := newAccount(t, pool, account.PlanPaid, 1)
	child := acc.Children[0].ID

	tutor, _ := newAccount(t, pool, account.PlanFree, 0)
	tutorMembership := join(t, pool, owner, tutor, "tutor", nil)
	caregiver, _ := newAccount(t, pool, account.PlanFree, 0)
	caregiverMembership := join(t, pool, owner, caregiver, "caregiver", nil)

	end(t, pool, tutorMembership, "left")
	end(t, pool, caregiverMembership, "removed")

	for _, p := range []person{tutor, caregiver} {
		got, err := repo.OnChild(ctx, p.clerkID, child)
		require.NoError(t, err)
		require.Equal(t, access.None, got.Level)
	}
}

func TestRoles_AMembershipOfAnotherFamilyGivesNothing(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	owner, acc := newAccount(t, pool, account.PlanPaid, 1)
	otherOwner, _ := newAccount(t, pool, account.PlanPaid, 1)
	tutorOfOther, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, otherOwner, tutorOfOther, "tutor", nil)

	got, err := repo.OnChild(context.Background(), tutorOfOther.clerkID, acc.Children[0].ID)

	require.NoError(t, err)
	require.Equal(t, access.None, got.Level)
	_ = owner
}

// FR-024: when the owner's plan is not paid, the people invited can still see and mark, and nothing else — and it comes
// back with the plan, with no new invitation.
func TestRoles_TheOwnersPlanCapsTheInvitedAtMark(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	ctx := context.Background()
	owner, acc := newAccount(t, pool, account.PlanPaid, 1)
	child := acc.Children[0].ID
	tutor, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, tutor, "tutor", nil)
	caregiver, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, caregiver, "caregiver", nil)

	level := func(p person) access.Level {
		got, err := repo.OnChild(ctx, p.clerkID, child)
		require.NoError(t, err)
		return got.Level
	}
	require.Equal(t, access.Full, level(tutor))

	setPlan(t, pool, owner, "free")
	require.Equal(t, access.Mark, level(tutor), "a tutor keeps seeing and marking")
	require.Equal(t, access.Mark, level(caregiver))
	require.Equal(t, access.Full, level(owner), "the owner keeps her own account (the free plan's own rules apply, not this)")

	setPlan(t, pool, owner, "paid")
	require.Equal(t, access.Full, level(tutor), "back to what it was, without a new invitation")
	require.Equal(t, access.Mark, level(caregiver))
}

func TestOnAccount_AddingChildrenToAFamily(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	ctx := context.Background()
	owner, acc := newAccount(t, pool, account.PlanPaid, 1)
	tutor, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, tutor, "tutor", nil)
	caregiver, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, caregiver, "caregiver", nil)
	kid, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, kid, "child", &acc.Children[0].ID)
	stranger, _ := newAccount(t, pool, account.PlanPaid, 0)

	for name, tc := range map[string]struct {
		who  person
		want access.Level
	}{
		"owner": {owner, access.Full}, "tutor": {tutor, access.Full}, "caregiver": {caregiver, access.Mark},
		"child-role member has none of the account": {kid, access.None}, "stranger": {stranger, access.None},
	} {
		got, err := repo.OnAccount(ctx, tc.who.clerkID, owner.accountID)
		require.NoError(t, err, name)
		require.Equal(t, tc.want, got.Level, name)
	}
	empty, err := repo.OnAccount(ctx, "", owner.accountID)
	require.NoError(t, err)
	require.Equal(t, access.None, empty.Level)
}

func TestOfAccountOnChild_TheReminderButtonKnowsTheDevicesAccountNotASession(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	ctx := context.Background()
	owner, acc := newAccount(t, pool, account.PlanPaid, 2)
	childA, childB := acc.Children[0].ID, acc.Children[1].ID
	caregiver, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, caregiver, "caregiver", nil)
	kid, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, kid, "child", &childA)
	stranger, _ := newAccount(t, pool, account.PlanPaid, 0)

	for name, tc := range map[string]struct {
		who   person
		child uuid.UUID
		want  access.Level
	}{
		"owner": {owner, childA, access.Full}, "caregiver": {caregiver, childB, access.Mark},
		"child, own": {kid, childA, access.Mark}, "child, sibling": {kid, childB, access.None}, "stranger": {stranger, childA, access.None},
	} {
		got, err := repo.OfAccountOnChild(ctx, tc.who.accountID, tc.child)
		require.NoError(t, err, name)
		require.Equal(t, tc.want, got, name)
	}
}

func TestRepository_ConnectionError(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping test that requires a live database")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	pool.Close()
	repo := access.NewRepository(pool)

	_, err = repo.OnChild(context.Background(), "user_x", uuid.New())
	require.Error(t, err)
	_, err = repo.OfAccountOnChild(context.Background(), uuid.New(), uuid.New())
	require.Error(t, err)
}

// The database itself refuses the shapes that would make the rules above meaningless.
func TestSchema_RefusesWhatTheRulesAssume(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	owner, acc := newAccount(t, pool, account.PlanPaid, 1)
	other, otherAcc := newAccount(t, pool, account.PlanPaid, 1)
	person1, _ := newAccount(t, pool, account.PlanFree, 0)
	person2, _ := newAccount(t, pool, account.PlanFree, 0)

	insert := func(family, member person, role string, child *uuid.UUID) error {
		_, err := pool.Exec(ctx, `INSERT INTO family_members (family_account_id, account_id, role, child_id, invited_by_account_id) VALUES ($1, $2, $3, $4, $1)`,
			family.accountID, member.accountID, role, child)
		return err
	}

	require.Error(t, insert(owner, owner, "tutor", nil), "the owner is not a member of her own family")
	require.Error(t, insert(owner, person1, "child", nil), "the child role needs its child")
	childOfOther := otherAcc.Children[0].ID
	require.Error(t, insert(owner, person1, "child", &childOfOther), "the child has to be of that family")
	require.Error(t, insert(owner, person1, "tutor", &acc.Children[0].ID), "only the child role has a child")
	require.Error(t, insert(owner, person1, "boss", nil), "the roles are fixed")

	require.NoError(t, insert(owner, person1, "tutor", nil))
	require.Error(t, insert(other, person1, "caregiver", nil), "one active family per person")
	require.NoError(t, insert(owner, person2, "caregiver", nil))

	_, err := pool.Exec(ctx, `UPDATE family_members SET ended_at = now() WHERE account_id = $1 AND status = 'active'`, person1.accountID)
	require.Error(t, err, "an active membership has no end date")
}

// routineOf inserts a supplement routine of the child (the access check only needs the row, not its doses).
func routineOf(t *testing.T, pool *pgxpool.Pool, owner person, childID *uuid.UUID) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO supplement_routines (account_id, child_id, name, period, times, first_date, utc_offset_minutes, generated_until, created_by_account_id)
		VALUES ($1, $2, 'Vitamina D', 'daily', ARRAY['08:00']::time[], current_date, 0, now(), $1) RETURNING id`, owner.accountID, childID).Scan(&id))
	return id
}

// Specs/033: a routine is reached through its child, with the same levels.
func TestRoles_OnASupplementRoutine(t *testing.T) {
	pool := testPool(t)
	repo := access.NewRepository(pool)
	ctx := context.Background()
	owner, acc := newAccount(t, pool, account.PlanPaid, 2)
	childA, childB := acc.Children[0].ID, acc.Children[1].ID
	routineA, routineB := routineOf(t, pool, owner, &childA), routineOf(t, pool, owner, &childB)

	tutor, _ := newAccount(t, pool, account.PlanFree, 0)
	tutorMembership := join(t, pool, owner, tutor, "tutor", nil)
	caregiver, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, caregiver, "caregiver", nil)
	kid, _ := newAccount(t, pool, account.PlanFree, 0)
	join(t, pool, owner, kid, "child", &childA)
	stranger, _ := newAccount(t, pool, account.PlanPaid, 1)

	cases := []struct {
		name    string
		who     person
		routine uuid.UUID
		want    access.Level
	}{
		{"the owner", owner, routineA, access.Full},
		{"a tutor of a paid family", tutor, routineB, access.Full},
		{"a caregiver sees and marks", caregiver, routineA, access.Mark},
		{"a child-role member, the routine of their own child", kid, routineA, access.Mark},
		{"a child-role member never sees a sibling's routine", kid, routineB, access.None},
		{"a stranger", stranger, routineA, access.None},
		{"a session without a clerk id", person{}, routineA, access.None},
		{"a routine that does not exist", owner, uuid.New(), access.None},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.OnRoutine(ctx, tc.who.clerkID, tc.routine)
			require.NoError(t, err)
			require.Equal(t, tc.want, got.Level)
			if tc.want != access.None {
				require.Equal(t, tc.who.accountID, got.ActorAccountID)
			}
		})
	}

	// The owner's plan caps an invited Tutor at Mark, and someone who left has nothing.
	setPlan(t, pool, owner, "free")
	got, err := repo.OnRoutine(ctx, tutor.clerkID, routineA)
	require.NoError(t, err)
	require.Equal(t, access.Mark, got.Level)
	end(t, pool, tutorMembership, "left")
	got, err = repo.OnRoutine(ctx, tutor.clerkID, routineA)
	require.NoError(t, err)
	require.Equal(t, access.None, got.Level)

	// A routine with no child (a parent's own, part 3) is not reachable through a child: None for everyone, even its account.
	personal := routineOf(t, pool, owner, nil)
	got, err = repo.OnRoutine(ctx, owner.clerkID, personal)
	require.NoError(t, err)
	require.Equal(t, access.None, got.Level)
}
