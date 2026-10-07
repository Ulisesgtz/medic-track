package supplement

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// lockRoutine starts a transaction in which the routine's OWNER ACCOUNT row and then the routine's row are locked, in that
// order (the same account lock Create takes, so a creation, a resume and the cap are checked one after the other). It
// returns the routine as it is, with the owner's plan in View.PaidPlan. ErrRoutineNotFound if there is none.
func (r *Repository) lockRoutine(ctx context.Context, routineID uuid.UUID) (pgx.Tx, scanned, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, scanned{}, fmt.Errorf("starting transaction: %w", err)
	}
	var owner uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT a.id FROM accounts a JOIN supplement_routines sr ON sr.account_id = a.id
		WHERE sr.id = $1 FOR UPDATE OF a`, routineID).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		_ = tx.Rollback(ctx)
		return nil, scanned{}, ErrRoutineNotFound
	}
	if err != nil {
		_ = tx.Rollback(ctx)
		return nil, scanned{}, fmt.Errorf("locking the owner account: %w", err)
	}
	s, err := scanRoutine(tx.QueryRow(ctx, routineSelect+` WHERE r.id = $1 FOR UPDATE OF r`, routineID))
	if errors.Is(err, pgx.ErrNoRows) {
		_ = tx.Rollback(ctx)
		return nil, scanned{}, ErrRoutineNotFound
	}
	if err != nil {
		_ = tx.Rollback(ctx)
		return nil, scanned{}, fmt.Errorf("reading routine: %w", err)
	}
	return tx, s, nil
}

// dropFutureUnmarked deletes the doses that have not come and were not marked — the only ones a pause, an edit or a finish
// may touch (research R4): past doses and marked ones are the child's history and never change. A dose that already had a
// reminder sent is kept too (it cannot have one while it is in the future, but nothing here may ever delete what was sent).
func dropFutureUnmarked(ctx context.Context, q querier, routineID uuid.UUID, now time.Time) error {
	_, err := q.Exec(ctx, `
		DELETE FROM supplement_doses d
		WHERE d.routine_id = $1 AND d.scheduled_at > $2 AND NOT d.taken
		  AND NOT EXISTS (SELECT 1 FROM supplement_dose_reminders dr WHERE dr.dose_id = d.id)`, routineID, now)
	if err != nil {
		return fmt.Errorf("dropping future doses: %w", err)
	}
	return nil
}

func requirePaid(s scanned) error {
	if !s.view.PaidPlan {
		return &PlanLimitError{Reason: PlanLimitSupplements}
	}
	return nil
}

// Pause turns an active routine into a paused one: from now on no doses are created and none is reminded. The future
// unmarked doses disappear; the past and the marked ones stay. Needs no plan (stopping is never blocked).
// ErrRoutineNotActive if it is not active.
func (r *Repository) Pause(ctx context.Context, routineID uuid.UUID) error {
	tx, s, err := r.lockRoutine(ctx, routineID)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if s.view.Status != StatusActive {
		return ErrRoutineNotActive
	}
	now := r.now()
	if _, err := tx.Exec(ctx, `UPDATE supplement_routines SET status = 'paused', paused_at = $2, updated_at = $2 WHERE id = $1`, routineID, now); err != nil {
		return fmt.Errorf("pausing routine: %w", err)
	}
	if err := dropFutureUnmarked(ctx, tx, routineID, now); err != nil {
		return err
	}
	return commit(ctx, tx)
}

// Resume turns a paused routine active again, from now and without the doses of the time it was paused. It is the paid
// plan's (*PlanLimitError) and counts toward the cap of active routines (*RoutineLimitError), both checked under the
// account lock. ErrRoutineEnded if it ended, ErrRoutineNotActive if it is already active.
func (r *Repository) Resume(ctx context.Context, routineID uuid.UUID, utcOffsetMinutes int) error {
	tx, s, err := r.lockRoutine(ctx, routineID)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	switch s.view.Status {
	case StatusEnded:
		return ErrRoutineEnded
	case StatusActive:
		return ErrRoutineNotActive
	}
	if err := requirePaid(s); err != nil {
		return err
	}
	if s.view.ChildID != nil {
		if err := checkActiveCap(ctx, tx, *s.view.ChildID); err != nil {
			return err
		}
	} else if err := checkPersonalCap(ctx, tx, s.view.AccountID); err != nil {
		return err
	}
	now := r.now()
	horizon := now.AddDate(0, 0, HorizonDays)
	routine := s.view.Routine
	routine.UtcOffsetMinutes = utcOffsetMinutes
	if _, err := tx.Exec(ctx, `
		UPDATE supplement_routines
		SET status = 'active', paused_at = NULL, utc_offset_minutes = $2, generated_until = $3, updated_at = $4
		WHERE id = $1`, routineID, utcOffsetMinutes, horizon, now); err != nil {
		return fmt.Errorf("resuming routine: %w", err)
	}
	if err := insertDoses(ctx, tx, routineID, Generate(routine, now, horizon)); err != nil {
		return err
	}
	return commit(ctx, tx)
}

// Update replaces the routine's form (name, note and schedule). The change counts from the next dose: the future unmarked
// doses are dropped and regenerated (if it is active); the past and the marked ones never change. It is the paid plan's;
// the cap does not apply (it does not add an active routine). ErrRoutineEnded if it ended.
func (r *Repository) Update(ctx context.Context, routineID uuid.UUID, in Routine) error {
	tx, s, err := r.lockRoutine(ctx, routineID)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if s.view.Status == StatusEnded {
		return ErrRoutineEnded
	}
	if err := requirePaid(s); err != nil {
		return err
	}
	now := r.now()
	horizon := now.AddDate(0, 0, HorizonDays)
	if _, err := tx.Exec(ctx, `
		UPDATE supplement_routines
		SET name = $2, note = $3, period = $4, times = $5::text[]::time[], weekdays = $6::smallint[], interval_hours = $7,
		    first_date = $8::date, first_time = NULLIF($9, '')::time, end_date = NULLIF($10, '')::date,
		    utc_offset_minutes = $11, generated_until = $12, updated_at = $13
		WHERE id = $1`,
		routineID, in.Name, in.Note, string(in.Period), nonNil(in.Times), smallInts(in.Weekdays), nullableInt(in.IntervalHours),
		in.FirstDate, in.FirstTime, in.EndDate, in.UtcOffsetMinutes, horizon, now); err != nil {
		return fmt.Errorf("updating routine: %w", err)
	}
	if err := dropFutureUnmarked(ctx, tx, routineID, now); err != nil {
		return err
	}
	if s.view.Status == StatusActive {
		in.ID = routineID
		if err := insertDoses(ctx, tx, routineID, Generate(in, now, horizon)); err != nil {
			return err
		}
	}
	return commit(ctx, tx)
}

// Finish ends the routine for good: no more doses or reminders; the future unmarked doses disappear and the history stays.
// Needs no plan. Idempotent: finishing an ended routine changes nothing.
func (r *Repository) Finish(ctx context.Context, routineID uuid.UUID) error {
	tx, s, err := r.lockRoutine(ctx, routineID)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if s.view.Status == StatusEnded {
		return nil
	}
	now := r.now()
	if _, err := tx.Exec(ctx, `UPDATE supplement_routines SET status = 'ended', ended_at = $2, updated_at = $2 WHERE id = $1`, routineID, now); err != nil {
		return fmt.Errorf("finishing routine: %w", err)
	}
	if err := dropFutureUnmarked(ctx, tx, routineID, now); err != nil {
		return err
	}
	return commit(ctx, tx)
}

// SetMuted turns the reminders of this routine off (muted) or on for ONE person («Tus avisos»): nobody else's change. Only an
// active routine has reminders to turn off (ErrRoutineNotActive otherwise). Idempotent.
func (r *Repository) SetMuted(ctx context.Context, routineID, accountID uuid.UUID, muted bool) error {
	var status string
	err := r.pool.QueryRow(ctx, `SELECT status FROM supplement_routines WHERE id = $1`, routineID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrRoutineNotFound
	}
	if err != nil {
		return fmt.Errorf("reading routine: %w", err)
	}
	if Status(status) != StatusActive {
		return ErrRoutineNotActive
	}
	if muted {
		_, err = r.pool.Exec(ctx, `INSERT INTO supplement_muted (routine_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, routineID, accountID)
	} else {
		_, err = r.pool.Exec(ctx, `DELETE FROM supplement_muted WHERE routine_id = $1 AND account_id = $2`, routineID, accountID)
	}
	if err != nil {
		return fmt.Errorf("saving the reminder choice: %w", err)
	}
	return nil
}

// MutedAmong returns which of the routines the person turned their reminders off for.
func (r *Repository) MutedAmong(ctx context.Context, accountID uuid.UUID, routineIDs []uuid.UUID) (map[uuid.UUID]bool, error) {
	out := map[uuid.UUID]bool{}
	if len(routineIDs) == 0 || accountID == uuid.Nil {
		return out, nil
	}
	rows, err := r.pool.Query(ctx, `SELECT routine_id FROM supplement_muted WHERE account_id = $1 AND routine_id = ANY($2)`, accountID, routineIDs)
	if err != nil {
		return nil, fmt.Errorf("reading the reminder choices: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scanning the reminder choice: %w", err)
		}
		out[id] = true
	}
	return out, rows.Err()
}

func commit(ctx context.Context, tx pgx.Tx) error {
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing: %w", err)
	}
	return nil
}
