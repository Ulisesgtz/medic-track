package historyexport

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrChildNotFound is a child that doesn't exist.
var ErrChildNotFound = errors.New("child not found")

// Repository reads what the other packages don't already give: the child, the running treatment, the scheduled appointments and
// which consultations have a photo. Read-only.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) child(ctx context.Context, childID uuid.UUID) (Child, error) {
	var c Child
	err := r.pool.QueryRow(ctx, `SELECT first_name, last_name, birth_date, height::float8, weight::float8 FROM children WHERE id = $1`, childID).
		Scan(&c.FirstName, &c.LastName, &c.BirthDate, &c.Height, &c.Weight)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, ErrChildNotFound
	}
	if err != nil {
		return c, fmt.Errorf("reading the child: %w", err)
	}
	return c, nil
}

// activeTreatment is the medication of the child, not ended and with a dose ahead, whose last dose is furthest in the future (the
// same «active» as the child's overview), with its first dose and the doctor of its consultation. Nil if none.
func (r *Repository) activeTreatment(ctx context.Context, childID uuid.UUID, now time.Time) (*ActiveTreatment, error) {
	var t ActiveTreatment
	err := r.pool.QueryRow(ctx, `
		SELECT m.name, m.frequency_hours, min(d.scheduled_at), c.doctor_name
		FROM medications m
		JOIN consultations c ON c.id = m.consultation_id
		JOIN doses d ON d.medication_id = m.id
		WHERE c.child_id = $1 AND m.ended_at IS NULL
		GROUP BY m.id, m.name, m.frequency_hours, c.doctor_name
		HAVING max(d.scheduled_at) > $2
		ORDER BY max(d.scheduled_at) DESC, m.id
		LIMIT 1`, childID, now).Scan(&t.MedicationName, &t.FrequencyHours, &t.Since, &t.DoctorName)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading the running treatment: %w", err)
	}
	return &t, nil
}

// scheduledAppointments are the child's scheduled appointments still ahead, the nearest first, each with its consultation (uuid.Nil
// for one added without a consultation).
func (r *Repository) scheduledAppointments(ctx context.Context, childID uuid.UUID, now time.Time) ([]appointmentRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT COALESCE(ap.consultation_id, '00000000-0000-0000-0000-000000000000'::uuid), ap.starts_at,
		       COALESCE(NULLIF(ap.doctor_name, ''), co.doctor_name, ''), ap.location
		FROM consultation_appointments ap
		LEFT JOIN consultations co ON co.id = ap.consultation_id
		WHERE ap.child_id = $1 AND ap.status = 'scheduled' AND ap.starts_at > $2
		ORDER BY ap.starts_at, ap.id`, childID, now)
	if err != nil {
		return nil, fmt.Errorf("listing the appointments: %w", err)
	}
	defer rows.Close()
	var out []appointmentRow
	for rows.Next() {
		var a appointmentRow
		if err := rows.Scan(&a.consultationID, &a.ScheduledAt, &a.DoctorName, &a.Location); err != nil {
			return nil, fmt.Errorf("scanning an appointment: %w", err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

type appointmentRow struct {
	consultationID uuid.UUID
	Appointment
}

// withPhoto says which of the consultations have a prescription photo.
func (r *Repository) withPhoto(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]bool, error) {
	out := map[uuid.UUID]bool{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.pool.Query(ctx, `SELECT id FROM consultations WHERE id = ANY($1) AND octet_length(photo) > 0`, ids)
	if err != nil {
		return nil, fmt.Errorf("looking for the photos: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scanning a photo: %w", err)
		}
		out[id] = true
	}
	return out, rows.Err()
}
