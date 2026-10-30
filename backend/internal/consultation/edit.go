package consultation

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Editing a saved consultation (specs/051-editar-consultas), the fourth exception to consultations being immutable (spec 004
// FR-014). Everything can be corrected, but what was already registered never moves: a marked dose and a dose whose time
// passed stay exactly as they were; only the doses still ahead and unmarked follow a new schedule.

// UpdateMedicationInput is one medication of an edit: ID set = an existing medication of the consultation, nil = a new one.
type UpdateMedicationInput struct {
	ID             *uuid.UUID
	Name           string
	FrequencyHours int
	DurationDays   int
	StartTime      *string
}

// UpdateConsultationInput is the whole consultation as the parent left it in the form. A medication of the consultation that
// isn't in Medications is removed. The kind (record only or not) never changes, so it isn't here.
type UpdateConsultationInput struct {
	// ExpectedVersion is the consultation's last edition (or creation) the form was opened with (research R6).
	ExpectedVersion time.Time
	DoctorName      string
	ConsultDate     time.Time
	// Photo replaces the prescription photo; empty leaves it as it is.
	Photo            []byte
	Notes            string
	SymptomCodes     []string
	Medications      []UpdateMedicationInput
	// UTCOffsetMinutes is the editing device's offset: only for a consultation that has no zone of its own yet.
	UTCOffsetMinutes int
}

// UpdateConsultation checks the edit with the same rules as creating one, saves it as editor and returns the consultation as
// it is now. The rules that depend on what is saved (the start time of a consultation with a schedule, an ended treatment,
// marks, the plan, the version) are the repository's.
func (s *Service) UpdateConsultation(ctx context.Context, id uuid.UUID, in UpdateConsultationInput, editor uuid.UUID) (*Consultation, error) {
	if editor == uuid.Nil {
		return nil, errors.New("editing a consultation needs the account that edits it")
	}
	if errs := validateUpdateInput(in); errs.HasErrors() {
		return nil, errs
	}
	if err := s.repo.Update(ctx, id, in, editor); err != nil {
		return nil, err
	}
	return s.repo.GetByID(ctx, id)
}

// validateUpdateInput is validateCreateConsultationInput (the start time is checked later, once the repository knows whether
// the consultation has a schedule) plus the version and the medication ids, each at most once.
func validateUpdateInput(in UpdateConsultationInput) ValidationErrors {
	create := CreateConsultationInput{
		DoctorName: in.DoctorName, ConsultDate: in.ConsultDate, Photo: in.Photo, Notes: in.Notes,
		SymptomCodes: in.SymptomCodes, RecordOnly: true, UTCOffsetMinutes: in.UTCOffsetMinutes,
	}
	for _, m := range in.Medications {
		create.Medications = append(create.Medications, CreateMedicationInput{Name: m.Name, FrequencyHours: m.FrequencyHours, DurationDays: m.DurationDays})
	}
	errs := validateCreateConsultationInput(create)
	if in.ExpectedVersion.IsZero() {
		errs = append(errs, ValidationError{Field: "expectedVersion", Message: "expected version is required"})
	}
	seen := map[uuid.UUID]bool{}
	for i, m := range in.Medications {
		if m.ID == nil {
			continue
		}
		if seen[*m.ID] {
			errs = append(errs, ValidationError{Field: fieldIndex("medications", i, "id"), Message: "medication_not_found"})
		}
		seen[*m.ID] = true
	}
	return errs
}

// savedMedication is a medication of the consultation as it is before the edit.
type savedMedication struct {
	freq, dur int
	start     *string
	ended     *time.Time
}

// Update saves an edit in one transaction (research R2). Locks, in this order: the owner account (the plan and the photo
// cap), the consultation, its medications — the same order creating, ending and extending take, so they go one after the
// other. Errors: ErrConsultationNotFound, ErrEditConflict (someone saved an edit after the form was opened), ValidationErrors
// (medication_not_found, treatment_ended, a missing start time), ErrMedicationHasMarks, ErrSymptomNotAvailable,
// ErrPhotoLimit and a *PlanLimitError. Nothing is saved on any of them.
func (r *Repository) Update(ctx context.Context, id uuid.UUID, in UpdateConsultationInput, editor uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback is a no-op after a successful commit

	var childID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT child_id FROM consultations WHERE id = $1`, id).Scan(&childID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrConsultationNotFound
	}
	if err != nil {
		return fmt.Errorf("reading the consultation's child: %w", err)
	}
	accountID, plan, err := accountPlanOf(ctx, tx, childID, true)
	if err != nil {
		return err
	}

	var savedDate, version time.Time
	var recordOnly, hasPhoto bool
	var savedOffset *int
	err = tx.QueryRow(ctx, `
		SELECT consult_date, coalesce(edited_at, created_at), record_only, octet_length(photo) > 0, utc_offset_minutes
		FROM consultations WHERE id = $1 FOR UPDATE
	`, id).Scan(&savedDate, &version, &recordOnly, &hasPhoto, &savedOffset)
	if err != nil {
		return fmt.Errorf("locking the consultation: %w", err)
	}
	if !version.Equal(in.ExpectedVersion) {
		return ErrEditConflict
	}

	saved, err := lockMedications(ctx, tx, id)
	if err != nil {
		return err
	}
	if errs := checkMedications(in, saved, recordOnly, savedDate); errs.HasErrors() {
		return errs
	}

	now := r.now()
	// The start times are read in the consultation's own zone, not in the editing device's: from another zone a new dose
	// would land hours away from a kept one (bugfix/054). A consultation without one (record only, or edited before it was
	// saved) takes the editor's, and keeps it from now on (saveConsultation).
	offset := in.UTCOffsetMinutes
	if savedOffset != nil {
		offset = *savedOffset
	}
	loc := time.FixedZone("client", offset*60)
	kept := map[uuid.UUID]bool{}
	addedAhead := false
	for _, m := range in.Medications {
		if m.ID == nil {
			continue
		}
		kept[*m.ID] = true
		med := Medication{ID: *m.ID, Name: m.Name, FrequencyHours: m.FrequencyHours, DurationDays: m.DurationDays, StartTime: startOf(m, recordOnly)}
		if _, err := tx.Exec(ctx, `
			UPDATE medications SET name = $2, frequency_hours = $3, duration_days = $4, start_time = $5::time WHERE id = $1
		`, med.ID, med.Name, med.FrequencyHours, med.DurationDays, med.StartTime); err != nil {
			return fmt.Errorf("updating a medication: %w", err)
		}
		before := saved[med.ID]
		if recordOnly || before.ended != nil || !scheduleChanged(before, med, savedDate, in.ConsultDate) {
			continue
		}
		added, err := reschedule(ctx, tx, med, in.ConsultDate, loc, now)
		if err != nil {
			return err
		}
		addedAhead = addedAhead || added
	}

	for medID := range saved {
		if !kept[medID] {
			if err := removeMedication(ctx, tx, medID); err != nil {
				return err
			}
		}
	}

	for _, m := range in.Medications {
		if m.ID != nil {
			continue
		}
		med := Medication{Name: m.Name, FrequencyHours: m.FrequencyHours, DurationDays: m.DurationDays, StartTime: startOf(m, recordOnly)}
		err := tx.QueryRow(ctx, `
			INSERT INTO medications (consultation_id, name, frequency_hours, duration_days, start_time, created_at)
			VALUES ($1, $2, $3, $4, $5, clock_timestamp())
			RETURNING id
		`, id, med.Name, med.FrequencyHours, med.DurationDays, med.StartTime).Scan(&med.ID)
		if err != nil {
			return fmt.Errorf("inserting a medication: %w", err)
		}
		added, err := insertAhead(ctx, tx, med.ID, generateDoseSchedule(in.ConsultDate, loc, &med), nil, now)
		if err != nil {
			return err
		}
		addedAhead = addedAhead || added
	}

	if len(in.Photo) > 0 && !hasPhoto {
		if err := checkPhotoCap(ctx, tx, childID, &Consultation{Photo: in.Photo}); err != nil {
			return err
		}
	}
	if err := saveConsultation(ctx, tx, id, in, offset, editor); err != nil {
		return err
	}
	if err := replaceSymptoms(ctx, tx, id, childID, in.SymptomCodes); err != nil {
		return err
	}
	if plan != planPaid && addedAhead {
		if err := checkNoOtherActive(ctx, tx, accountID, id, now); err != nil {
			return err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing transaction: %w", err)
	}
	return nil
}

// lockMedications reads the consultation's medications FOR UPDATE (the lock ending and extending take).
func lockMedications(ctx context.Context, tx pgx.Tx, consultationID uuid.UUID) (map[uuid.UUID]savedMedication, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, frequency_hours, duration_days, to_char(start_time, 'HH24:MI'), ended_at
		FROM medications WHERE consultation_id = $1 ORDER BY created_at, id FOR UPDATE
	`, consultationID)
	if err != nil {
		return nil, fmt.Errorf("locking the medications: %w", err)
	}
	defer rows.Close()
	saved := map[uuid.UUID]savedMedication{}
	for rows.Next() {
		var medID uuid.UUID
		var m savedMedication
		if err := rows.Scan(&medID, &m.freq, &m.dur, &m.start, &m.ended); err != nil {
			return nil, fmt.Errorf("scanning a medication: %w", err)
		}
		saved[medID] = m
	}
	return saved, rows.Err()
}

