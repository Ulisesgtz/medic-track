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
	// now is the clock each dose's Status is read with (specs/013): the server's, so every device sees the same.
	now func() time.Time
}

// NewRepository creates a consultation Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, now: time.Now}
}

// querier is satisfied by both *pgxpool.Pool and pgx.Tx, so helpers like
// childExists work whether called inside a transaction or not.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// rowsQuerier is satisfied by both *pgxpool.Pool and pgx.Tx, for helpers that
// read several rows inside a transaction or outside it.
type rowsQuerier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// symptomsOf returns the symptoms marked on a consultation, in catalog order
// and including retired ones: a retired symptom is no longer offered, but the
// consultations that have it keep showing it (specs/012 FR-008).
func symptomsOf(ctx context.Context, q rowsQuerier, consultationID uuid.UUID) ([]Symptom, error) {
	rows, err := q.Query(ctx, `
		SELECT s.code, s.name, s.category
		FROM consultation_symptoms cs JOIN symptoms s ON s.code = cs.symptom_code
		WHERE cs.consultation_id = $1 ORDER BY s.sort_order
	`, consultationID)
	if err != nil {
		return nil, fmt.Errorf("querying consultation symptoms: %w", err)
	}
	defer rows.Close()

	symptoms := make([]Symptom, 0)
	for rows.Next() {
		var sym Symptom
		if err := rows.Scan(&sym.Code, &sym.Name, &sym.Category); err != nil {
			return nil, fmt.Errorf("scanning consultation symptom: %w", err)
		}
		symptoms = append(symptoms, sym)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating consultation symptoms: %w", err)
	}
	return symptoms, nil
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
		SELECT c.id, c.child_id, c.doctor_name, c.consult_date, c.notes, c.created_at, c.record_only,
		       (SELECT count(*) FROM medications m WHERE m.consultation_id = c.id),
		       COALESCE((SELECT array_agg(s.name ORDER BY s.sort_order)
		                 FROM consultation_symptoms cs JOIN symptoms s ON s.code = cs.symptom_code
		                 WHERE cs.consultation_id = c.id), '{}')
		FROM consultations c WHERE c.child_id = $1 ORDER BY c.consult_date DESC
	`, childID)
	if err != nil {
		return nil, fmt.Errorf("querying consultations: %w", err)
	}
	defer rows.Close()

	return scanSummaries(rows)
}

// scanSummaries reads the rows of the consultations list (the columns GetByChild and Search select, in that order) into
// summaries; an empty result is an empty slice, never nil.
func scanSummaries(rows pgx.Rows) ([]Consultation, error) {
	consultations := make([]Consultation, 0)
	for rows.Next() {
		var c Consultation
		if err := rows.Scan(&c.ID, &c.ChildID, &c.DoctorName, &c.ConsultDate, &c.Notes, &c.CreatedAt, &c.RecordOnly, &c.MedicationCount, &c.SymptomNames); err != nil {
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
	now := r.now() // one reading for every dose's status in this response
	if err := checkPlan(ctx, tx, childID, c, now); err != nil {
		return err
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO consultations (child_id, doctor_name, consult_date, photo, notes, record_only)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at
	`, c.ChildID, c.DoctorName, c.ConsultDate, c.Photo, c.Notes, c.RecordOnly,
	).Scan(&c.ID, &c.CreatedAt)
	if err != nil {
		return fmt.Errorf("inserting consultation: %w", err)
	}

	c.Symptoms = []Symptom{}
	if codes := uniqueCodes(c.SymptomCodes); len(codes) > 0 {
		// The child's account comes from the database, never from the request, and only active catalog
		// symptoms are accepted: fewer rows than (distinct) codes means one is unknown or retired, and the
		// whole consultation is rolled back (specs/012 research R4).
		tag, err := tx.Exec(ctx, `
			INSERT INTO consultation_symptoms (consultation_id, child_id, account_id, symptom_code)
			SELECT $1, ch.id, ch.account_id, s.code
			FROM children ch JOIN symptoms s ON s.code = ANY($3) AND s.active
			WHERE ch.id = $2
		`, c.ID, c.ChildID, codes)
		if err != nil {
			return fmt.Errorf("inserting consultation symptoms: %w", err)
		}
		if tag.RowsAffected() != int64(len(codes)) {
			return ErrSymptomNotAvailable
		}
		if c.Symptoms, err = symptomsOf(ctx, tx, c.ID); err != nil {
			return err
		}
	}

	for i := range c.Medications {
		med := &c.Medications[i]
		med.ConsultationID = c.ID
		err = tx.QueryRow(ctx, `
			INSERT INTO medications (consultation_id, name, frequency_hours, duration_days, start_time, created_at)
			VALUES ($1, $2, $3, $4, $5, clock_timestamp())
			RETURNING id, created_at
		`, med.ConsultationID, med.Name, med.FrequencyHours, med.DurationDays, med.StartTime,
		).Scan(&med.ID, &med.CreatedAt)
		if err != nil {
			return fmt.Errorf("inserting medication: %w", err)
		}

		loc := c.ScheduleLocation
		if loc == nil {
			loc = c.ConsultDate.Location()
		}
		for _, scheduledAt := range generateDoseSchedule(c.ConsultDate, loc, med) {
			dose := Dose{MedicationID: med.ID, ScheduledAt: scheduledAt, Status: StatusAt(scheduledAt, false, med.FrequencyHours, nil, now)}
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
		// A consultation of a past date already has unregistered doses: the same answer the detail gives (specs/020).
		med.ExtendableDoses = len(uncoveredUnregistered(med.Doses, nil))
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing transaction: %w", err)
	}
	return nil
}

