package appointment

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const planPaid = "paid"

// Repository runs the appointments' SQL.
type Repository struct {
	pool *pgxpool.Pool
	now  func() time.Time
}

// NewRepository creates a Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, now: time.Now}
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

const appointmentSelect = `
	SELECT ap.id, ap.consultation_id, ap.child_id, ap.account_id, co.doctor_name, co.consult_date::text, ap.starts_at,
	       ap.utc_offset_minutes, ap.note, ap.status, COALESCE(sb.first_name, ''), ap.status_at, cb.first_name, owner.plan::text
	FROM consultation_appointments ap
	JOIN consultations co ON co.id = ap.consultation_id
	JOIN accounts cb ON cb.id = ap.created_by_account_id
	JOIN accounts owner ON owner.id = ap.account_id
	LEFT JOIN accounts sb ON sb.id = ap.status_by_account_id`

func scanAppointment(row pgx.Row) (Appointment, error) {
	var a Appointment
	var offset int16
	var status, plan string
	err := row.Scan(&a.ID, &a.ConsultationID, &a.ChildID, &a.AccountID, &a.DoctorName, &a.ConsultDate, &a.StartsAt, &offset,
		&a.Note, &status, &a.StatusBy, &a.StatusAt, &a.CreatedBy, &plan)
	a.UtcOffsetMinutes, a.Status, a.PaidPlan = int(offset), Status(status), plan == planPaid
	return a, err
}

// ConsultDate returns the date of a consultation ("YYYY-MM-DD") and its child: what the appointment's date is checked against.
func (r *Repository) ConsultDate(ctx context.Context, consultationID uuid.UUID) (string, uuid.UUID, error) {
	var date string
	var child uuid.UUID
	err := r.pool.QueryRow(ctx, `SELECT consult_date::text, child_id FROM consultations WHERE id = $1`, consultationID).Scan(&date, &child)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", uuid.Nil, ErrConsultationNotFound
	}
	if err != nil {
		return "", uuid.Nil, fmt.Errorf("reading the consultation: %w", err)
	}
	return date, child, nil
}

// Create saves the appointment and its notices in one transaction. It locks the owner's account row first (so two requests of
// one account are checked one after the other), then asks the paid plan (*PlanLimitError) and that the consultation has no
// scheduled appointment yet (ErrExists). A notice whose instant already passed is saved (and shown as passed) but never fires:
// the claim needs `fire_at > created_at`.
func (r *Repository) Create(ctx context.Context, consultationID uuid.UUID, n Normalized, createdBy uuid.UUID) (uuid.UUID, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var accountID, childID uuid.UUID
	var plan string
	err = tx.QueryRow(ctx, `
		SELECT a.id, a.plan::text, co.child_id
		FROM consultations co JOIN children ch ON ch.id = co.child_id JOIN accounts a ON a.id = ch.account_id
		WHERE co.id = $1
		FOR UPDATE OF a`, consultationID).Scan(&accountID, &plan, &childID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrConsultationNotFound
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("reading the account's plan: %w", err)
	}
	if plan != planPaid {
		return uuid.Nil, &PlanLimitError{Reason: PlanLimitAppointments}
	}
	var scheduled bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM consultation_appointments WHERE consultation_id = $1 AND status = 'scheduled')`, consultationID).Scan(&scheduled); err != nil {
		return uuid.Nil, fmt.Errorf("looking for a scheduled appointment: %w", err)
	}
	if scheduled {
		return uuid.Nil, ErrExists
	}

	now := r.now()
	var id uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO consultation_appointments
			(consultation_id, child_id, account_id, starts_at, utc_offset_minutes, note, created_by_account_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
		RETURNING id`, consultationID, childID, accountID, n.StartsAt, n.UtcOffsetMinutes, n.Note, createdBy, now).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("inserting appointment: %w", err)
	}
	for i, notice := range n.Notices {
		if err := insertNotice(ctx, tx, id, notice, n.FireAts[i], now); err != nil {
			return uuid.Nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, fmt.Errorf("committing appointment: %w", err)
	}
	return id, nil
}

