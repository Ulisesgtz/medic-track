package supplement

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

// Repository runs the routines' SQL.
type Repository struct {
	pool *pgxpool.Pool
	now  func() time.Time
}

// NewRepository creates a Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, now: time.Now}
}

// querier is what both the pool and a transaction offer.
type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// routineSelect reads a routine with who created it and the owner's plan.
const routineSelect = `
	SELECT r.id, r.account_id, r.child_id, r.name, r.note, r.period, r.times::text[], r.weekdays, r.interval_hours,
	       r.first_date::text, r.first_time::text, r.end_date::text, r.utc_offset_minutes, r.status,
	       r.paused_at, r.ended_at, r.generated_until, r.created_at, c.first_name,
	       CASE WHEN r.child_id IS NULL AND (owner.plan = 'paid' OR EXISTS (
		       SELECT 1 FROM family_members fm JOIN accounts fo ON fo.id = fm.family_account_id
		       WHERE fm.account_id = owner.id AND fm.status = 'active' AND fo.plan = 'paid')) THEN 'paid' ELSE owner.plan::text END
	FROM supplement_routines r
	JOIN accounts c ON c.id = r.created_by_account_id
	JOIN accounts owner ON owner.id = r.account_id`

type scanned struct {
	view           RoutineView
	generatedUntil time.Time
}

func scanRoutine(row pgx.Row) (scanned, error) {
	var s scanned
	var times []string
	var weekdays []int16
	var intervalHours *int16
	var firstTime, endDate *string
	var offset int16
	var period, status, plan string
	v := &s.view
	err := row.Scan(&v.ID, &v.AccountID, &v.ChildID, &v.Name, &v.Note, &period, &times, &weekdays, &intervalHours,
		&v.FirstDate, &firstTime, &endDate, &offset, &status, &v.PausedAt, &v.EndedAt, &s.generatedUntil, &v.CreatedAt,
		&v.CreatedBy, &plan)
	if err != nil {
		return s, err
	}
	v.Period, v.Status, v.UtcOffsetMinutes, v.PaidPlan = Period(period), Status(status), int(offset), plan == planPaid
	for _, t := range times {
		v.Times = append(v.Times, t[:5])
	}
	for _, d := range weekdays {
		v.Weekdays = append(v.Weekdays, int(d))
	}
	if intervalHours != nil {
		v.IntervalHours = int(*intervalHours)
	}
	if firstTime != nil {
		v.FirstTime = (*firstTime)[:5]
	}
	if endDate != nil {
		v.EndDate = *endDate
	}
	return s, nil
}

// farFuture is "no upper bound" for Generate (which clamps to the routine's own end).
func farFuture(from time.Time) time.Time { return from.AddDate(100, 0, 0) }

// Create saves a routine and its first doses in one transaction (contracts/routines.md). It locks the owner's account row
// first — so two requests of one account are checked one after the other — and then enforces, in this order, the paid
// plan (*PlanLimitError) and the cap of active routines per child (*RoutineLimitError). Nothing is written when either
// refuses. Doses are generated from the routine's first day up to HorizonDays ahead (research R2).
func (r *Repository) Create(ctx context.Context, childID uuid.UUID, in Routine, createdBy uuid.UUID) (uuid.UUID, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var accountID uuid.UUID
	var plan string
	err = tx.QueryRow(ctx, `
		SELECT a.id, a.plan::text
		FROM accounts a JOIN children ch ON ch.account_id = a.id
		WHERE ch.id = $1
		FOR UPDATE OF a`, childID).Scan(&accountID, &plan)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrChildNotFound
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("reading the account's plan: %w", err)
	}
	if plan != planPaid {
		return uuid.Nil, &PlanLimitError{Reason: PlanLimitSupplements}
	}
	if err := checkActiveCap(ctx, tx, childID); err != nil {
		return uuid.Nil, err
	}

	id, err := r.insertRoutine(ctx, tx, accountID, &childID, in, createdBy)
	if err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, fmt.Errorf("committing routine: %w", err)
	}
	return id, nil
}