// planPaid is the value of accounts.plan that lifts the free plan's consultation rules (account.PlanPaid; this package
// reads the column directly, as it does the children's, so it doesn't import account).
const planPaid = "paid"

// accountPlanOf reads the id and the plan of the account that owns the child — the one place that does (the free plan's
// consultation rules and the paid plan's history both ask). `lock` takes the account row `FOR UPDATE` so the requests of
// one account are checked one after the other (inside a transaction). ErrChildNotFound if there is no such child.
func accountPlanOf(ctx context.Context, q querier, childID uuid.UUID, lock bool) (uuid.UUID, string, error) {
	query := `
		SELECT a.id, a.plan::text
		FROM accounts a JOIN children ch ON ch.account_id = a.id
		WHERE ch.id = $1`
	if lock {
		query += ` FOR UPDATE OF a`
	}
	var accountID uuid.UUID
	var plan string
	err := q.QueryRow(ctx, query, childID).Scan(&accountID, &plan)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, "", ErrChildNotFound
	}
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("reading the account's plan: %w", err)
	}
	return accountID, plan, nil
}

// checkPlan applies the free plan's rules to a consultation about to be saved (specs/030-reglas-plan-gratis): a free
// account can't save a consultation only as a record, and can't start another while any of its children still has a
// treatment running (a medication not ended with a dose still ahead — the same "active" as the child's overview).
// It locks the account row first, so two requests of the same account are checked one after the other and both can't
// start a treatment. Paid accounts pass untouched; nothing already saved is ever hidden or changed.
func checkPlan(ctx context.Context, tx pgx.Tx, childID uuid.UUID, c *Consultation, now time.Time) error {
	accountID, plan, err := accountPlanOf(ctx, tx, childID, true)
	if err != nil {
		return err
	}
	if plan == planPaid {
		return nil
	}
	if c.RecordOnly {
		return &PlanLimitError{Reason: PlanLimitRecordOnly}
	}

	var active bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM doses d
			JOIN medications m ON m.id = d.medication_id
			JOIN consultations co ON co.id = m.consultation_id
			JOIN children ch ON ch.id = co.child_id
			WHERE ch.account_id = $1 AND m.ended_at IS NULL AND d.scheduled_at > $2
		)
	`, accountID, now).Scan(&active)
	if err != nil {
		return fmt.Errorf("looking for an active treatment: %w", err)
	}
	if active {
		return &PlanLimitError{Reason: PlanLimitActiveTreatment}
	}
	return nil
}

// generateDoseSchedule computes every expected dose datetime for a
// medication with a StartTime, all at once (research.md): total =
// floor(duration_days*24 / frequency_hours) doses, spaced frequency_hours
// apart starting at consultDate + StartTime read in loc (the parent's time
// zone, so each dose is the real instant they meant). Returns nil if StartTime is
// nil (FR-010).
func generateDoseSchedule(consultDate time.Time, loc *time.Location, med *Medication) []time.Time {
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
		startHour, startMinute, 0, 0, loc,
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
		SELECT child_id, doctor_name, consult_date, photo, notes, created_at, record_only
		FROM consultations WHERE id = $1
	`, id).Scan(&c.ChildID, &c.DoctorName, &c.ConsultDate, &c.Photo, &c.Notes, &c.CreatedAt, &c.RecordOnly)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrConsultationNotFound
		}
		return nil, fmt.Errorf("querying consultation: %w", err)
	}

	if c.Symptoms, err = symptomsOf(ctx, r.pool, id); err != nil {
		return nil, err
	}

	medRows, err := r.pool.Query(ctx, `
		SELECT id, name, frequency_hours, duration_days, to_char(start_time, 'HH24:MI'), created_at, ended_at
		FROM medications WHERE consultation_id = $1 ORDER BY created_at ASC, id ASC
	`, id)
	if err != nil {
		return nil, fmt.Errorf("querying medications: %w", err)
	}
	defer medRows.Close()

	for medRows.Next() {
		med := Medication{ConsultationID: id}
		var startTime *string
		if err := medRows.Scan(&med.ID, &med.Name, &med.FrequencyHours, &med.DurationDays, &startTime, &med.CreatedAt, &med.EndedAt); err != nil {
			return nil, fmt.Errorf("scanning medication: %w", err)
		}
		med.StartTime = startTime
		c.Medications = append(c.Medications, med)
	}
	if err := medRows.Err(); err != nil {
		return nil, fmt.Errorf("iterating medications: %w", err)
	}

	now := r.now()
	for i := range c.Medications {
		med := &c.Medications[i]
		doseRows, err := r.pool.Query(ctx, `
			SELECT d.id, d.scheduled_at, d.taken, d.created_at, d.covered_by_extension_id IS NOT NULL,
			       d.taken_by_account_id, a.first_name, d.taken_at
			FROM doses d LEFT JOIN accounts a ON a.id = d.taken_by_account_id
			WHERE d.medication_id = $1 ORDER BY d.scheduled_at ASC
		`, med.ID)
		if err != nil {
			return nil, fmt.Errorf("querying doses: %w", err)
		}
		for doseRows.Next() {
			dose := Dose{MedicationID: med.ID}
			var by markAuthor
			if err := doseRows.Scan(&dose.ID, &dose.ScheduledAt, &dose.Taken, &dose.CreatedAt, &dose.Covered, &by.accountID, &by.name, &by.at); err != nil {
				doseRows.Close()
				return nil, fmt.Errorf("scanning dose: %w", err)
			}
			dose.TakenBy = by.takenBy()
			dose.Status = StatusAt(dose.ScheduledAt, dose.Taken, med.FrequencyHours, med.EndedAt, now)
			med.Doses = append(med.Doses, dose)
		}
		if err := doseRows.Err(); err != nil {
			doseRows.Close()
			return nil, fmt.Errorf("iterating doses: %w", err)
		}
		doseRows.Close()

		med.ExtendableDoses = len(uncoveredUnregistered(med.Doses, med.EndedAt))
		if med.Extensions, err = extensionsOf(ctx, r.pool, med.ID); err != nil {
			return nil, err
		}
	}

	return c, nil
}

