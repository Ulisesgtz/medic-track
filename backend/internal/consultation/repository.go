package consultation

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository persists Consultation, Medication and Dose records.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a consultation Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// querier is satisfied by both *pgxpool.Pool and pgx.Tx, so helpers like
// childExists work whether called inside a transaction or not.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// childExists reports whether a child with the given id exists — used to
// distinguish "no consultations yet" from "no such child" (FR-001/FR-002).
func childExists(ctx context.Context, q querier, childID uuid.UUID) (bool, error) {
	var exists bool
	err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM children WHERE id = $1)`, childID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("checking child existence: %w", err)
	}
	return exists, nil
}

// GetByChild lists a child's consultations, most recent first (FR-001). It
// returns ErrChildNotFound if no child exists for childID.
func (r *Repository) GetByChild(ctx context.Context, childID uuid.UUID) ([]Consultation, error) {
	exists, err := childExists(ctx, r.pool, childID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrChildNotFound
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, child_id, doctor_name, consult_date, symptoms, created_at
		FROM consultations WHERE child_id = $1 ORDER BY consult_date DESC
	`, childID)
	if err != nil {
		return nil, fmt.Errorf("querying consultations: %w", err)
	}
	defer rows.Close()

	consultations := make([]Consultation, 0)
	for rows.Next() {
		var c Consultation
		if err := rows.Scan(&c.ID, &c.ChildID, &c.DoctorName, &c.ConsultDate, &c.Symptoms, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning consultation: %w", err)
		}
		consultations = append(consultations, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating consultations: %w", err)
	}

	return consultations, nil
}

// Create persists a consultation with its medications and, for every
// medication with a StartTime, all of its expected doses — all inside one
// transaction (research.md). It returns ErrChildNotFound if childID doesn't
// exist.
func (r *Repository) Create(ctx context.Context, childID uuid.UUID, c *Consultation) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback is a no-op after a successful commit

	exists, err := childExists(ctx, tx, childID)
	if err != nil {
		return err
	}
	if !exists {
		return ErrChildNotFound
	}

	c.ChildID = childID
	err = tx.QueryRow(ctx, `
		INSERT INTO consultations (child_id, doctor_name, consult_date, photo, symptoms)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`, c.ChildID, c.DoctorName, c.ConsultDate, c.Photo, c.Symptoms,
	).Scan(&c.ID, &c.CreatedAt)
	if err != nil {
		return fmt.Errorf("inserting consultation: %w", err)
	}

	for i := range c.Medications {
		med := &c.Medications[i]
		med.ConsultationID = c.ID
		err = tx.QueryRow(ctx, `
			INSERT INTO medications (consultation_id, name, frequency_hours, duration_days, start_time)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id, created_at
		`, med.ConsultationID, med.Name, med.FrequencyHours, med.DurationDays, med.StartTime,
		).Scan(&med.ID, &med.CreatedAt)
		if err != nil {
			return fmt.Errorf("inserting medication: %w", err)
		}

		for _, scheduledAt := range generateDoseSchedule(c.ConsultDate, med) {
			dose := Dose{MedicationID: med.ID, ScheduledAt: scheduledAt}
			err = tx.QueryRow(ctx, `
				INSERT INTO doses (medication_id, scheduled_at)
				VALUES ($1, $2)
				RETURNING id, created_at
			`, dose.MedicationID, dose.ScheduledAt,
			).Scan(&dose.ID, &dose.CreatedAt)
			if err != nil {
				return fmt.Errorf("inserting dose: %w", err)
			}
			med.Doses = append(med.Doses, dose)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing transaction: %w", err)
	}
	return nil
}

