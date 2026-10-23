package reminder

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// The reminders of a child's own phone (specs/047-dispositivo-del-hijo). A phone is a recipient of its own: it gets the reminders of
// the doses, supplements and activities of ITS child — never appointments, never anything of the family — once each, and the same
// «Tomada» / «Realizado» button marks the dose «por Mateo» as long as the phone is still linked. Everything rests on the rules the
// accounts' reminders use (candidates.go) and on tables of its own (child_dose_reminders, child_supplement_dose_reminders), so the
// keys of the accounts' tables don't change.

// UpsertChildDevice turns reminders on for a browser of a child's phone. The endpoint belongs to one recipient at a time: if it was
// an account's it moves to the phone (and the other way round, see UpsertDevice).
func (r *Repository) UpsertChildDevice(ctx context.Context, linkID uuid.UUID, endpoint, p256dh, auth string) (Device, bool, error) {
	d := Device{ChildLinkID: linkID, Endpoint: endpoint, P256dh: p256dh, Auth: auth, Active: true}
	var created bool
	err := r.pool.QueryRow(ctx, `
		INSERT INTO reminder_devices (child_link_id, endpoint, p256dh, auth)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (endpoint) DO UPDATE SET
			account_id = NULL,
			child_link_id = EXCLUDED.child_link_id,
			p256dh = EXCLUDED.p256dh,
			auth = EXCLUDED.auth,
			activated_at = CASE
				WHEN reminder_devices.active AND reminder_devices.child_link_id = EXCLUDED.child_link_id THEN reminder_devices.activated_at
				ELSE now()
			END,
			active = true,
			deactivated_at = NULL
		RETURNING id, activated_at, (xmax = 0)
	`, linkID, endpoint, p256dh, auth).Scan(&d.ID, &d.ActivatedAt, &created)
	if err != nil {
		return Device{}, false, fmt.Errorf("upserting child reminder device: %w", err)
	}
	return d, created, nil
}

// DeactivateChildDevice turns reminders off for this phone's browser with that endpoint. An endpoint that isn't this phone's is left
// untouched (and not reported, so nothing leaks about it).
func (r *Repository) DeactivateChildDevice(ctx context.Context, linkID uuid.UUID, endpoint string) error {
	if _, err := r.pool.Exec(ctx, `
		UPDATE reminder_devices SET active = false, deactivated_at = now()
		WHERE child_link_id = $1 AND endpoint = $2 AND active`, linkID, endpoint); err != nil {
		return fmt.Errorf("deactivating child reminder device: %w", err)
	}
	return nil
}