// uncoveredUnregistered are the doses an extension would cover (specs/020): "sin registrar" and not yet taken into
// account by an earlier extension. None once the treatment was ended.
func uncoveredUnregistered(doses []Dose, endedAt *time.Time) []Dose {
	if endedAt != nil {
		return nil
	}
	var out []Dose
	for _, d := range doses {
		if d.Status == DoseStatusUnregistered && !d.Covered {
			out = append(out, d)
		}
	}
	return out
}

// extensionsOf reads a medication's extensions, oldest first.
func extensionsOf(ctx context.Context, q rowsQuerier, medicationID uuid.UUID) ([]Extension, error) {
	rows, err := q.Query(ctx, `
		SELECT id, created_at, proposed_doses, added_doses
		FROM medication_extensions WHERE medication_id = $1 ORDER BY created_at ASC, id ASC
	`, medicationID)
	if err != nil {
		return nil, fmt.Errorf("querying extensions: %w", err)
	}
	defer rows.Close()
	var out []Extension
	for rows.Next() {
		var e Extension
		if err := rows.Scan(&e.ID, &e.CreatedAt, &e.ProposedDoses, &e.AddedDoses); err != nil {
			return nil, fmt.Errorf("scanning extension: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// markAuthor is the nullable columns of who marked a dose, as the queries scan them.
type markAuthor struct {
	accountID *uuid.UUID
	name      *string
	at        *time.Time
}

// takenBy is nil unless the dose has an author (one marked before specs/032 has none).
func (m markAuthor) takenBy() *TakenBy {
	if m.accountID == nil || m.name == nil || m.at == nil {
		return nil
	}
	return &TakenBy{AccountID: *m.accountID, Name: *m.name, At: *m.at}
}

// authorOrNil is what the doses table stores for who marked: no account (a session without one cannot reach here, but a
// test without a session can) means no author.
func authorOrNil(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

// UpdateDoseStatus marks or unmarks a dose of the consultation (specs/004, specs/032). Marking is atomic and the FIRST
// mark wins: it only acts if the dose wasn't marked, so two people marking at once leave one mark with the first one's
// author, and the second sees the dose as it already was. Unmarking needs the person to have marked it or to be able to do
// everything (a dose marked before the feature, with no author, only the latter); otherwise ErrDoseForbidden. It scopes
// the update to consultationID, so a dose of another consultation is ErrDoseNotFound. The returned Status is read after the
// change, so a dose marked after its time reads taken.
func (r *Repository) UpdateDoseStatus(ctx context.Context, consultationID, id uuid.UUID, taken bool, actor Actor) (*Dose, error) {
	author := authorOrNil(actor.AccountID)

	var query string
	var args []any
	if taken {
		query = `
			UPDATE doses SET taken = true, taken_by_account_id = $3, taken_at = now()
			FROM medications m
			WHERE doses.id = $1 AND m.id = doses.medication_id AND m.consultation_id = $2 AND NOT doses.taken
			RETURNING doses.medication_id, doses.scheduled_at, doses.created_at, m.frequency_hours, m.ended_at,
			          doses.taken_by_account_id, (SELECT first_name FROM accounts WHERE id = doses.taken_by_account_id), doses.taken_at`
		args = []any{id, consultationID, author}
	} else {
		query = `
			UPDATE doses SET taken = false, taken_by_account_id = NULL, taken_at = NULL
			FROM medications m
			WHERE doses.id = $1 AND m.id = doses.medication_id AND m.consultation_id = $2
			  AND (NOT doses.taken OR $3::boolean OR doses.taken_by_account_id = $4)
			RETURNING doses.medication_id, doses.scheduled_at, doses.created_at, m.frequency_hours, m.ended_at,
			          doses.taken_by_account_id, (SELECT first_name FROM accounts WHERE id = doses.taken_by_account_id), doses.taken_at`
		args = []any{id, consultationID, actor.Full, author}
	}

	dose := &Dose{ID: id, Taken: taken}
	var frequencyHours int
	var endedAt *time.Time
	var by markAuthor
	err := r.pool.QueryRow(ctx, query, args...).Scan(&dose.MedicationID, &dose.ScheduledAt, &dose.CreatedAt, &frequencyHours, &endedAt, &by.accountID, &by.name, &by.at)
	if errors.Is(err, pgx.ErrNoRows) {
		// Nothing changed: the dose isn't there, it was already marked (marking: the first wins, return it as it is) or the
		// person may not unmark it.
		return r.unchangedDose(ctx, consultationID, id, taken)
	}
	if err != nil {
		return nil, fmt.Errorf("updating dose: %w", err)
	}
	dose.TakenBy = by.takenBy()
	dose.Status = StatusAt(dose.ScheduledAt, dose.Taken, frequencyHours, endedAt, r.now())
	return dose, nil
}

// unchangedDose answers an update that changed nothing: ErrDoseNotFound if there is no such dose of that consultation; for
// a mark that found the dose already marked, the dose as it is; for an unmark it may not do, ErrDoseForbidden.
func (r *Repository) unchangedDose(ctx context.Context, consultationID, id uuid.UUID, wantedTaken bool) (*Dose, error) {
	dose := &Dose{ID: id}
	var frequencyHours int
	var endedAt *time.Time
	var by markAuthor
	err := r.pool.QueryRow(ctx, `
		SELECT d.medication_id, d.scheduled_at, d.created_at, d.taken, m.frequency_hours, m.ended_at,
		       d.taken_by_account_id, a.first_name, d.taken_at
		FROM doses d
		JOIN medications m ON m.id = d.medication_id
		LEFT JOIN accounts a ON a.id = d.taken_by_account_id
		WHERE d.id = $1 AND m.consultation_id = $2
	`, id, consultationID).Scan(&dose.MedicationID, &dose.ScheduledAt, &dose.CreatedAt, &dose.Taken, &frequencyHours, &endedAt, &by.accountID, &by.name, &by.at)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrDoseNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading dose: %w", err)
	}
	if !wantedTaken && dose.Taken {
		return nil, ErrDoseForbidden
	}
	dose.TakenBy = by.takenBy()
	dose.Status = StatusAt(dose.ScheduledAt, dose.Taken, frequencyHours, endedAt, r.now())
	return dose, nil
}

// EndTreatment ends a medication early (specs/016): it records when, once. No dose is touched — the ones that had
// not come yet turn "canceled" when read. Idempotent: ending it again keeps the first moment and gives the same
// result. ErrMedicationNotFound if it doesn't exist or isn't of this consultation; ErrNothingToEnd if it has no doses
// left ahead and wasn't ended.
func (r *Repository) EndTreatment(ctx context.Context, consultationID, medicationID uuid.UUID) (*Medication, error) {
	now := r.now() // one reading: the doses counted ahead are the ones canceled by the moment stored
	var endedAt *time.Time
	var ahead int
	err := r.pool.QueryRow(ctx, `
		SELECT m.ended_at, (SELECT count(*) FROM doses d WHERE d.medication_id = m.id AND d.scheduled_at > $3)
		FROM medications m WHERE m.id = $1 AND m.consultation_id = $2
	`, medicationID, consultationID, now).Scan(&endedAt, &ahead)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMedicationNotFound
		}
		return nil, fmt.Errorf("reading medication: %w", err)
	}
	if endedAt == nil {
		if ahead == 0 {
			return nil, ErrNothingToEnd
		}
		if _, err := r.pool.Exec(ctx, `
			UPDATE medications SET ended_at = $3 WHERE id = $1 AND consultation_id = $2 AND ended_at IS NULL
		`, medicationID, consultationID, now); err != nil {
			return nil, fmt.Errorf("ending treatment: %w", err)
		}
	}

	c, err := r.GetByID(ctx, consultationID)
	if err != nil {
		return nil, err
	}
	for i := range c.Medications {
		if c.Medications[i].ID == medicationID {
			return &c.Medications[i], nil
		}
	}
	return nil, ErrMedicationNotFound
}

// ExtendTreatment adds `doses` doses to the end of a medication, only because the parent decided so (specs/020): in
// one transaction with the medication locked, it records the decision (account that owns the consultation, what was
// proposed, what was confirmed), marks every unregistered dose as covered and appends the new doses after the last one,
// one frequency apart. Nothing that exists changes. ErrMedicationNotFound if it isn't of this consultation;
// ErrNothingToExtend if it was ended or has no unregistered dose left to cover — which is also what a second attempt
// (another tap, another device) gets, so the same doses are never covered twice.
func (r *Repository) ExtendTreatment(ctx context.Context, consultationID, medicationID uuid.UUID, doses int) (*Medication, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning extension: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var frequencyHours int
	var endedAt *time.Time
	if err := tx.QueryRow(ctx, `
		SELECT frequency_hours, ended_at FROM medications WHERE id = $1 AND consultation_id = $2 FOR UPDATE
	`, medicationID, consultationID).Scan(&frequencyHours, &endedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMedicationNotFound
		}
		return nil, fmt.Errorf("locking medication: %w", err)
	}
	if endedAt != nil {
		return nil, ErrNothingToExtend
	}

	now := r.now() // one reading for the whole decision
	rows, err := tx.Query(ctx, `
		SELECT id, scheduled_at, taken, covered_by_extension_id IS NOT NULL FROM doses WHERE medication_id = $1
	`, medicationID)
	if err != nil {
		return nil, fmt.Errorf("reading doses: %w", err)
	}
	var last time.Time
	var covering []string
	for rows.Next() {
		var id uuid.UUID
		var scheduledAt time.Time
		var taken, covered bool
		if err := rows.Scan(&id, &scheduledAt, &taken, &covered); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scanning dose: %w", err)
		}
		if scheduledAt.After(last) {
			last = scheduledAt
		}
		if !covered && StatusAt(scheduledAt, taken, frequencyHours, nil, now) == DoseStatusUnregistered {
			covering = append(covering, id.String())
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating doses: %w", err)
	}
	if len(covering) == 0 {
		return nil, ErrNothingToExtend
	}

	var extensionID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO medication_extensions (medication_id, account_id, proposed_doses, added_doses)
		SELECT $1, ch.account_id, $2, $3
		FROM consultations co JOIN children ch ON ch.id = co.child_id WHERE co.id = $4
		RETURNING id
	`, medicationID, len(covering), doses, consultationID).Scan(&extensionID); err != nil {
		return nil, fmt.Errorf("recording extension: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE doses SET covered_by_extension_id = $1 WHERE id = ANY($2::uuid[])
	`, extensionID, covering); err != nil {
		return nil, fmt.Errorf("covering doses: %w", err)
	}
	step := time.Duration(frequencyHours) * time.Hour
	for k := 1; k <= doses; k++ {
		if _, err := tx.Exec(ctx, `
			INSERT INTO doses (medication_id, scheduled_at, added_by_extension_id) VALUES ($1, $2, $3)
		`, medicationID, last.Add(time.Duration(k)*step), extensionID); err != nil {
			return nil, fmt.Errorf("adding dose: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing extension: %w", err)
	}

	c, err := r.GetByID(ctx, consultationID)
	if err != nil {
		return nil, err
	}
	for i := range c.Medications {
		if c.Medications[i].ID == medicationID {
			return &c.Medications[i], nil
		}
	}
	return nil, ErrMedicationNotFound
}

// GetOverview returns the doses of all the child's consultations scheduled in
// [from, to) and the treatment still running at `now` (the medication whose
// last dose is furthest ahead, plus how many others also have doses ahead).
// Returns ErrChildNotFound if no child exists for childID.
func (r *Repository) GetOverview(ctx context.Context, childID uuid.UUID, from, to, now time.Time) (*ChildOverview, error) {
	exists, err := childExists(ctx, r.pool, childID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrChildNotFound
	}

	doseRows, err := r.pool.Query(ctx, `
		SELECT d.id, m.consultation_id, m.name, d.scheduled_at, d.taken, m.frequency_hours,
		       d.taken_by_account_id, a.first_name, d.taken_at
		FROM doses d
		JOIN medications m ON m.id = d.medication_id
		JOIN consultations c ON c.id = m.consultation_id
		LEFT JOIN accounts a ON a.id = d.taken_by_account_id
		WHERE c.child_id = $1 AND d.scheduled_at >= $2 AND d.scheduled_at < $3
		  -- A dose canceled by ending the treatment early is not one of today's (specs/016).
		  AND NOT (m.ended_at IS NOT NULL AND d.scheduled_at > m.ended_at AND NOT d.taken)
		ORDER BY d.scheduled_at ASC, m.name ASC
	`, childID, from, to)
	if err != nil {
		return nil, fmt.Errorf("querying doses in range: %w", err)
	}
	defer doseRows.Close()

	overview := &ChildOverview{Doses: make([]DoseOverview, 0)}
	for doseRows.Next() {
		var d DoseOverview
		var frequencyHours int
		var by markAuthor
		if err := doseRows.Scan(&d.ID, &d.ConsultationID, &d.MedicationName, &d.ScheduledAt, &d.Taken, &frequencyHours, &by.accountID, &by.name, &by.at); err != nil {
			return nil, fmt.Errorf("scanning dose: %w", err)
		}
		d.Kind = DoseKindMedication
		d.TakenBy = by.takenBy()
		d.Status = StatusAt(d.ScheduledAt, d.Taken, frequencyHours, nil, now) // canceled ones are filtered out above
		overview.Doses = append(overview.Doses, d)
	}
	if err := doseRows.Err(); err != nil {
		return nil, fmt.Errorf("iterating doses: %w", err)
	}

	// The doses of the child's active supplement routines count in "Tomas de hoy" too (specs/033), not as a treatment.
	if err := r.addSupplementDoses(ctx, overview, childID, from, to, now); err != nil {
		return nil, err
	}

	treatmentRows, err := r.pool.Query(ctx, `
		SELECT m.name, max(d.scheduled_at) AS ends_at
		FROM doses d
		JOIN medications m ON m.id = d.medication_id
		JOIN consultations c ON c.id = m.consultation_id
		WHERE c.child_id = $1 AND m.ended_at IS NULL
		GROUP BY m.id, m.name
		HAVING max(d.scheduled_at) > $2
		ORDER BY ends_at DESC, m.name ASC
	`, childID, now)
	if err != nil {
		return nil, fmt.Errorf("querying active treatments: %w", err)
	}
	defer treatmentRows.Close()

	for treatmentRows.Next() {
		var name string
		var endsAt time.Time
		if err := treatmentRows.Scan(&name, &endsAt); err != nil {
			return nil, fmt.Errorf("scanning active treatment: %w", err)
		}
		if overview.ActiveTreatment == nil {
			overview.ActiveTreatment = &ActiveTreatment{MedicationName: name, EndsAt: endsAt}
		} else {
			overview.ActiveTreatment.OtherCount++
		}
	}
	if err := treatmentRows.Err(); err != nil {
		return nil, fmt.Errorf("iterating active treatments: %w", err)
	}

	return overview, nil
}
