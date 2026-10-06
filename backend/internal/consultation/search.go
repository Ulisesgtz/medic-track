package consultation

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

// specs/031-historial-busqueda-filtros: the paid plan's "Historial" — search and filters over the consultations a child
// already has. Read-only; it only finds what the parent registered, it never ranks, compares or suggests (Principio I).

// The kinds of consultation the history can be narrowed to.
const (
	KindAll       = "all"       // no filter (the default)
	KindTreatment = "treatment" // consultations with a schedule: not record-only
	KindRecord    = "record"    // consultations saved only as a record (specs/024)
)

// Limits of a search (research R5).
const (
	maxSearchTextRunes = 100
	maxSearchNameRunes = 200
	maxSearchSymptoms  = 30
)

// HistorySearch is what the parent asked for. Every criterion given must hold at once; an empty one filters nothing.
type HistorySearch struct {
	// Q matches the doctor, the notes or the name of any medication, ignoring case and accents, as a part of the text.
	Q string
	// From and To bound the consultation date (a day, both ends included); either may be nil.
	From, To *time.Time
	// Doctor and Medication are exact names as registered (the screen offers them from HistoryOptions).
	Doctor, Medication string
	// SymptomCodes: the consultation must have all of them.
	SymptomCodes []string
	// Kind is KindAll, KindTreatment or KindRecord; empty means KindAll.
	Kind string
}

// HistoryOptions are the names already registered for a child, to offer as choices.
type HistoryOptions struct {
	Doctors     []string
	Medications []string
}

// spanishFolder folds the letters Spanish text carries so "nino" finds "niño" and "lopez" finds "López".
var spanishFolder = strings.NewReplacer(
	"á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n",
)

// foldSpanish lower-cases s and drops its Spanish accents (and ñ → n). It is the Go twin of sqlFold: both must agree, so a
// test runs them over the same texts.
func foldSpanish(s string) string {
	return spanishFolder.Replace(strings.ToLower(s))
}

// sqlFold is foldSpanish for a SQL expression. The upper-case accented letters are listed too: lower() depends on the
// database's locale, and a "C" one leaves them untouched.
func sqlFold(expr string) string {
	return "translate(lower(" + expr + "), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')"
}

// validateHistorySearch trims the criteria and checks them. A bad one is an error, never silently ignored (FR-011); the
// symptom codes' existence is the repository's check, it needs the catalog.
func validateHistorySearch(in HistorySearch) (HistorySearch, ValidationErrors) {
	var errs ValidationErrors
	out := in
	out.Q = strings.TrimSpace(in.Q)
	out.Doctor = strings.TrimSpace(in.Doctor)
	out.Medication = strings.TrimSpace(in.Medication)

	if utf8.RuneCountInString(out.Q) > maxSearchTextRunes {
		errs = append(errs, ValidationError{Field: "q", Message: fmt.Sprintf("must be at most %d characters", maxSearchTextRunes)})
	}
	if utf8.RuneCountInString(out.Doctor) > maxSearchNameRunes {
		errs = append(errs, ValidationError{Field: "doctor", Message: fmt.Sprintf("must be at most %d characters", maxSearchNameRunes)})
	}
	if utf8.RuneCountInString(out.Medication) > maxSearchNameRunes {
		errs = append(errs, ValidationError{Field: "medication", Message: fmt.Sprintf("must be at most %d characters", maxSearchNameRunes)})
	}
	if in.From != nil && in.To != nil && in.To.Before(*in.From) {
		errs = append(errs, ValidationError{Field: "to", Message: "must not be before from"})
	}

	switch in.Kind {
	case "":
		out.Kind = KindAll
	case KindAll, KindTreatment, KindRecord:
	default:
		errs = append(errs, ValidationError{Field: "kind", Message: "must be all, treatment or record"})
	}

	out.SymptomCodes = uniqueCodes(trimmedCodes(in.SymptomCodes))
	if len(out.SymptomCodes) > maxSearchSymptoms {
		errs = append(errs, ValidationError{Field: "symptomCodes", Message: fmt.Sprintf("must be at most %d symptoms", maxSearchSymptoms)})
	}
	return out, errs
}

// trimmedCodes trims every code and drops the empty ones.
func trimmedCodes(codes []string) []string {
	out := make([]string, 0, len(codes))
	for _, code := range codes {
		if code = strings.TrimSpace(code); code != "" {
			out = append(out, code)
		}
	}
	return out
}

// requirePaid reads the plan of the account that owns the child and refuses the search unless it is the paid one (research
// R6). ErrChildNotFound when the child doesn't exist. The server decides, never the client.
func (r *Repository) requirePaid(ctx context.Context, childID uuid.UUID) error {
	_, plan, err := accountPlanOf(ctx, r.pool, childID, false)
	if err != nil {
		return err
	}
	if plan != planPaid {
		return &PlanLimitError{Reason: PlanLimitHistorySearch}
	}
	return nil
}