// generateDoseSchedule computes every expected dose datetime for a
// medication with a StartTime, all at once (research.md): total =
// floor(duration_days*24 / frequency_hours) doses, spaced frequency_hours
// apart starting at consultDate + StartTime. Returns nil if StartTime is
// nil (FR-010).
func generateDoseSchedule(consultDate time.Time, med *Medication) []time.Time {
	if med.StartTime == nil {
		return nil
	}
	var startHour, startMinute int
	if n, err := fmt.Sscanf(*med.StartTime, "%d:%d", &startHour, &startMinute); n != 2 || err != nil {
		// Malformed StartTime shouldn't reach here — service.go validates the
		// HH:MM format before Create is ever called — but if it somehow does,
		// generate no doses rather than silently defaulting to midnight.
		return nil
	}

	start := time.Date(
		consultDate.Year(), consultDate.Month(), consultDate.Day(),
		startHour, startMinute, 0, 0, consultDate.Location(),
	)

	totalHours := med.DurationDays * 24
	total := totalHours / med.FrequencyHours

	schedule := make([]time.Time, 0, total)
	for i := 0; i < total; i++ {
		schedule = append(schedule, start.Add(time.Duration(i*med.FrequencyHours)*time.Hour))
	}
	return schedule
}

// GetByID retrieves a consultation with its medications and their doses
// (doses ordered oldest-first). Returns ErrConsultationNotFound if no
// consultation exists for id.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*Consultation, error) {
	c := &Consultation{ID: id}
	err := r.pool.QueryRow(ctx, `
		SELECT child_id, doctor_name, consult_date, photo, symptoms, created_at
		FROM consultations WHERE id = $1
	`, id).Scan(&c.ChildID, &c.DoctorName, &c.ConsultDate, &c.Photo, &c.Symptoms, &c.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrConsultationNotFound
		}
		return nil, fmt.Errorf("querying consultation: %w", err)
	}

	medRows, err := r.pool.Query(ctx, `
		SELECT id, name, frequency_hours, duration_days, start_time, created_at
		FROM medications WHERE consultation_id = $1 ORDER BY created_at ASC
	`, id)
	if err != nil {
		return nil, fmt.Errorf("querying medications: %w", err)
	}
	defer medRows.Close()

	for medRows.Next() {
		med := Medication{ConsultationID: id}
		var startTime *string
		if err := medRows.Scan(&med.ID, &med.Name, &med.FrequencyHours, &med.DurationDays, &startTime, &med.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning medication: %w", err)
		}
		med.StartTime = startTime
		c.Medications = append(c.Medications, med)
	}
	if err := medRows.Err(); err != nil {
		return nil, fmt.Errorf("iterating medications: %w", err)
	}

	for i := range c.Medications {
		med := &c.Medications[i]
		doseRows, err := r.pool.Query(ctx, `
			SELECT id, scheduled_at, taken, created_at
			FROM doses WHERE medication_id = $1 ORDER BY scheduled_at ASC
		`, med.ID)
		if err != nil {
			return nil, fmt.Errorf("querying doses: %w", err)
		}
		for doseRows.Next() {
			dose := Dose{MedicationID: med.ID}
			if err := doseRows.Scan(&dose.ID, &dose.ScheduledAt, &dose.Taken, &dose.CreatedAt); err != nil {
				doseRows.Close()
				return nil, fmt.Errorf("scanning dose: %w", err)
			}
			med.Doses = append(med.Doses, dose)
		}
		if err := doseRows.Err(); err != nil {
			doseRows.Close()
			return nil, fmt.Errorf("iterating doses: %w", err)
		}
		doseRows.Close()
	}

	return c, nil
}

// UpdateDoseStatus sets a dose's taken status, with no validation of
// scheduled_at or treatment status (FR-016). The update is scoped to
// consultationID via medications' consultation_id, so a doseID that exists
// but belongs to a different consultation is correctly treated as not found
// — matching ErrDoseNotFound's own contract. Returns ErrDoseNotFound if no
// matching dose exists.
func (r *Repository) UpdateDoseStatus(ctx context.Context, consultationID, id uuid.UUID, taken bool) (*Dose, error) {
	dose := &Dose{ID: id, Taken: taken}
	err := r.pool.QueryRow(ctx, `
		UPDATE doses SET taken = $1
		WHERE id = $2
		  AND medication_id IN (SELECT id FROM medications WHERE consultation_id = $3)
		RETURNING medication_id, scheduled_at, created_at
	`, taken, id, consultationID).Scan(&dose.MedicationID, &dose.ScheduledAt, &dose.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDoseNotFound
		}
		return nil, fmt.Errorf("updating dose: %w", err)
	}
	return dose, nil
}
