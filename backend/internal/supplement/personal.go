package supplement

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// The parent's own routines (specs/033, part 3): supplement_routines rows with child_id NULL, owned by the person's own account.
// Nobody else sees them (access.onRoutineQuery) and their reminders reach only that person.

// ErrAccountNotFound: no such account.
var ErrAccountNotFound = errors.New("account not found")

// personalPlanSQL is whether the plan of a person's own routines is paid: their own account is, or they belong — as an active
// member — to a family whose owner is (the invited person uses their routines while that family pays). `a` is the account.
const personalPlanSQL = `(a.plan = 'paid' OR EXISTS (
	SELECT 1 FROM family_members fm JOIN accounts fo ON fo.id = fm.family_account_id
	WHERE fm.account_id = a.id AND fm.status = 'active' AND fo.plan = 'paid'))`

// CreatePersonal saves a routine of the person's own and its first doses in one transaction. Like Create it locks the account row
// first and then enforces, in this order, the paid plan (*PlanLimitError, their own or their family's) and the cap of 10 active
// personal routines (*RoutineLimitError). Nothing is written when either refuses.
func (r *Repository) CreatePersonal(ctx context.Context, accountID uuid.UUID, in Routine) (uuid.UUID, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var paid bool
	err = tx.QueryRow(ctx, `SELECT `+personalPlanSQL+` FROM accounts a WHERE a.id = $1 FOR UPDATE OF a`, accountID).Scan(&paid)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrAccountNotFound
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("reading the account's plan: %w", err)
	}
	if !paid {
		return uuid.Nil, &PlanLimitError{Reason: PlanLimitSupplements}
	}
	if err := checkPersonalCap(ctx, tx, accountID); err != nil {
		return uuid.Nil, err
	}
	id, err := r.insertRoutine(ctx, tx, accountID, nil, in, accountID)
	if err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, fmt.Errorf("committing routine: %w", err)
	}
	return id, nil
}

// checkPersonalCap refuses the routine that would be the person's 11th active one (paused and ended ones don't count). The
// caller holds the account row lock.
func checkPersonalCap(ctx context.Context, q querier, accountID uuid.UUID) error {
	var active int
	err := q.QueryRow(ctx, `SELECT count(*) FROM supplement_routines WHERE account_id = $1 AND child_id IS NULL AND status = 'active'`, accountID).Scan(&active)
	if err != nil {
		return fmt.Errorf("counting active routines: %w", err)
	}
	if active >= MaxActivePerChild {
		return &RoutineLimitError{Limit: MaxActivePerChild}
	}
	return nil
}

// ListPersonal returns the person's own routines — active first, then paused, then ended — like ListByChild: each with only the
// doses of [from, to), its progress and its next dose. Nothing is hidden by plan.
func (r *Repository) ListPersonal(ctx context.Context, accountID uuid.UUID, from, to time.Time) (*RoutineList, error) {
	var paid bool
	err := r.pool.QueryRow(ctx, `SELECT `+personalPlanSQL+` FROM accounts a WHERE a.id = $1`, accountID).Scan(&paid)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAccountNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading the account's plan: %w", err)
	}
	return r.listWhere(ctx, paid, `r.child_id IS NULL AND r.account_id = $1`, accountID, from, to)
}

// NoticeSeen says whether the account already pressed «Entendido» on the first-time notice of the personal section.
func (r *Repository) NoticeSeen(ctx context.Context, accountID uuid.UUID) (bool, error) {
	var seen bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM personal_routine_notices WHERE account_id = $1)`, accountID).Scan(&seen)
	if err != nil {
		return false, fmt.Errorf("reading the notice: %w", err)
	}
	return seen, nil
}

// MarkNoticeSeen records it (idempotent: the first moment stays).
func (r *Repository) MarkNoticeSeen(ctx context.Context, accountID uuid.UUID) error {
	if _, err := r.pool.Exec(ctx, `INSERT INTO personal_routine_notices (account_id) VALUES ($1) ON CONFLICT DO NOTHING`, accountID); err != nil {
		return fmt.Errorf("saving the notice: %w", err)
	}
	return nil
}
