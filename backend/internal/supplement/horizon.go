package supplement

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
)

// PlannerInterval is how often the planner looks for routines whose generated doses are running out.
const PlannerInterval = 30 * time.Second

const plannerBatch = 100

// ExtendHorizon makes sure every ACTIVE routine has doses generated at least RefillBelowDays ahead (research R2): the ones
// whose `generated_until` is closer than that are extended up to HorizonDays ahead (or to their end date). It only adds
// (ON CONFLICT DO NOTHING) and never regenerates what already happened, and two instances at once don't repeat work (rows
// locked by another are skipped). It returns how many routines it extended. Paused and ended routines are never extended.
func (r *Repository) ExtendHorizon(ctx context.Context) (int, error) {
	now := r.now()
	total := 0
	for {
		n, err := r.extendBatch(ctx, now)
		total += n
		if err != nil || n < plannerBatch {
			return total, err
		}
	}
}

// extendBatch extends up to plannerBatch routines in one transaction.
func (r *Repository) extendBatch(ctx context.Context, now time.Time) (int, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	rows, err := tx.Query(ctx, `
		SELECT r.id FROM supplement_routines r
		WHERE r.status = 'active' AND r.generated_until < $1
		ORDER BY r.generated_until
		LIMIT $2
		FOR UPDATE OF r SKIP LOCKED`, now.AddDate(0, 0, RefillBelowDays), plannerBatch)
	if err != nil {
		return 0, fmt.Errorf("looking for routines to extend: %w", err)
	}
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scanning routine: %w", err)
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("looking for routines to extend: %w", err)
	}

	horizon := now.AddDate(0, 0, HorizonDays)
	for _, id := range ids {
		s, err := scanRoutine(tx.QueryRow(ctx, routineSelect+` WHERE r.id = $1`, id))
		if err != nil {
			return 0, fmt.Errorf("reading routine: %w", err)
		}
		if err := insertDoses(ctx, tx, id, Generate(s.view.Routine, s.generatedUntil, horizon)); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `UPDATE supplement_routines SET generated_until = $2 WHERE id = $1`, id, horizon); err != nil {
			return 0, fmt.Errorf("saving the horizon: %w", err)
		}
	}
	if err := commit(ctx, tx); err != nil {
		return 0, err
	}
	return len(ids), nil
}

// Planner is what RunPlanner drives (the Repository; a fake in tests).
type Planner interface {
	ExtendHorizon(ctx context.Context) (int, error)
}

// FailureReporter records what fails in the planner in error_logs (satisfied by *jobreport.Reporter); the messages carry
// no routine data, only that it failed.
type FailureReporter interface {
	Report(kind, message string, accountID *uuid.UUID)
	Recovered(kind string)
}

const failureHorizon = "horizon"

// RunPlanner extends the horizon right away and then every interval until ctx is done. It runs in the always-on API
// process next to the reminders' ticker. A failure goes to the console and, with a reporter, to error_logs; shutting down
// is not a failure.
func RunPlanner(ctx context.Context, p Planner, rep FailureReporter, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if _, err := p.ExtendHorizon(ctx); err != nil && ctx.Err() == nil {
			log.Printf("supplement: extending the routines failed: %v", err)
			if rep != nil {
				rep.Report(failureHorizon, "supplement planner failed: could not extend the routines' doses", nil)
			}
		} else if err == nil && rep != nil {
			rep.Recovered(failureHorizon)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