func insertNotice(ctx context.Context, q querier, appointmentID uuid.UUID, n NoticeInput, fireAt, createdAt time.Time) error {
	_, err := q.Exec(ctx, `
		INSERT INTO appointment_notices (appointment_id, kind, lead_minutes, days_before, at_time, fire_at, created_at)
		VALUES ($1, $2, $3, $4, $5::text::time, $6, $7)`,
		appointmentID, string(n.Kind), n.LeadMinutes, n.DaysBefore, n.AtTime, fireAt, createdAt)
	if err != nil {
		return fmt.Errorf("inserting notice: %w", err)
	}
	return nil
}

// loadNotices fills the notices of the given appointments.
func (r *Repository) loadNotices(ctx context.Context, list []Appointment) error {
	if len(list) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, 0, len(list))
	index := map[uuid.UUID]int{}
	for i, a := range list {
		ids = append(ids, a.ID)
		index[a.ID] = i
	}
	rows, err := r.pool.Query(ctx, `
		SELECT appointment_id, id, kind, COALESCE(lead_minutes, 0), COALESCE(days_before, 0), COALESCE(to_char(at_time, 'HH24:MI'), ''), fire_at, created_at
		FROM appointment_notices WHERE appointment_id = ANY($1) ORDER BY fire_at, id`, ids)
	if err != nil {
		return fmt.Errorf("listing notices: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var apID uuid.UUID
		var n Notice
		var kind string
		var days int16
		if err := rows.Scan(&apID, &n.ID, &kind, &n.LeadMinutes, &days, &n.AtTime, &n.FireAt, &n.CreatedAt); err != nil {
			return fmt.Errorf("scanning notice: %w", err)
		}
		n.Kind, n.DaysBefore = NoticeKind(kind), int(days)
		list[index[apID]].Notices = append(list[index[apID]].Notices, n)
	}
	return rows.Err()
}