// ActiveDevicesForLink returns the phone's active devices activated no later than scheduledAt.
func (r *Repository) ActiveDevicesForLink(ctx context.Context, linkID uuid.UUID, scheduledAt time.Time) ([]Device, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, endpoint, p256dh, auth, activated_at
		FROM reminder_devices
		WHERE child_link_id = $1 AND active AND activated_at <= $2
		ORDER BY activated_at`, linkID, scheduledAt)
	if err != nil {
		return nil, fmt.Errorf("listing child reminder devices: %w", err)
	}
	defer rows.Close()
	var devices []Device
	for rows.Next() {
		d := Device{ChildLinkID: linkID, Active: true}
		if err := rows.Scan(&d.ID, &d.Endpoint, &d.P256dh, &d.Auth, &d.ActivatedAt); err != nil {
			return nil, fmt.Errorf("scanning child reminder device: %w", err)
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

// ClaimDueChildDevices claims, for every active child phone with a reminder device activated no later than the dose, the pair
// (dose, phone) of each due dose of ITS child: the medications' (a consultation's) and the supplements' and activities' (a routine's
// with a child). The pair goes into child_dose_reminders / child_supplement_dose_reminders and only the rows really inserted come
// back, so there is one reminder per dose and phone at most, even with two ticks at once. A taken, canceled or «sin registrar» dose is
// never a candidate (the same rules as the accounts', candidates.go) and the owner's plan is not asked: a phone linked while the plan
// was paid keeps being reminded if it lapses.
func (r *Repository) ClaimDueChildDevices(ctx context.Context, now time.Time, window time.Duration) ([]DueDose, error) {
	medications, err := r.claimChild(ctx, now, window, SourceMedication, `
		WITH cand AS (
			`+medicationCandidates+`
		),
		pairs AS (
			SELECT cand.id AS dose_id, l.id AS link_id, cand.scheduled_at
			FROM cand
			JOIN child_device_links l ON l.child_id = cand.child_id AND l.status = 'active'
			WHERE EXISTS (SELECT 1 FROM reminder_devices rd WHERE rd.child_link_id = l.id AND rd.active AND rd.activated_at <= cand.scheduled_at)
			  AND NOT EXISTS (SELECT 1 FROM child_dose_reminders cr WHERE cr.dose_id = cand.id AND cr.link_id = l.id)
			ORDER BY cand.scheduled_at, l.id
			LIMIT 500
		),
		claimed AS (
			INSERT INTO child_dose_reminders (dose_id, link_id, sent_at)
			SELECT dose_id, link_id, $1 FROM pairs
			ON CONFLICT (dose_id, link_id) DO NOTHING
			RETURNING dose_id, link_id
		)
		SELECT cand.id, cand.scheduled_at, cand.consultation_id, '00000000-0000-0000-0000-000000000000'::uuid, cand.name, 'medication', cand.first_name, claimed.link_id, l.reminder_detail
		FROM claimed
		JOIN cand ON cand.id = claimed.dose_id
		JOIN child_device_links l ON l.id = claimed.link_id
		ORDER BY cand.scheduled_at, claimed.link_id`)
	if err != nil {
		return nil, err
	}
	routines, err := r.claimChild(ctx, now, window, SourceSupplement, `
		WITH cand AS (
			`+supplementCandidates+`
		),
		pairs AS (
			SELECT cand.id AS dose_id, l.id AS link_id, cand.scheduled_at
			FROM cand
			JOIN child_device_links l ON l.child_id = cand.child_id AND l.status = 'active'
			WHERE EXISTS (SELECT 1 FROM reminder_devices rd WHERE rd.child_link_id = l.id AND rd.active AND rd.activated_at <= cand.scheduled_at)
			  AND NOT EXISTS (SELECT 1 FROM child_supplement_dose_reminders cr WHERE cr.dose_id = cand.id AND cr.link_id = l.id)
			ORDER BY cand.scheduled_at, l.id
			LIMIT 500
		),
		claimed AS (
			INSERT INTO child_supplement_dose_reminders (dose_id, link_id, sent_at)
			SELECT dose_id, link_id, $1 FROM pairs
			ON CONFLICT (dose_id, link_id) DO NOTHING
			RETURNING dose_id, link_id
		)
		SELECT cand.id, cand.scheduled_at, '00000000-0000-0000-0000-000000000000'::uuid, cand.routine_id, cand.name, cand.kind, cand.first_name, claimed.link_id, l.reminder_detail
		FROM claimed
		JOIN cand ON cand.id = claimed.dose_id
		JOIN child_device_links l ON l.id = claimed.link_id
		ORDER BY cand.scheduled_at, claimed.link_id`)
	if err != nil {
		return medications, err
	}
	return append(medications, routines...), nil
}

// claimChild runs one of the two claims and reads what came back as DueDoses of the phones.
func (r *Repository) claimChild(ctx context.Context, now time.Time, window time.Duration, source Source, query string) ([]DueDose, error) {
	rows, err := r.pool.Query(ctx, query, now, window.Seconds())
	if err != nil {
		return nil, fmt.Errorf("claiming due doses of the child phones: %w", err)
	}
	defer rows.Close()
	var due []DueDose
	for rows.Next() {
		d := DueDose{Source: source}
		var kind string
		var detail *string
		if err := rows.Scan(&d.DoseID, &d.ScheduledAt, &d.ConsultationID, &d.RoutineID, &d.MedicationName, &kind, &d.ChildFirstName, &d.ChildLinkID, &detail); err != nil {
			return nil, fmt.Errorf("scanning due dose of a child phone: %w", err)
		}
		if kind == "activity" {
			d.Source = SourceActivity
		}
		if detail != nil {
			mode := DetailMode(*detail)
			d.Detail = &mode
		}
		due = append(due, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating due doses of the child phones: %w", err)
	}
	return due, nil
}

// childLinkOf is the child phone a reminder device belongs to, if it belongs to one and is on.
func (r *Repository) childLinkOf(ctx context.Context, deviceID uuid.UUID) (uuid.UUID, bool, error) {
	var linkID uuid.UUID
	err := r.pool.QueryRow(ctx, `SELECT child_link_id FROM reminder_devices WHERE id = $1 AND active AND child_link_id IS NOT NULL`, deviceID).Scan(&linkID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	if err != nil {
		return uuid.Nil, false, fmt.Errorf("reading the reminder device: %w", err)
	}
	return linkID, true, nil
}

// markTakenByChildDevice is the «Tomada» / «Realizado» button of a child phone's reminder: the dose is marked by the PHONE (shown with
// the child's name) only while the phone is still linked and the dose is its child's; anything else is the same ErrInvalidActionToken
// as everywhere. Marking an already marked dose is a success that changes nothing (the first mark keeps its author).
func (r *Repository) markTakenByChildDevice(ctx context.Context, doseID, deviceID, linkID uuid.UUID) error {
	var childID uuid.UUID
	err := r.pool.QueryRow(ctx, `SELECT child_id FROM child_device_links WHERE id = $1 AND status = 'active'`, linkID).Scan(&childID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidActionToken
	}
	if err != nil {
		return fmt.Errorf("reading the child phone: %w", err)
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE doses d SET taken = true, taken_by_child_device_id = $3, taken_at = now()
		FROM medications m, consultations c
		WHERE d.id = $1 AND m.id = d.medication_id AND c.id = m.consultation_id AND c.child_id = $2 AND NOT d.taken`, doseID, childID, linkID)
	if err != nil {
		return fmt.Errorf("marking dose taken by a child phone: %w", err)
	}
	if tag.RowsAffected() > 0 {
		return nil
	}
	tag, err = r.pool.Exec(ctx, `
		UPDATE supplement_doses d SET taken = true, taken_by_child_device_id = $3, taken_at = now()
		FROM supplement_routines sr
		WHERE d.id = $1 AND sr.id = d.routine_id AND sr.child_id = $2 AND NOT d.taken`, doseID, childID, linkID)
	if err != nil {
		return fmt.Errorf("marking supplement dose taken by a child phone: %w", err)
	}
	if tag.RowsAffected() > 0 {
		return nil
	}
	// Nothing changed: the dose is already marked (success) or it isn't this phone's child's (refused).
	var theirs bool
	err = r.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM doses d JOIN medications m ON m.id = d.medication_id JOIN consultations c ON c.id = m.consultation_id WHERE d.id = $1 AND c.child_id = $2)
		    OR EXISTS (SELECT 1 FROM supplement_doses d JOIN supplement_routines sr ON sr.id = d.routine_id WHERE d.id = $1 AND sr.child_id = $2)`,
		doseID, childID).Scan(&theirs)
	if err != nil {
		return fmt.Errorf("checking the dose of a child phone: %w", err)
	}
	if !theirs {
		return ErrInvalidActionToken
	}
	return nil
}
