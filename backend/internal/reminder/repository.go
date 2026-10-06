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

// ClaimDueDoses marks, in one statement, every dose whose reminder is due at `now` as reminded
// and returns them (research.md R5): not taken, not reminded yet, scheduled in (now-window, now],
// of an account with an active device activated no later than the dose. Claiming before sending
// is what makes a dose reminded at most once, even across restarts or two instances; rows locked
// by another claim are skipped, not waited for.
func (r *Repository) ClaimDueDoses(ctx context.Context, now time.Time, window time.Duration) ([]DueDose, error) {
	rows, err := r.pool.Query(ctx, `
		WITH due AS (
			SELECT d.id
			FROM doses d
			JOIN medications m ON m.id = d.medication_id
			JOIN consultations c ON c.id = m.consultation_id
			JOIN children ch ON ch.id = c.child_id
			WHERE d.reminder_sent_at IS NULL
			  AND d.taken = false
			  AND d.scheduled_at <= $1
			  AND d.scheduled_at > $1 - make_interval(secs => $2)
			  -- Never a dose already "sin registrar": its medication's next dose came (specs/013).
			  AND d.scheduled_at + make_interval(hours => m.frequency_hours) > $1
			  -- Never a dose canceled by ending the treatment early (specs/016).
			  AND (m.ended_at IS NULL OR d.scheduled_at <= m.ended_at)
			  AND EXISTS (
				SELECT 1 FROM reminder_devices rd
				WHERE rd.account_id = ch.account_id AND rd.active AND rd.activated_at <= d.scheduled_at
			  )
			ORDER BY d.scheduled_at
			LIMIT 500
			FOR UPDATE OF d SKIP LOCKED
		)
		UPDATE doses SET reminder_sent_at = $1
		FROM due, medications m, consultations c, children ch, accounts a
		WHERE doses.id = due.id
		  AND m.id = doses.medication_id
		  AND c.id = m.consultation_id
		  AND ch.id = c.child_id
		  AND a.id = ch.account_id
		RETURNING doses.id, doses.scheduled_at, c.id, m.name, ch.first_name, a.id, a.reminder_detail
	`, now, window.Seconds())
	if err != nil {
		return nil, fmt.Errorf("claiming due doses: %w", err)
	}
	defer rows.Close()

	var due []DueDose
	for rows.Next() {
		var d DueDose
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
// that changes nothing (the first mark keeps its author).
func (r *Repository) MarkTakenByAction(ctx context.Context, doseID, deviceID uuid.UUID) error {
	var accountID, childID uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT rd.account_id, ch.id
		FROM reminder_devices rd, doses d
		JOIN medications m ON m.id = d.medication_id
		JOIN consultations c ON c.id = m.consultation_id
		JOIN children ch ON ch.id = c.child_id
		WHERE d.id = $1 AND rd.id = $2 AND rd.active
	`, doseID, deviceID).Scan(&accountID, &childID)
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

	if _, err := r.pool.Exec(ctx, `
		UPDATE doses SET taken = true, taken_by_account_id = $2, taken_at = now()
		WHERE id = $1 AND NOT taken
	`, doseID, accountID); err != nil {
		return fmt.Errorf("marking dose taken: %w", err)
	}
	return nil
}