// checkMedications applies the rules that need what is saved: every id is one of this consultation's medications, a
// consultation with a schedule has a valid start time for each medication, and an ended treatment keeps its schedule.
func checkMedications(in UpdateConsultationInput, saved map[uuid.UUID]savedMedication, recordOnly bool, savedDate time.Time) ValidationErrors {
	var errs ValidationErrors
	for i, m := range in.Medications {
		if !recordOnly {
			switch {
			case m.StartTime == nil || *m.StartTime == "":
				errs = append(errs, ValidationError{Field: fieldIndex("medications", i, "startTime"), Message: "start time is required"})
			case !startTimeFormat.MatchString(*m.StartTime):
				errs = append(errs, ValidationError{Field: fieldIndex("medications", i, "startTime"), Message: "must be a 24-hour HH:MM time"})
			}
		}
		if m.ID == nil {
			continue
		}
		before, ok := saved[*m.ID]
		if !ok {
			errs = append(errs, ValidationError{Field: fieldIndex("medications", i, "id"), Message: "medication_not_found"})
			continue
		}
		if before.ended == nil || recordOnly {
			continue
		}
		// An ended treatment's schedule doesn't change (FR-007); its name does. A new date of the consultation leaves its
		// doses alone (they are what happened).
		switch {
		case m.FrequencyHours != before.freq:
			errs = append(errs, ValidationError{Field: fieldIndex("medications", i, "frequencyHours"), Message: "treatment_ended"})
		case m.DurationDays != before.dur:
			errs = append(errs, ValidationError{Field: fieldIndex("medications", i, "durationDays"), Message: "treatment_ended"})
		case !sameStart(before.start, m.StartTime):
			errs = append(errs, ValidationError{Field: fieldIndex("medications", i, "startTime"), Message: "treatment_ended"})
		}
	}
	return errs
}

