package errorlog

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Reading the log and keeping it from growing forever (specs/021-consulta-y-retencion-error-logs). Append-only still:
// nothing here edits an entry; DeleteOlderThan is the retention policy, never a way to alter what happened.

// Cursor is where a page of the list ended: the next page is what comes strictly after it (keyset pagination, so
// errors arriving while paging never repeat or skip a row).
type Cursor struct {
	CreatedAt time.Time
	ID        uuid.UUID
}

// Filter narrows a listing or a summary. Zero fields don't filter.
type Filter struct {
	Since, Until   time.Time
	Endpoint       string // exact
	EndpointPrefix string // e.g. "job:"
	// ExcludeEndpointPrefix leaves out the entries whose endpoint starts with it (specs/039: the digest separates the
	// requests from the background processes, "job:").
	ExcludeEndpointPrefix string
	Status                *int
	AccountID             *uuid.UUID
	Limit                 int     // List only
	After                 *Cursor // List only
}

// SummaryRow is one group of the summary: the same error (endpoint, status and message) and how often it happened.
type SummaryRow struct {
	Endpoint   string
	HTTPStatus *int
	Message    string
	Count      int
	FirstSeen  time.Time
	LastSeen   time.Time
}

// SummaryLimit is the most groups a summary returns.
const SummaryLimit = 100

// escapeLike makes a prefix literal for LIKE ... ESCAPE '\'.
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// where builds the conditions (and their arguments) shared by List and Summary.
func (f Filter) where() (string, []any) {
	var conds []string
	var args []any
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, fmt.Sprintf(cond, len(args)))
	}
	if !f.Since.IsZero() {
		add("created_at >= $%d", f.Since)
	}
	if !f.Until.IsZero() {
		add("created_at <= $%d", f.Until)
	}
	if f.Endpoint != "" {
		add("endpoint = $%d", f.Endpoint)
	}
	if f.EndpointPrefix != "" {
		add(`endpoint LIKE $%d ESCAPE '\'`, escapeLike(f.EndpointPrefix)+"%")
	}
	if f.ExcludeEndpointPrefix != "" {
		add(`endpoint NOT LIKE $%d ESCAPE '\'`, escapeLike(f.ExcludeEndpointPrefix)+"%")
	}
	if f.Status != nil {
		add("http_status = $%d", *f.Status)
	}
	if f.AccountID != nil {
		add("account_id = $%d", *f.AccountID)
	}
	if len(conds) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

// List returns up to f.Limit entries, newest first, and whether there are more after them. Limit must be positive.
func (r *Repository) List(ctx context.Context, f Filter) ([]Entry, bool, error) {
	where, args := f.where()
	if f.After != nil {
		args = append(args, f.After.CreatedAt, f.After.ID)
		cond := fmt.Sprintf("(created_at, id) < ($%d, $%d)", len(args)-1, len(args))
		if where == "" {
			where = " WHERE " + cond
		} else {
			where += " AND " + cond
		}
	}
	args = append(args, f.Limit+1) // one more, to know whether there is a next page
	rows, err := r.pool.Query(ctx, `
		SELECT id, message, http_status, endpoint, file, line, account_id, created_at
		FROM error_logs`+where+fmt.Sprintf(`
		ORDER BY created_at DESC, id DESC
		LIMIT $%d`, len(args)), args...)
	if err != nil {
		return nil, false, fmt.Errorf("listing error log entries: %w", err)
	}
	defer rows.Close()

	var entries []Entry
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.Message, &e.HTTPStatus, &e.Endpoint, &e.File, &e.Line, &e.AccountID, &e.CreatedAt); err != nil {
			return nil, false, fmt.Errorf("scanning error log entry: %w", err)
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, false, fmt.Errorf("iterating error log entries: %w", err)
	}
	more := len(entries) > f.Limit
	if more {
		entries = entries[:f.Limit]
	}
	return entries, more, nil
}

// Summary groups the entries of a period by endpoint, status and message, most frequent first (the most recent
// breaks a tie), up to SummaryLimit groups.
func (r *Repository) Summary(ctx context.Context, f Filter) ([]SummaryRow, error) {
	where, args := f.where()
	rows, err := r.pool.Query(ctx, `
		SELECT endpoint, http_status, message, count(*), min(created_at), max(created_at)
		FROM error_logs`+where+fmt.Sprintf(`
		GROUP BY endpoint, http_status, message
		ORDER BY count(*) DESC, max(created_at) DESC
		LIMIT %d`, SummaryLimit), args...)
	if err != nil {
		return nil, fmt.Errorf("summarizing error log entries: %w", err)
	}
	defer rows.Close()

	var out []SummaryRow
	for rows.Next() {
		var s SummaryRow
		if err := rows.Scan(&s.Endpoint, &s.HTTPStatus, &s.Message, &s.Count, &s.FirstSeen, &s.LastSeen); err != nil {
			return nil, fmt.Errorf("scanning error log summary: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// DeleteOlderThan deletes one batch of at most `batch` entries created before `cutoff` — the oldest first — and says
// how many. Short locks: a caller that wants them all calls it until a batch comes back smaller than `batch`.
func (r *Repository) DeleteOlderThan(ctx context.Context, cutoff time.Time, batch int) (int, error) {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM error_logs WHERE id IN (
			SELECT id FROM error_logs WHERE created_at < $1 ORDER BY created_at LIMIT $2
		)
	`, cutoff, batch)
	if err != nil {
		return 0, fmt.Errorf("deleting old error log entries: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// Stats counts what a filter selects (specs/039-digest-semanal-errores): how many entries, in how many groups (the same
// groups Summary makes: endpoint, status and message) and from how many distinct accounts. The digest shows the count of
// accounts, never which ones, so the identifiers never leave the database.
type Stats struct {
	Entries  int
	Groups   int
	Accounts int
}

// Stats counts the entries, groups and distinct accounts of a period. An entry with no account is not counted as one.
func (r *Repository) Stats(ctx context.Context, f Filter) (Stats, error) {
	where, args := f.where()
	var s Stats
	err := r.pool.QueryRow(ctx, `
		SELECT count(*), count(DISTINCT account_id),
		       (SELECT count(*) FROM (SELECT 1 FROM error_logs`+where+` GROUP BY endpoint, http_status, message) g)
		FROM error_logs`+where, args...).Scan(&s.Entries, &s.Accounts, &s.Groups)
	if err != nil {
		return Stats{}, fmt.Errorf("counting error log entries: %w", err)
	}
	return s, nil
}

// OldestEntry is when the oldest entry the filter selects was written, or nil if it selects none. The digest uses it (with
// no filter) to tell a quiet week from a service too young to have one.
func (r *Repository) OldestEntry(ctx context.Context, f Filter) (*time.Time, error) {
	where, args := f.where()
	var oldest *time.Time
	if err := r.pool.QueryRow(ctx, `SELECT min(created_at) FROM error_logs`+where, args...).Scan(&oldest); err != nil {
		return nil, fmt.Errorf("finding the oldest error log entry: %w", err)
	}
	return oldest, nil
}