// Search lists the child's consultations that meet every criterion given, most recent first, in the same shape as
// GetByChild. Values only ever travel as query arguments; the SQL text is built from fixed fragments. A free account gets
// a *PlanLimitError (and no rows, whatever it asked); a symptom code the catalog never had is ErrSymptomNotAvailable.
func (r *Repository) Search(ctx context.Context, childID uuid.UUID, s HistorySearch) ([]Consultation, error) {
	if err := r.requirePaid(ctx, childID); err != nil {
		return nil, err
	}

	if len(s.SymptomCodes) > 0 {
		// Retired symptoms count: an old consultation keeps them and must still be found by them (specs/012).
		var known int
		if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM symptoms WHERE code = ANY($1)`, s.SymptomCodes).Scan(&known); err != nil {
			return nil, fmt.Errorf("checking the symptom codes: %w", err)
		}
		if known != len(s.SymptomCodes) {
			return nil, ErrSymptomNotAvailable
		}
	}

	args := []any{childID}
	where := []string{"c.child_id = $1"}
	arg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	if s.Q != "" {
		q := arg(foldSpanish(s.Q))
		where = append(where, fmt.Sprintf(`(strpos(%s, %s) > 0 OR strpos(%s, %s) > 0 OR EXISTS (
			SELECT 1 FROM medications m WHERE m.consultation_id = c.id AND strpos(%s, %s) > 0))`,
			sqlFold("c.doctor_name"), q, sqlFold("c.notes"), q, sqlFold("m.name"), q))
	}
	if s.From != nil {
		where = append(where, "c.consult_date >= "+arg(*s.From))
	}
	if s.To != nil {
		where = append(where, "c.consult_date <= "+arg(*s.To))
	}
	if s.Doctor != "" {
		where = append(where, "btrim(c.doctor_name) = "+arg(s.Doctor))
	}
	if s.Medication != "" {
		where = append(where, "EXISTS (SELECT 1 FROM medications m WHERE m.consultation_id = c.id AND btrim(m.name) = "+arg(s.Medication)+")")
	}
	if len(s.SymptomCodes) > 0 {
		where = append(where, fmt.Sprintf(`(SELECT count(DISTINCT cs.symptom_code) FROM consultation_symptoms cs
			WHERE cs.consultation_id = c.id AND cs.symptom_code = ANY(%s)) = %d`, arg(s.SymptomCodes), len(s.SymptomCodes)))
	}
	switch s.Kind {
	case KindTreatment:
		where = append(where, "NOT c.record_only")
	case KindRecord:
		where = append(where, "c.record_only")
	}

	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.child_id, c.doctor_name, c.consult_date, c.notes, c.created_at, c.record_only,
		       (SELECT count(*) FROM medications m WHERE m.consultation_id = c.id),
		       COALESCE((SELECT array_agg(s.name ORDER BY s.sort_order)
		                 FROM consultation_symptoms cs JOIN symptoms s ON s.code = cs.symptom_code
		                 WHERE cs.consultation_id = c.id), '{}')
		FROM consultations c
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY c.consult_date DESC, c.created_at DESC, c.id
	`, args...)
	if err != nil {
		return nil, fmt.Errorf("searching consultations: %w", err)
	}
	defer rows.Close()
	return scanSummaries(rows)
}

// HistoryOptions lists the distinct doctors and medication names registered for the child, as the parent wrote them (they
// are not unified or corrected), sorted without telling apart case or accents. Paid accounts only, like Search. One
// query for both lists; never nil: a child without consultations has empty lists, not null.
func (r *Repository) HistoryOptions(ctx context.Context, childID uuid.UUID) (*HistoryOptions, error) {
	if err := r.requirePaid(ctx, childID); err != nil {
		return nil, err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT 'doctor', btrim(c.doctor_name) FROM consultations c WHERE c.child_id = $1
		UNION
		SELECT 'medication', btrim(m.name)
		FROM medications m JOIN consultations c ON c.id = m.consultation_id WHERE c.child_id = $1
	`, childID)
	if err != nil {
		return nil, fmt.Errorf("listing the history options: %w", err)
	}
	defer rows.Close()

	options := &HistoryOptions{Doctors: []string{}, Medications: []string{}}
	for rows.Next() {
		var kind, name string
		if err := rows.Scan(&kind, &name); err != nil {
			return nil, fmt.Errorf("scanning a history option: %w", err)
		}
		switch {
		case name == "":
		case kind == "doctor":
			options.Doctors = append(options.Doctors, name)
		default:
			options.Medications = append(options.Medications, name)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating the history options: %w", err)
	}
	sortFolded(options.Doctors)
	sortFolded(options.Medications)
	return options, nil
}

// sortFolded orders names by their folded text (no case, no accents), then as written, so the order is stable.
func sortFolded(names []string) {
	sort.SliceStable(names, func(i, j int) bool {
		fi, fj := foldSpanish(names[i]), foldSpanish(names[j])
		if fi != fj {
			return fi < fj
		}
		return names[i] < names[j]
	})
}