// startOf is the start time that is stored: none in a record-only consultation (specs/024).
func startOf(m UpdateMedicationInput, recordOnly bool) *string {
	if recordOnly {
		return nil
	}
	return m.StartTime
}

func sameStart(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// scheduleChanged says whether the doses of a medication follow a different schedule now: its frequency, duration or first
// dose, or the consultation's date (the first dose is read on that day).
func scheduleChanged(before savedMedication, after Medication, savedDate, newDate time.Time) bool {
	return before.freq != after.FrequencyHours || before.dur != after.DurationDays || !sameStart(before.start, after.StartTime) ||
		savedDate.Format("2006-01-02") != newDate.Format("2006-01-02")
}

// reschedule drops the medication's doses still ahead and unmarked and adds the new schedule's doses still ahead that don't
// fall at the time of a dose that stayed (research R3). A dose marked meanwhile by someone else is never dropped: the delete
// only takes unmarked rows, re-checked under their lock. Reports whether a dose ahead was added.
func reschedule(ctx context.Context, tx pgx.Tx, med Medication, consultDate time.Time, loc *time.Location, now time.Time) (bool, error) {
	ahead := `SELECT id FROM doses WHERE medication_id = $1 AND NOT taken AND scheduled_at > $2`
	for _, table := range []string{"dose_reminders", "child_dose_reminders"} {
		if _, err := tx.Exec(ctx, `DELETE FROM `+table+` WHERE dose_id IN (`+ahead+`)`, med.ID, now); err != nil {
			return false, fmt.Errorf("dropping the reminders of the doses ahead: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM doses WHERE medication_id = $1 AND NOT taken AND scheduled_at > $2`, med.ID, now); err != nil {
		return false, fmt.Errorf("dropping the doses ahead: %w", err)
	}
	rows, err := tx.Query(ctx, `SELECT scheduled_at FROM doses WHERE medication_id = $1`, med.ID)
	if err != nil {
		return false, fmt.Errorf("reading the doses that stay: %w", err)
	}
	stayed := map[int64]bool{}
	for rows.Next() {
		var at time.Time
		if err := rows.Scan(&at); err != nil {
			rows.Close()
			return false, fmt.Errorf("scanning a dose that stays: %w", err)
		}
		stayed[at.UnixMicro()] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return false, fmt.Errorf("iterating the doses that stay: %w", err)
	}
	return insertAhead(ctx, tx, med.ID, generateDoseSchedule(consultDate, loc, &med), stayed, now)
}

// insertAhead inserts the schedule's doses after now that aren't already there; it reports whether it inserted any.
func insertAhead(ctx context.Context, tx pgx.Tx, medicationID uuid.UUID, schedule []time.Time, stayed map[int64]bool, now time.Time) (bool, error) {
	var at []time.Time
	for _, t := range schedule {
		if t.After(now) && !stayed[t.UnixMicro()] {
			at = append(at, t)
		}
	}
	if len(at) == 0 {
		return false, nil
	}
	if _, err := tx.Exec(ctx, `INSERT INTO doses (medication_id, scheduled_at) SELECT $1, unnest($2::timestamptz[])`, medicationID, at); err != nil {
		return false, fmt.Errorf("inserting the new doses: %w", err)
	}
	return true, nil
}

// removeMedication takes a medication out of the consultation, with everything that refers to it — only if none of its doses
// is marked (ErrMedicationHasMarks). The unmarked doses are deleted first and the marked ones counted after, so a mark made
// meanwhile is seen.
func removeMedication(ctx context.Context, tx pgx.Tx, medID uuid.UUID) error {
	unmarked := `SELECT id FROM doses WHERE medication_id = $1 AND NOT taken`
	for _, table := range []string{"dose_reminders", "child_dose_reminders"} {
		if _, err := tx.Exec(ctx, `DELETE FROM `+table+` WHERE dose_id IN (`+unmarked+`)`, medID); err != nil {
			return fmt.Errorf("dropping the reminders of a removed medication: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM doses WHERE medication_id = $1 AND NOT taken`, medID); err != nil {
		return fmt.Errorf("dropping the doses of a removed medication: %w", err)
	}
	var marked bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM doses WHERE medication_id = $1)`, medID).Scan(&marked); err != nil {
		return fmt.Errorf("looking for marks: %w", err)
	}
	if marked {
		return ErrMedicationHasMarks
	}
	if _, err := tx.Exec(ctx, `DELETE FROM medication_extensions WHERE medication_id = $1`, medID); err != nil {
		return fmt.Errorf("dropping the extensions of a removed medication: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM medications WHERE id = $1`, medID); err != nil {
		return fmt.Errorf("removing a medication: %w", err)
	}
	return nil
}

// saveConsultation writes the consultation's own fields and who edited it, now.
func saveConsultation(ctx context.Context, tx pgx.Tx, id uuid.UUID, in UpdateConsultationInput, offset int, editor uuid.UUID) error {
	query := `UPDATE consultations SET doctor_name = $2, consult_date = $3, notes = $4, edited_at = clock_timestamp(),
		edited_by_account_id = $5, utc_offset_minutes = coalesce(utc_offset_minutes, $6)`
	args := []any{id, in.DoctorName, in.ConsultDate, in.Notes, editor, offset}
	if len(in.Photo) > 0 {
		query += `, photo = $7`
		args = append(args, in.Photo)
	}
	if _, err := tx.Exec(ctx, query+` WHERE id = $1`, args...); err != nil {
		return fmt.Errorf("updating the consultation: %w", err)
	}
	return nil
}

// replaceSymptoms sets the consultation's symptoms: active catalog ones, plus retired ones it already had (they stay if the
// parent didn't take them off). Fewer rows than codes = one is unknown, or retired and new: ErrSymptomNotAvailable.
func replaceSymptoms(ctx context.Context, tx pgx.Tx, id, childID uuid.UUID, codes []string) error {
	var had []string
	if err := tx.QueryRow(ctx, `SELECT coalesce(array_agg(symptom_code), '{}') FROM consultation_symptoms WHERE consultation_id = $1`, id).Scan(&had); err != nil {
		return fmt.Errorf("reading the symptoms it had: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM consultation_symptoms WHERE consultation_id = $1`, id); err != nil {
		return fmt.Errorf("dropping the symptoms: %w", err)
	}
	codes = uniqueCodes(codes)
	if len(codes) == 0 {
		return nil
	}
	tag, err := tx.Exec(ctx, `
		INSERT INTO consultation_symptoms (consultation_id, child_id, account_id, symptom_code)
		SELECT $1, ch.id, ch.account_id, s.code
		FROM children ch JOIN symptoms s ON s.code = ANY($3) AND (s.active OR s.code = ANY($4))
		WHERE ch.id = $2
	`, id, childID, codes, had)
	if err != nil {
		return fmt.Errorf("inserting the symptoms: %w", err)
	}
	if tag.RowsAffected() != int64(len(codes)) {
		return ErrSymptomNotAvailable
	}
	return nil
}

// checkNoOtherActive is the free plan's rule for an edit that added doses ahead (research R5): no other consultation of the
// account may have a treatment running, as when creating one.
func checkNoOtherActive(ctx context.Context, tx pgx.Tx, accountID, consultationID uuid.UUID, now time.Time) error {
	var other bool
	err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM doses d
			JOIN medications m ON m.id = d.medication_id
			JOIN consultations co ON co.id = m.consultation_id
			JOIN children ch ON ch.id = co.child_id
			WHERE ch.account_id = $1 AND co.id <> $2 AND m.ended_at IS NULL AND d.scheduled_at > $3
		)
	`, accountID, consultationID, now).Scan(&other)
	if err != nil {
		return fmt.Errorf("looking for another active treatment: %w", err)
	}
	if other {
		return &PlanLimitError{Reason: PlanLimitActiveTreatment}
	}
	return nil
}