// Get returns one appointment with its notices. ErrNotFound if there is none.
func (r *Repository) Get(ctx context.Context, id uuid.UUID) (*Appointment, error) {
	a, err := scanAppointment(r.pool.QueryRow(ctx, appointmentSelect+` WHERE ap.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading appointment: %w", err)
	}
	list := []Appointment{a}
	if err := r.loadNotices(ctx, list); err != nil {
		return nil, err
	}
	return &list[0], nil
}

// ForConsultation is the consultation's scheduled appointment (which may already read «Pasó sin marcar»), nil if it has none.
func (r *Repository) ForConsultation(ctx context.Context, consultationID uuid.UUID) (*Appointment, bool, error) {
	var plan string
	err := r.pool.QueryRow(ctx, `
		SELECT a.plan::text FROM consultations co JOIN children ch ON ch.id = co.child_id JOIN accounts a ON a.id = ch.account_id
		WHERE co.id = $1`, consultationID).Scan(&plan)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, ErrConsultationNotFound
	}
	if err != nil {
		return nil, false, fmt.Errorf("reading the account's plan: %w", err)
	}
	a, err := scanAppointment(r.pool.QueryRow(ctx, appointmentSelect+` WHERE ap.consultation_id = $1 AND ap.status = 'scheduled'`, consultationID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, plan == planPaid, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("reading appointment: %w", err)
	}
	list := []Appointment{a}
	if err := r.loadNotices(ctx, list); err != nil {
		return nil, false, err
	}
	return &list[0], plan == planPaid, nil
}

// ForChild returns the child's nearest scheduled appointment that has not passed (`next`) and the rest — done, canceled and
// «Pasó sin marcar» — most recent first (`history`). Scheduled ones further ahead are in their own consultation.
func (r *Repository) ForChild(ctx context.Context, childID uuid.UUID) (next *Appointment, history []Appointment, paid bool, err error) {
	var plan string
	err = r.pool.QueryRow(ctx, `SELECT a.plan::text FROM accounts a JOIN children ch ON ch.account_id = a.id WHERE ch.id = $1`, childID).Scan(&plan)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, false, ErrChildNotFound
	}
	if err != nil {
		return nil, nil, false, fmt.Errorf("reading the account's plan: %w", err)
	}
	rows, err := r.pool.Query(ctx, appointmentSelect+` WHERE ap.child_id = $1 ORDER BY ap.starts_at DESC, ap.id`, childID)
	if err != nil {
		return nil, nil, false, fmt.Errorf("listing appointments: %w", err)
	}
	defer rows.Close()
	var all []Appointment
	for rows.Next() {
		a, err := scanAppointment(rows)
		if err != nil {
			return nil, nil, false, fmt.Errorf("scanning appointment: %w", err)
		}
		all = append(all, a)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, false, fmt.Errorf("listing appointments: %w", err)
	}
	if err := r.loadNotices(ctx, all); err != nil {
		return nil, nil, false, err
	}
	now := r.now()
	nextIdx := -1
	for i, a := range all {
		if DerivedStatus(a.Status, a.StartsAt, a.UtcOffsetMinutes, now) == StatusScheduled && (nextIdx < 0 || a.StartsAt.Before(all[nextIdx].StartsAt)) {
			nextIdx = i
		}
	}
	for i, a := range all {
		switch {
		case i == nextIdx:
			c := a
			next = &c
		case DerivedStatus(a.Status, a.StartsAt, a.UtcOffsetMinutes, now) != StatusScheduled:
			history = append(history, a)
		}
	}
	sort.SliceStable(history, func(i, j int) bool { return history[i].StartsAt.After(history[j].StartsAt) })
	return next, history, plan == planPaid, nil
}

// lock starts a transaction with the owner account's row and then the appointment's locked, in that order.
func (r *Repository) lock(ctx context.Context, id uuid.UUID) (pgx.Tx, Appointment, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, Appointment{}, fmt.Errorf("starting transaction: %w", err)
	}
	fail := func(e error) (pgx.Tx, Appointment, error) {
		_ = tx.Rollback(ctx)
		return nil, Appointment{}, e
	}
	var owner uuid.UUID
	err = tx.QueryRow(ctx, `SELECT a.id FROM accounts a JOIN consultation_appointments ap ON ap.account_id = a.id WHERE ap.id = $1 FOR UPDATE OF a`, id).Scan(&owner)
	if errors.Is(err, pgx.ErrNoRows) {
		return fail(ErrNotFound)
	}
	if err != nil {
		return fail(fmt.Errorf("locking the owner account: %w", err))
	}
	a, err := scanAppointment(tx.QueryRow(ctx, appointmentSelect+` WHERE ap.id = $1 FOR UPDATE OF ap`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return fail(ErrNotFound)
	}
	if err != nil {
		return fail(fmt.Errorf("reading appointment: %w", err))
	}
	return tx, a, nil
}

// Update replaces the appointment's date, note and notices (the paid plan's: *PlanLimitError). Only a scheduled one can be edited
// (ErrClosed). Notices that are the same as before keep their row — what was already sent is not sent again — unless the date or
// the time moved, in which case all of them are made again. Nothing about the consultation changes.
func (r *Repository) Update(ctx context.Context, id uuid.UUID, n Normalized) error {
	tx, a, err := r.lock(ctx, id)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if a.Status != StatusScheduled {
		return ErrClosed
	}
	if !a.PaidPlan {
		return &PlanLimitError{Reason: PlanLimitAppointments}
	}
	now := r.now()
	moved := !a.StartsAt.Equal(n.StartsAt) || a.UtcOffsetMinutes != n.UtcOffsetMinutes
	if _, err := tx.Exec(ctx, `UPDATE consultation_appointments SET starts_at = $2, utc_offset_minutes = $3, note = $4, updated_at = $5 WHERE id = $1`,
		id, n.StartsAt, n.UtcOffsetMinutes, n.Note, now); err != nil {
		return fmt.Errorf("updating appointment: %w", err)
	}
	rows, err := tx.Query(ctx, `
		SELECT id, kind, COALESCE(lead_minutes, 0), COALESCE(days_before, 0), COALESCE(to_char(at_time, 'HH24:MI'), '')
		FROM appointment_notices WHERE appointment_id = $1`, id)
	if err != nil {
		return fmt.Errorf("listing notices: %w", err)
	}
	type old struct {
		id  uuid.UUID
		key string
	}
	var olds []old
	for rows.Next() {
		var o old
		var kind, at string
		var lead, days int
		if err := rows.Scan(&o.id, &kind, &lead, &days, &at); err != nil {
			rows.Close()
			return fmt.Errorf("scanning notice: %w", err)
		}
		o.key = noticeKey(NoticeKind(kind), lead, days, at)
		olds = append(olds, o)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("listing notices: %w", err)
	}

	keep := map[string]uuid.UUID{}
	if !moved {
		for _, o := range olds {
			keep[o.key] = o.id
		}
	}
	wanted := map[string]bool{}
	for i, notice := range n.Notices {
		key := noticeKey(notice.Kind, deref(notice.LeadMinutes), deref(notice.DaysBefore), derefS(notice.AtTime))
		wanted[key] = true
		if _, ok := keep[key]; ok {
			continue
		}
		if err := insertNotice(ctx, tx, id, notice, n.FireAts[i], now); err != nil {
			return err
		}
	}
	for _, o := range olds {
		if _, kept := keep[o.key]; kept && wanted[o.key] {
			continue
		}
		if _, err := tx.Exec(ctx, `DELETE FROM appointment_notice_reminders WHERE notice_id = $1`, o.id); err != nil {
			return fmt.Errorf("dropping notice reminders: %w", err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM appointment_notices WHERE id = $1`, o.id); err != nil {
			return fmt.Errorf("dropping notice: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing: %w", err)
	}
	return nil
}

func noticeKey(kind NoticeKind, lead, days int, at string) string {
	return fmt.Sprintf("%s/%d/%d/%s", kind, lead, days, at)
}

// SetStatus marks an appointment done or canceled, or takes «done» back to scheduled. Who and when are kept. Never needs the
// plan. A canceled appointment is final (ErrClosed): another one is made for another date.
func (r *Repository) SetStatus(ctx context.Context, id uuid.UUID, to Status, actor uuid.UUID) error {
	tx, a, err := r.lock(ctx, id)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	now := r.now()
	switch {
	case (to == StatusDone || to == StatusCanceled) && a.Status == StatusScheduled:
		if _, err := tx.Exec(ctx, `UPDATE consultation_appointments SET status = $2, status_by_account_id = $3, status_at = $4, updated_at = $4 WHERE id = $1`,
			id, string(to), actor, now); err != nil {
			return fmt.Errorf("marking appointment: %w", err)
		}
	case to == StatusScheduled && a.Status == StatusDone:
		var other bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM consultation_appointments WHERE consultation_id = $1 AND status = 'scheduled')`, a.ConsultationID).Scan(&other); err != nil {
			return fmt.Errorf("looking for a scheduled appointment: %w", err)
		}
		if other {
			return ErrExists
		}
		if _, err := tx.Exec(ctx, `UPDATE consultation_appointments SET status = 'scheduled', status_by_account_id = NULL, status_at = NULL, updated_at = $2 WHERE id = $1`, id, now); err != nil {
			return fmt.Errorf("undoing the mark: %w", err)
		}
	default:
		return ErrClosed
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing: %w", err)
	}
	return nil
}

// SetMuted turns the reminders of this appointment off (muted) or on for ONE person. Only a scheduled appointment has any.
func (r *Repository) SetMuted(ctx context.Context, id, accountID uuid.UUID, muted bool) error {
	var status string
	err := r.pool.QueryRow(ctx, `SELECT status FROM consultation_appointments WHERE id = $1`, id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("reading appointment: %w", err)
	}
	if Status(status) != StatusScheduled {
		return ErrNotScheduled
	}
	if muted {
		_, err = r.pool.Exec(ctx, `INSERT INTO appointment_muted (appointment_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, id, accountID)
	} else {
		_, err = r.pool.Exec(ctx, `DELETE FROM appointment_muted WHERE appointment_id = $1 AND account_id = $2`, id, accountID)
	}
	if err != nil {
		return fmt.Errorf("saving the reminder choice: %w", err)
	}
	return nil
}

// MutedAmong returns which of the appointments the person turned their reminders off for.
func (r *Repository) MutedAmong(ctx context.Context, accountID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]bool, error) {
	out := map[uuid.UUID]bool{}
	if len(ids) == 0 || accountID == uuid.Nil {
		return out, nil
	}
	rows, err := r.pool.Query(ctx, `SELECT appointment_id FROM appointment_muted WHERE account_id = $1 AND appointment_id = ANY($2)`, accountID, ids)
	if err != nil {
		return nil, fmt.Errorf("reading the reminder choices: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scanning the reminder choice: %w", err)
		}
		out[id] = true
	}
	return out, rows.Err()
}
