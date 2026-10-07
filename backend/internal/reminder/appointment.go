package reminder

import (
	"context"
	"fmt"
	"time"
)

// ClaimDueAppointmentNotices is ClaimDueDoses for the notices of a consultation's next appointment (specs/033, part 2): it claims,
// in one statement, every (notice, person) pair whose notice goes off at `now`. The appointment is still scheduled and hasn't
// started; the notice fired in (now-window, now] and was **not already past when it was saved** (`fire_at > created_at`: a notice
// that was late at that moment never fires, so nothing is sent late); each person with at least see-and-mark access to the child
// who has an active device activated no later than the notice and has NOT turned this appointment's reminders off gets their
// own pair. The pair goes into appointment_notice_reminders and only the rows really inserted come back: the primary key
// (notice, person) is what makes one reminder per notice and person at most.
//
// The owner's plan is deliberately not asked: reminders of an appointment created while the plan was paid keep coming if it
// lapses (FR-020). A done or canceled appointment, or an edit that dropped the notice, stops them at once.
func (r *Repository) ClaimDueAppointmentNotices(ctx context.Context, now time.Time, window time.Duration) ([]DueDose, error) {
	rows, err := r.pool.Query(ctx, `
		WITH cand AS (
			SELECT n.id AS notice_id, n.fire_at, ap.id AS appointment_id, ap.consultation_id, ap.starts_at, co.doctor_name, ap.note,
			       ch.id AS child_id, ch.first_name, ch.account_id AS owner_id
			FROM appointment_notices n
			JOIN consultation_appointments ap ON ap.id = n.appointment_id AND ap.status = 'scheduled'
			JOIN consultations co ON co.id = ap.consultation_id
			JOIN children ch ON ch.id = ap.child_id
			WHERE n.fire_at <= $1
			  AND n.fire_at > $1 - make_interval(secs => $2)
			  AND n.fire_at > n.created_at
			  AND ap.starts_at > $1
		),
		pairs AS (
			SELECT cand.notice_id, a.id AS account_id, cand.fire_at
			FROM cand
			JOIN accounts a ON a.id = cand.owner_id
			   OR EXISTS (
				SELECT 1 FROM family_members fm
				WHERE fm.account_id = a.id AND fm.family_account_id = cand.owner_id AND fm.status = 'active'
				  AND (fm.role <> 'child' OR fm.child_id = cand.child_id)
			   )
			WHERE EXISTS (
				SELECT 1 FROM reminder_devices rd
				WHERE rd.account_id = a.id AND rd.active AND rd.activated_at <= cand.fire_at
			)
			  AND NOT EXISTS (SELECT 1 FROM appointment_muted am WHERE am.appointment_id = cand.appointment_id AND am.account_id = a.id)
			  AND NOT EXISTS (SELECT 1 FROM appointment_notice_reminders nr WHERE nr.notice_id = cand.notice_id AND nr.account_id = a.id)
			ORDER BY cand.fire_at, a.id
			LIMIT 500
		),
		claimed AS (
			INSERT INTO appointment_notice_reminders (notice_id, account_id, sent_at)
			SELECT notice_id, account_id, $1 FROM pairs
			ON CONFLICT (notice_id, account_id) DO NOTHING
			RETURNING notice_id, account_id
		)
		SELECT cand.notice_id, cand.fire_at, cand.appointment_id, cand.consultation_id, cand.starts_at,
		       (EXTRACT(EPOCH FROM (cand.starts_at - cand.fire_at)) / 60)::int, cand.doctor_name, cand.note, cand.first_name,
		       claimed.account_id, a.reminder_detail
		FROM claimed
		JOIN cand ON cand.notice_id = claimed.notice_id
		JOIN accounts a ON a.id = claimed.account_id
		ORDER BY cand.fire_at, claimed.account_id
	`, now, window.Seconds())
	if err != nil {
		return nil, fmt.Errorf("claiming due appointment notices: %w", err)
	}
	defer rows.Close()

	var due []DueDose
	for rows.Next() {
		d := DueDose{Source: SourceAppointment}
		var detail *string
		if err := rows.Scan(&d.DoseID, &d.ScheduledAt, &d.AppointmentID, &d.ConsultationID, &d.StartsAt, &d.LeadMinutes, &d.DoctorName, &d.Note, &d.ChildFirstName, &d.AccountID, &detail); err != nil {
			return nil, fmt.Errorf("scanning due appointment notice: %w", err)
		}
		if detail != nil {
			mode := DetailMode(*detail)
			d.Detail = &mode
		}
		due = append(due, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating due appointment notices: %w", err)
	}
	return due, nil
}
