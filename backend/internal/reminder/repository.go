package reminder

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
)

// Repository persists reminder devices and claims the doses to remind.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a reminder Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// UpsertDevice turns reminders on for this browser (its endpoint). An endpoint already known —
// for this account or another one — is updated and moved to accountID: a browser reminds one
// account at a time (research.md R10). created is false when the row already existed. Its
// activation time only moves when it was off or belonged to another account.
func (r *Repository) UpsertDevice(ctx context.Context, accountID uuid.UUID, endpoint, p256dh, auth string) (Device, bool, error) {
	d := Device{AccountID: accountID, Endpoint: endpoint, P256dh: p256dh, Auth: auth, Active: true}
	var created bool
	err := r.pool.QueryRow(ctx, `
		INSERT INTO reminder_devices (account_id, endpoint, p256dh, auth)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (endpoint) DO UPDATE SET
			account_id = EXCLUDED.account_id,
			p256dh = EXCLUDED.p256dh,
			auth = EXCLUDED.auth,
			-- Re-registering an active device of the same account (the app does it on every visit) keeps its
			-- activation time; only a device turned back on, or moved to another account, starts over.
			activated_at = CASE
				WHEN reminder_devices.active AND reminder_devices.account_id = EXCLUDED.account_id THEN reminder_devices.activated_at
				ELSE now()
			END,
			active = true,
			deactivated_at = NULL
		RETURNING id, activated_at, (xmax = 0)
	`, accountID, endpoint, p256dh, auth).Scan(&d.ID, &d.ActivatedAt, &created)
	if err != nil {
		return Device{}, false, fmt.Errorf("upserting reminder device: %w", err)
	}
	return d, created, nil
}

// DeactivateDevice turns reminders off for this account's device with that endpoint. An endpoint
// that isn't this account's is left untouched (and not reported, so nothing leaks about it).
func (r *Repository) DeactivateDevice(ctx context.Context, accountID uuid.UUID, endpoint string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE reminder_devices SET active = false, deactivated_at = now()
		WHERE endpoint = $1 AND account_id = $2 AND active
	`, endpoint, accountID)
	if err != nil {
		return fmt.Errorf("deactivating reminder device: %w", err)
	}
	return nil
}

// DeactivateByID turns a device off because its push service said it no longer exists (404/410).
func (r *Repository) DeactivateByID(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE reminder_devices SET active = false, deactivated_at = now()
		WHERE id = $1 AND active
	`, id)
	if err != nil {
		return fmt.Errorf("deactivating reminder device: %w", err)
	}
	return nil
}

