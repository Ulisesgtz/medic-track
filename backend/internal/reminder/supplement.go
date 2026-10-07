package reminder

import (
	"context"
	"fmt"
	"time"
)

// ClaimDueSupplementDoses is ClaimDueDoses for supplement routines (specs/033, research R8): it claims, in one statement,
// every (dose, person) pair whose reminder is due at `now`. A dose is not taken, belongs to an ACTIVE routine, is scheduled
// in (now-window, now] and is not «sin registrar» (the routine's next dose has not come); each person with at least
// see-and-mark access to the routine's child (the owner account, an active Tutor or Caregiver of the family, the Child-role
// member of that child) who has an active device activated no later than the dose and has NOT turned this routine's reminders
// off («Tus avisos», supplement_muted) gets their own pair. The pair goes into supplement_dose_reminders and only the rows
// really inserted come back: the primary key (dose, person) is what makes one reminder per dose and person at most.
//
// The owner's plan is deliberately not asked: a routine created while the plan was paid keeps reminding if it lapses
// (FR-020, Principio IV) — only creating, editing and resuming need the plan. A taken dose is never a candidate, so nobody
// is reminded of what another person already marked.
//
// A routine without a child is a person's own (specs/033, part 3): only its owner account is a recipient — nobody in the family
// is — and the reminder carries no child name.
func (r *Repository) ClaimDueSupplementDoses(ctx context.Context, now time.Time, window time.Duration) ([]DueDose, error) {
	rows, err := r.pool.Query(ctx, `
		WITH cand AS (
			SELECT d.id, d.scheduled_at, d.routine_id, sr.name, ch.id AS child_id, COALESCE(ch.first_name, '') AS first_name,
			       COALESCE(ch.account_id, sr.account_id) AS owner_id
			FROM supplement_doses d
			JOIN supplement_routines sr ON sr.id = d.routine_id AND sr.status = 'active'
			LEFT JOIN children ch ON ch.id = sr.child_id
			WHERE d.taken = false
			  AND d.scheduled_at <= $1
			  AND d.scheduled_at > $1 - make_interval(secs => $2)
			  -- Never a dose already "sin registrar": the routine's next dose came.
			  AND NOT EXISTS (
				SELECT 1 FROM supplement_doses n
				WHERE n.routine_id = d.routine_id AND n.scheduled_at > d.scheduled_at AND n.scheduled_at <= $1
			  )
		),
		pairs AS (
			SELECT cand.id AS dose_id, a.id AS account_id, cand.scheduled_at
			FROM cand
			JOIN accounts a ON a.id = cand.owner_id
			   OR (cand.child_id IS NOT NULL AND EXISTS (
				SELECT 1 FROM family_members fm
				WHERE fm.account_id = a.id AND fm.family_account_id = cand.owner_id AND fm.status = 'active'
				  AND (fm.role <> 'child' OR fm.child_id = cand.child_id)
			   ))
			WHERE EXISTS (
				SELECT 1 FROM reminder_devices rd
				WHERE rd.account_id = a.id AND rd.active AND rd.activated_at <= cand.scheduled_at
			)
			  AND NOT EXISTS (SELECT 1 FROM supplement_muted sm WHERE sm.routine_id = cand.routine_id AND sm.account_id = a.id)
			  AND NOT EXISTS (SELECT 1 FROM supplement_dose_reminders dr WHERE dr.dose_id = cand.id AND dr.account_id = a.id)
			ORDER BY cand.scheduled_at, a.id
			LIMIT 500
		),
		claimed AS (
			INSERT INTO supplement_dose_reminders (dose_id, account_id, sent_at)
			SELECT dose_id, account_id, $1 FROM pairs
			ON CONFLICT (dose_id, account_id) DO NOTHING
			RETURNING dose_id, account_id
		)
		SELECT cand.id, cand.scheduled_at, cand.routine_id, cand.name, cand.first_name, claimed.account_id, a.reminder_detail
		FROM claimed
		JOIN cand ON cand.id = claimed.dose_id
		JOIN accounts a ON a.id = claimed.account_id
		ORDER BY cand.scheduled_at, claimed.account_id
	`, now, window.Seconds())
	if err != nil {
		return nil, fmt.Errorf("claiming due supplement doses: %w", err)
	}
	defer rows.Close()

	var due []DueDose
	for rows.Next() {
		d := DueDose{Source: SourceSupplement}
		var detail *string
		if err := rows.Scan(&d.DoseID, &d.ScheduledAt, &d.RoutineID, &d.MedicationName, &d.ChildFirstName, &d.AccountID, &detail); err != nil {
			return nil, fmt.Errorf("scanning due supplement dose: %w", err)
		}
		if detail != nil {
			mode := DetailMode(*detail)
			d.Detail = &mode
		}
		due = append(due, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating due supplement doses: %w", err)
	}
	return due, nil
}