// insertRoutine writes the routine and its first doses (from its first day up to HorizonDays ahead, research R2) inside the caller's
// transaction. `childID` is nil for a person's own routine (part 3).
func (r *Repository) insertRoutine(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, childID *uuid.UUID, in Routine, createdBy uuid.UUID) (uuid.UUID, error) {
	now := r.now()
	horizon := now.AddDate(0, 0, HorizonDays)
	var id uuid.UUID
	err := tx.QueryRow(ctx, `
		INSERT INTO supplement_routines
			(account_id, child_id, name, note, period, times, weekdays, interval_hours, first_date, first_time, end_date,
			 utc_offset_minutes, generated_until, created_by_account_id)
		VALUES ($1, $2, $3, $4, $5, $6::text[]::time[], $7::smallint[], $8, $9::date, NULLIF($10, '')::time,
		        NULLIF($11, '')::date, $12, $13, $14)
		RETURNING id`,
		accountID, childID, in.Name, in.Note, string(in.Period), nonNil(in.Times), smallInts(in.Weekdays),
		nullableInt(in.IntervalHours), in.FirstDate, in.FirstTime, in.EndDate, in.UtcOffsetMinutes, horizon, createdBy,
	).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("inserting routine: %w", err)
	}
	in.ID = id
	if err := insertDoses(ctx, tx, id, Generate(in, time.Time{}, horizon)); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

// checkActiveCap refuses the routine that would be the 11th active one of the child (paused and ended ones don't count).
// The caller holds the account row lock, so concurrent creations can't both pass.
func checkActiveCap(ctx context.Context, q querier, childID uuid.UUID) error {
	var active int
	err := q.QueryRow(ctx, `SELECT count(*) FROM supplement_routines WHERE child_id = $1 AND status = 'active'`, childID).Scan(&active)
	if err != nil {
		return fmt.Errorf("counting active routines: %w", err)
	}
	if active >= MaxActivePerChild {
		return &RoutineLimitError{Limit: MaxActivePerChild}
	}
	return nil
}

// insertDoses adds the doses; an instant that is already there is left alone (regenerating never duplicates).
func insertDoses(ctx context.Context, q querier, routineID uuid.UUID, at []time.Time) error {
	if len(at) == 0 {
		return nil
	}
	_, err := q.Exec(ctx, `
		INSERT INTO supplement_doses (routine_id, scheduled_at)
		SELECT $1, t FROM unnest($2::timestamptz[]) AS t
		ON CONFLICT (routine_id, scheduled_at) DO NOTHING`, routineID, at)
	if err != nil {
		return fmt.Errorf("inserting doses: %w", err)
	}
	return nil
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func smallInts(in []int) []int16 {
	out := make([]int16, 0, len(in))
	for _, d := range in {
		out = append(out, int16(d))
	}
	return out
}

func nullableInt(n int) *int {
	if n == 0 {
		return nil
	}
	return &n
}

// ListByChild returns the child's routines — active ones first (by the hour of their first dose in the window), then
// paused, then ended — each with only the doses of [from, to), its progress and, when an active routine has nothing in
// the window, its next dose. Nothing is hidden by plan: a lapsed owner's routines are read as ever.
func (r *Repository) ListByChild(ctx context.Context, childID uuid.UUID, from, to time.Time) (*RoutineList, error) {
	var plan string
	err := r.pool.QueryRow(ctx, `
		SELECT a.plan::text FROM accounts a JOIN children ch ON ch.account_id = a.id WHERE ch.id = $1`, childID).Scan(&plan)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrChildNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading the account's plan: %w", err)
	}

	return r.listWhere(ctx, plan == planPaid, `r.child_id = $1`, childID, from, to)
}