// ClaimDueDoses claims, in one statement, every (dose, person) pair whose reminder is due at `now` and returns them
// (research.md R5, and specs/032-compartir-con-familia for the "per person"). A dose is not taken, scheduled in
// (now-window, now], not "sin registrar" and not canceled; each person with at least see-and-mark access to its child
// (the owner account, an active Tutor or Caregiver of its family, the Child-role member of that child) who has an active
// device activated no later than the dose gets their own pair. The pair is inserted into dose_reminders and only the rows
// that were really inserted come back: the primary key (dose, person) is what makes one reminder per dose and per person
// at most, even across restarts or two instances (a concurrent insert of the same pair waits and then does nothing). A
// dose already taken is never a candidate, so nobody is reminded of a dose another person already marked; and a person who
// left or was removed (their membership is no longer active) is not a recipient from the next tick on.
// `doses.reminder_sent_at` is still written, for whoever reads it, but no longer decides anything.
func (r *Repository) ClaimDueDoses(ctx context.Context, now time.Time, window time.Duration) ([]DueDose, error) {
	rows, err := r.pool.Query(ctx, `
		WITH cand AS (
			SELECT d.id, d.scheduled_at, c.id AS consultation_id, m.name, ch.id AS child_id, ch.first_name, ch.account_id AS owner_id
			FROM doses d
			JOIN medications m ON m.id = d.medication_id
			JOIN consultations c ON c.id = m.consultation_id
			JOIN children ch ON ch.id = c.child_id
			WHERE d.taken = false
			  AND d.scheduled_at <= $1
			  AND d.scheduled_at > $1 - make_interval(secs => $2)
			  -- Never a dose already "sin registrar": its medication's next dose came (specs/013).
			  AND d.scheduled_at + make_interval(hours => m.frequency_hours) > $1
			  -- Never a dose canceled by ending the treatment early (specs/016).
			  AND (m.ended_at IS NULL OR d.scheduled_at <= m.ended_at)
		),
		pairs AS (
			SELECT cand.id AS dose_id, a.id AS account_id, cand.scheduled_at
			FROM cand
			JOIN accounts a ON a.id = cand.owner_id
			   OR EXISTS (
				SELECT 1 FROM family_members fm
				WHERE fm.account_id = a.id AND fm.family_account_id = cand.owner_id AND fm.status = 'active'
				  AND (fm.role <> 'child' OR fm.child_id = cand.child_id)
			   )
			WHERE EXISTS (
				SELECT 1 FROM reminder_devices rd
				WHERE rd.account_id = a.id AND rd.active AND rd.activated_at <= cand.scheduled_at
			)
			  AND NOT EXISTS (SELECT 1 FROM dose_reminders dr WHERE dr.dose_id = cand.id AND dr.account_id = a.id)
			ORDER BY cand.scheduled_at, a.id
			LIMIT 500
		),
		claimed AS (
			INSERT INTO dose_reminders (dose_id, account_id, sent_at)
			SELECT dose_id, account_id, $1 FROM pairs
			ON CONFLICT (dose_id, account_id) DO NOTHING
			RETURNING dose_id, account_id
		),
		stamp AS (
			UPDATE doses SET reminder_sent_at = $1
			WHERE id IN (SELECT dose_id FROM claimed) AND reminder_sent_at IS NULL
			RETURNING id
		)
		SELECT cand.id, cand.scheduled_at, cand.consultation_id, cand.name, cand.first_name, claimed.account_id, a.reminder_detail
		FROM claimed
		JOIN cand ON cand.id = claimed.dose_id
		JOIN accounts a ON a.id = claimed.account_id
		ORDER BY cand.scheduled_at, claimed.account_id
	`, now, window.Seconds())
	if err != nil {
		return nil, fmt.Errorf("claiming due doses: %w", err)
	}
	defer rows.Close()

	var due []DueDose
	for rows.Next() {
		d := DueDose{Source: SourceMedication}
		var detail *string
		if err := rows.Scan(&d.DoseID, &d.ScheduledAt, &d.ConsultationID, &d.MedicationName, &d.ChildFirstName, &d.AccountID, &detail); err != nil {
			return nil, fmt.Errorf("scanning due dose: %w", err)
		}
		if detail != nil {
			mode := DetailMode(*detail)
			d.Detail = &mode
		}
		due = append(due, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating due doses: %w", err)
	}
	return due, nil
}

// ActiveDevicesFor returns the account's active devices activated no later than scheduledAt:
// a dose that was already past when a device was turned on is not reminded there.
func (r *Repository) ActiveDevicesFor(ctx context.Context, accountID uuid.UUID, scheduledAt time.Time) ([]Device, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, endpoint, p256dh, auth, activated_at
		FROM reminder_devices
		WHERE account_id = $1 AND active AND activated_at <= $2
		ORDER BY activated_at
	`, accountID, scheduledAt)
	if err != nil {
		return nil, fmt.Errorf("listing reminder devices: %w", err)
	}
	defer rows.Close()

	var devices []Device
	for rows.Next() {
		d := Device{AccountID: accountID, Active: true}
		if err := rows.Scan(&d.ID, &d.Endpoint, &d.P256dh, &d.Auth, &d.ActivatedAt); err != nil {
			return nil, fmt.Errorf("scanning reminder device: %w", err)
		}
		devices = append(devices, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating reminder devices: %w", err)
	}
	return devices, nil
}

// MarkTakenByAction marks a dose taken from the "Tomada" button of a reminder, on behalf of the account of the DEVICE that
// received it (specs/032): that person is the author the others see ("por Ana"), and they must still have access to the
// dose's child (at least to see and mark) — someone who left or was removed can't mark any more. ErrInvalidActionToken if
// the device is off or unknown, the dose doesn't exist or the access is gone. Marking an already marked dose is a success
// that changes nothing (the first mark keeps its author). The dose may be a medication's or, if there is no such one, a
// supplement routine's (specs/033).
func (r *Repository) MarkTakenByAction(ctx context.Context, doseID, deviceID uuid.UUID) error {
	table := "doses"
	accountID, childID, err := r.doseAndDevice(ctx, doseID, deviceID, `
		SELECT rd.account_id, ch.id
		FROM reminder_devices rd, doses d
		JOIN medications m ON m.id = d.medication_id
		JOIN consultations c ON c.id = m.consultation_id
		JOIN children ch ON ch.id = c.child_id
		WHERE d.id = $1 AND rd.id = $2 AND rd.active`)
	if errors.Is(err, pgx.ErrNoRows) {
		table = "supplement_doses"
		accountID, childID, err = r.doseAndDevice(ctx, doseID, deviceID, `
			SELECT rd.account_id, ch.id
			FROM reminder_devices rd, supplement_doses d
			JOIN supplement_routines sr ON sr.id = d.routine_id
			JOIN children ch ON ch.id = sr.child_id
			WHERE d.id = $1 AND rd.id = $2 AND rd.active`)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidActionToken
	}
	if err != nil {
		return fmt.Errorf("finding the dose and the device: %w", err)
	}

	level, err := access.NewRepository(r.pool).OfAccountOnChild(ctx, accountID, childID)
	if err != nil {
		return fmt.Errorf("checking access to the child: %w", err)
	}
	if !level.AtLeast(access.Mark) {
		return ErrInvalidActionToken
	}

	// `table` is one of the two constants above, never input.
	if _, err := r.pool.Exec(ctx, `
		UPDATE `+table+` SET taken = true, taken_by_account_id = $2, taken_at = now()
		WHERE id = $1 AND NOT taken
	`, doseID, accountID); err != nil {
		return fmt.Errorf("marking dose taken: %w", err)
	}
	return nil
}

func (r *Repository) doseAndDevice(ctx context.Context, doseID, deviceID uuid.UUID, query string) (accountID, childID uuid.UUID, err error) {
	err = r.pool.QueryRow(ctx, query, doseID, deviceID).Scan(&accountID, &childID)
	return accountID, childID, err
}
