package consultation

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// ListWithoutPhoto reads many consultations at once for the history's PDF (specs/050): the same as GetByIDWithoutPhoto for each id,
// in five queries in all (consultations, symptoms, medications, doses, extensions) instead of about nine per consultation. The answer
// keeps the order of `ids`; an id that doesn't exist is left out.
func (r *Repository) ListWithoutPhoto(ctx context.Context, ids []uuid.UUID) ([]*Consultation, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	byID := make(map[uuid.UUID]*Consultation, len(ids))

	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.child_id, c.doctor_name, c.consult_date, c.notes, c.created_at, c.record_only, c.edited_at, e.first_name
		FROM consultations c LEFT JOIN accounts e ON e.id = c.edited_by_account_id
		WHERE c.id = ANY($1)
	`, ids)
	if err != nil {
		return nil, fmt.Errorf("querying consultations: %w", err)
	}
	for rows.Next() {
		c := &Consultation{Photo: []byte{}, Symptoms: make([]Symptom, 0)}
		if err := rows.Scan(&c.ID, &c.ChildID, &c.DoctorName, &c.ConsultDate, &c.Notes, &c.CreatedAt, &c.RecordOnly, &c.EditedAt, &c.EditedBy); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scanning consultation: %w", err)
		}
		byID[c.ID] = c
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating consultations: %w", err)
	}

	if err := r.addSymptomsTo(ctx, ids, byID); err != nil {
		return nil, err
	}
	meds, err := r.addMedicationsTo(ctx, ids, byID)
	if err != nil {
		return nil, err
	}
	if err := r.addDosesTo(ctx, meds); err != nil {
		return nil, err
	}

	out := make([]*Consultation, 0, len(byID))
	for _, id := range ids {
		if c, ok := byID[id]; ok {
			out = append(out, c)
		}
	}
	return out, nil
}

func (r *Repository) addSymptomsTo(ctx context.Context, ids []uuid.UUID, byID map[uuid.UUID]*Consultation) error {
	rows, err := r.pool.Query(ctx, `
		SELECT cs.consultation_id, s.code, s.name, s.category
		FROM consultation_symptoms cs JOIN symptoms s ON s.code = cs.symptom_code
		WHERE cs.consultation_id = ANY($1) ORDER BY cs.consultation_id, s.sort_order
	`, ids)
	if err != nil {
		return fmt.Errorf("querying consultation symptoms: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var sym Symptom
		if err := rows.Scan(&id, &sym.Code, &sym.Name, &sym.Category); err != nil {
			return fmt.Errorf("scanning consultation symptom: %w", err)
		}
		if c, ok := byID[id]; ok {
			c.Symptoms = append(c.Symptoms, sym)
		}
	}
	return rows.Err()
}

// addMedicationsTo appends each consultation's medications in their stable order and returns them by id, to hang their doses on.
func (r *Repository) addMedicationsTo(ctx context.Context, ids []uuid.UUID, byID map[uuid.UUID]*Consultation) (map[uuid.UUID]*Medication, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, consultation_id, name, frequency_hours, duration_days, to_char(start_time, 'HH24:MI'), created_at, ended_at
		FROM medications WHERE consultation_id = ANY($1) ORDER BY consultation_id, created_at ASC, id ASC
	`, ids)
	if err != nil {
		return nil, fmt.Errorf("querying medications: %w", err)
	}
	for rows.Next() {
		var med Medication
		if err := rows.Scan(&med.ID, &med.ConsultationID, &med.Name, &med.FrequencyHours, &med.DurationDays, &med.StartTime, &med.CreatedAt, &med.EndedAt); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scanning medication: %w", err)
		}
		if c, ok := byID[med.ConsultationID]; ok {
			c.Medications = append(c.Medications, med)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating medications: %w", err)
	}
	// Pointers only once every append is done: the slices no longer move.
	meds := map[uuid.UUID]*Medication{}
	for _, c := range byID {
		for i := range c.Medications {
			meds[c.Medications[i].ID] = &c.Medications[i]
		}
	}
	return meds, nil
}

// addDosesTo reads every medication's doses (with their status on the repository's clock, as getByID does) and extensions.
func (r *Repository) addDosesTo(ctx context.Context, meds map[uuid.UUID]*Medication) error {
	if len(meds) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, 0, len(meds))
	for id := range meds {
		ids = append(ids, id)
	}
	rows, err := r.pool.Query(ctx, `
		SELECT d.medication_id, d.id, d.scheduled_at, d.taken, d.created_at, d.covered_by_extension_id IS NOT NULL,
		       COALESCE(d.taken_by_account_id, d.taken_by_child_device_id), COALESCE(a.first_name, tdc.first_name), d.taken_at
		FROM doses d
		LEFT JOIN accounts a ON a.id = d.taken_by_account_id
		LEFT JOIN child_device_links tdl ON tdl.id = d.taken_by_child_device_id
		LEFT JOIN children tdc ON tdc.id = tdl.child_id
		WHERE d.medication_id = ANY($1) ORDER BY d.medication_id, d.scheduled_at ASC
	`, ids)
	if err != nil {
		return fmt.Errorf("querying doses: %w", err)
	}
	now := r.now()
	for rows.Next() {
		var dose Dose
		var by markAuthor
		if err := rows.Scan(&dose.MedicationID, &dose.ID, &dose.ScheduledAt, &dose.Taken, &dose.CreatedAt, &dose.Covered, &by.accountID, &by.name, &by.at); err != nil {
			rows.Close()
			return fmt.Errorf("scanning dose: %w", err)
		}
		med := meds[dose.MedicationID]
		dose.TakenBy = by.takenBy()
		dose.Status = StatusAt(dose.ScheduledAt, dose.Taken, med.FrequencyHours, med.EndedAt, now)
		med.Doses = append(med.Doses, dose)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterating doses: %w", err)
	}

	ext, err := r.pool.Query(ctx, `
		SELECT medication_id, id, created_at, proposed_doses, added_doses
		FROM medication_extensions WHERE medication_id = ANY($1) ORDER BY medication_id, created_at ASC, id ASC
	`, ids)
	if err != nil {
		return fmt.Errorf("querying extensions: %w", err)
	}
	defer ext.Close()
	for ext.Next() {
		var medID uuid.UUID
		var e Extension
		if err := ext.Scan(&medID, &e.ID, &e.CreatedAt, &e.ProposedDoses, &e.AddedDoses); err != nil {
			return fmt.Errorf("scanning extension: %w", err)
		}
		meds[medID].Extensions = append(meds[medID].Extensions, e)
	}
	if err := ext.Err(); err != nil {
		return fmt.Errorf("iterating extensions: %w", err)
	}
	for _, med := range meds {
		med.ExtendableDoses = len(uncoveredUnregistered(med.Doses, med.EndedAt))
	}
	return nil
}