// listWhere reads the routines that match `where` (one positional argument) with the doses of [from, to), their progress and the
// numbers the section needs; `paid` is the plan the list reports.
func (r *Repository) listWhere(ctx context.Context, paid bool, where string, arg uuid.UUID, from, to time.Time) (*RoutineList, error) {
	rows, err := r.pool.Query(ctx, routineSelect+` WHERE `+where+` ORDER BY r.created_at, r.id`, arg)
	if err != nil {
		return nil, fmt.Errorf("listing routines: %w", err)
	}
	defer rows.Close()
	var items []scanned
	for rows.Next() {
		s, err := scanRoutine(rows)
		if err != nil {
			return nil, fmt.Errorf("scanning routine: %w", err)
		}
		items = append(items, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("listing routines: %w", err)
	}

	list := &RoutineList{PaidPlan: paid, Routines: []RoutineView{}}
	if err := r.fill(ctx, items, from, to); err != nil {
		return nil, err
	}
	for _, s := range items {
		if s.view.Status == StatusActive {
			list.ActiveCount++
		}
		list.Routines = append(list.Routines, s.view)
	}
	sortRoutines(list.Routines)
	return list, nil
}

// sortRoutines: active first (by their first dose of the window, those without one after, by creation), then paused, then
// ended (the most recently created first inside each of those).
func sortRoutines(rs []RoutineView) {
	rank := func(s Status) int {
		switch s {
		case StatusActive:
			return 0
		case StatusPaused:
			return 1
		}
		return 2
	}
	sort.SliceStable(rs, func(i, j int) bool {
		a, b := rs[i], rs[j]
		if ra, rb := rank(a.Status), rank(b.Status); ra != rb {
			return ra < rb
		}
		if a.Status != StatusActive {
			return a.CreatedAt.After(b.CreatedAt)
		}
		switch {
		case len(a.Doses) > 0 && len(b.Doses) > 0:
			return a.Doses[0].ScheduledAt.Before(b.Doses[0].ScheduledAt)
		case len(a.Doses) > 0:
			return true
		case len(b.Doses) > 0:
			return false
		}
		return a.CreatedAt.Before(b.CreatedAt)
	})
}

// Get returns one routine with the doses of [from, to). ErrRoutineNotFound if there is none.
func (r *Repository) Get(ctx context.Context, routineID uuid.UUID, from, to time.Time) (*RoutineView, error) {
	s, err := scanRoutine(r.pool.QueryRow(ctx, routineSelect+` WHERE r.id = $1`, routineID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrRoutineNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading routine: %w", err)
	}
	items := []scanned{s}
	if err := r.fill(ctx, items, from, to); err != nil {
		return nil, err
	}
	return &items[0].view, nil
}

// fill adds doses of the window, progress and next dose to each routine.
func (r *Repository) fill(ctx context.Context, items []scanned, from, to time.Time) error {
	if len(items) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, 0, len(items))
	for _, s := range items {
		ids = append(ids, s.view.ID)
	}
	now := r.now()

	byRoutine, err := r.dosesIn(ctx, ids, from, to, now)
	if err != nil {
		return err
	}
	counts, err := r.counts(ctx, ids, now)
	if err != nil {
		return err
	}
	for i := range items {
		v := &items[i].view
		v.Doses = byRoutine[v.ID]
		if v.Doses == nil {
			v.Doses = []Dose{}
		}
		c := counts[v.ID]
		v.Progress = Progress{Taken: c.taken, Elapsed: c.elapsed, Total: c.total}
		if v.Status == StatusActive && v.EndDate != "" {
			// Doses still to be generated up to the end (the planner extends the horizon as time passes).
			v.Progress.Total += len(Generate(v.Routine, items[i].generatedUntil, farFuture(items[i].generatedUntil)))
		}
		if v.Status == StatusActive && len(v.Doses) == 0 {
			if v.NextDose, err = r.nextDose(ctx, v.ID, to, now); err != nil {
				return err
			}
		}
	}
	return nil
}

type doseCounts struct{ taken, elapsed, total int }

func (r *Repository) counts(ctx context.Context, ids []uuid.UUID, now time.Time) (map[uuid.UUID]doseCounts, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT routine_id, count(*) FILTER (WHERE taken), count(*) FILTER (WHERE scheduled_at <= $2), count(*)
		FROM supplement_doses WHERE routine_id = ANY($1) GROUP BY routine_id`, ids, now)
	if err != nil {
		return nil, fmt.Errorf("counting doses: %w", err)
	}
	defer rows.Close()
	out := map[uuid.UUID]doseCounts{}
	for rows.Next() {
		var id uuid.UUID
		var c doseCounts
		if err := rows.Scan(&id, &c.taken, &c.elapsed, &c.total); err != nil {
			return nil, fmt.Errorf("scanning counts: %w", err)
		}
		out[id] = c
	}
	return out, rows.Err()
}

// doseSelect reads doses with who marked them and the instant of the routine's next dose (for the status rule).
const doseSelect = `
	SELECT d.id, d.routine_id, d.scheduled_at, d.taken, d.taken_by_account_id, a.first_name, d.taken_at,
	       (SELECT min(n.scheduled_at) FROM supplement_doses n
	         WHERE n.routine_id = d.routine_id AND n.scheduled_at > d.scheduled_at) AS next_at
	FROM supplement_doses d
	LEFT JOIN accounts a ON a.id = d.taken_by_account_id`

func (r *Repository) scanDose(row pgx.Row, now time.Time) (Dose, error) {
	var d Dose
	var by markAuthor
	var next *time.Time
	if err := row.Scan(&d.ID, &d.RoutineID, &d.ScheduledAt, &d.Taken, &by.accountID, &by.name, &by.at, &next); err != nil {
		return d, err
	}
	d.TakenBy = by.takenBy()
	d.Status = StatusAt(d.ScheduledAt, d.Taken, next, now)
	return d, nil
}

type markAuthor struct {
	accountID *uuid.UUID
	name      *string
	at        *time.Time
}

// takenBy is nil unless the dose has an author.
func (m markAuthor) takenBy() *TakenBy {
	if m.accountID == nil || m.name == nil || m.at == nil {
		return nil
	}
	return &TakenBy{AccountID: *m.accountID, Name: *m.name, At: *m.at}
}

func (r *Repository) dosesIn(ctx context.Context, ids []uuid.UUID, from, to, now time.Time) (map[uuid.UUID][]Dose, error) {
	rows, err := r.pool.Query(ctx, doseSelect+`
		WHERE d.routine_id = ANY($1) AND d.scheduled_at >= $2 AND d.scheduled_at < $3
		ORDER BY d.scheduled_at`, ids, from, to)
	if err != nil {
		return nil, fmt.Errorf("listing doses: %w", err)
	}
	defer rows.Close()
	out := map[uuid.UUID][]Dose{}
	for rows.Next() {
		d, err := r.scanDose(rows, now)
		if err != nil {
			return nil, fmt.Errorf("scanning dose: %w", err)
		}
		out[d.RoutineID] = append(out[d.RoutineID], d)
	}
	return out, rows.Err()
}

// nextDose is the first dose at or after `from`, nil if there is none.
func (r *Repository) nextDose(ctx context.Context, routineID uuid.UUID, from, now time.Time) (*Dose, error) {
	d, err := r.scanDose(r.pool.QueryRow(ctx, doseSelect+`
		WHERE d.routine_id = $1 AND d.scheduled_at >= $2 ORDER BY d.scheduled_at LIMIT 1`, routineID, from), now)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading the next dose: %w", err)
	}
	return &d, nil
}

// UpdateDoseStatus marks or unmarks a dose of the routine, as consultation doses are (specs/032): the FIRST mark wins
// (only a dose that wasn't marked is changed, so two people marking at once leave the first one's mark), unmarking needs
// the person to have marked it or to be able to do everything (otherwise ErrDoseForbidden), and a dose of another routine
// is ErrDoseNotFound. It never depends on the plan: marking is what keeps a child safe. The returned dose is read after the
// change, so one marked after its time reads taken.
func (r *Repository) UpdateDoseStatus(ctx context.Context, routineID, doseID uuid.UUID, taken bool, actor Actor) (*Dose, error) {
	if taken {
		_, err := r.pool.Exec(ctx, `
			UPDATE supplement_doses SET taken = true, taken_by_account_id = $3, taken_at = now()
			WHERE id = $1 AND routine_id = $2 AND NOT taken`, doseID, routineID, authorOrNil(actor.AccountID))
		if err != nil {
			return nil, fmt.Errorf("marking dose: %w", err)
		}
	} else {
		_, err := r.pool.Exec(ctx, `
			UPDATE supplement_doses SET taken = false, taken_by_account_id = NULL, taken_at = NULL
			WHERE id = $1 AND routine_id = $2 AND taken AND ($3::boolean OR taken_by_account_id = $4)`,
			doseID, routineID, actor.Full, authorOrNil(actor.AccountID))
		if err != nil {
			return nil, fmt.Errorf("unmarking dose: %w", err)
		}
	}
	d, err := r.scanDose(r.pool.QueryRow(ctx, doseSelect+` WHERE d.id = $1 AND d.routine_id = $2`, doseID, routineID), r.now())
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrDoseNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading dose: %w", err)
	}
	if !taken && d.Taken {
		return nil, ErrDoseForbidden
	}
	return &d, nil
}

// authorOrNil is what the doses table stores for who marked: no account means no author.
func authorOrNil(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}
