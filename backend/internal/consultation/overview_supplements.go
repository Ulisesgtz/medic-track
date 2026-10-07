package consultation

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
)

// DoseKindMedication and DoseKindSupplement say where an overview dose comes from (specs/033).
const (
	DoseKindMedication = "medication"
	DoseKindSupplement = "supplement"
)

// addSupplementDoses adds to the overview the doses of [from, to) of the child's ACTIVE supplement routines (paused and
// ended ones stop being today's), each with the status the routine's own rule gives it, and keeps the whole list ordered by
// time. They are not an «active treatment»: that stays derived from consultations only.
func (r *Repository) addSupplementDoses(ctx context.Context, overview *ChildOverview, childID uuid.UUID, from, to, now time.Time) error {
	rows, err := r.pool.Query(ctx, `
		SELECT d.id, d.routine_id, sr.name, d.scheduled_at, d.taken, d.taken_by_account_id, a.first_name, d.taken_at,
		       (SELECT min(n.scheduled_at) FROM supplement_doses n
		         WHERE n.routine_id = d.routine_id AND n.scheduled_at > d.scheduled_at) AS next_at
		FROM supplement_doses d
		JOIN supplement_routines sr ON sr.id = d.routine_id
		LEFT JOIN accounts a ON a.id = d.taken_by_account_id
		WHERE sr.child_id = $1 AND sr.status = 'active' AND d.scheduled_at >= $2 AND d.scheduled_at < $3
	`, childID, from, to)
	if err != nil {
		return fmt.Errorf("querying supplement doses in range: %w", err)
	}
	defer rows.Close()

	added := false
	for rows.Next() {
		d := DoseOverview{Kind: DoseKindSupplement}
		var by markAuthor
		var next *time.Time
		if err := rows.Scan(&d.ID, &d.RoutineID, &d.MedicationName, &d.ScheduledAt, &d.Taken, &by.accountID, &by.name, &by.at, &next); err != nil {
			return fmt.Errorf("scanning supplement dose: %w", err)
		}
		d.TakenBy = by.takenBy()
		d.Status = DoseStatus(supplement.StatusAt(d.ScheduledAt, d.Taken, next, now))
		overview.Doses = append(overview.Doses, d)
		added = true
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterating supplement doses: %w", err)
	}
	if added {
		sort.SliceStable(overview.Doses, func(i, j int) bool {
			a, b := overview.Doses[i], overview.Doses[j]
			if !a.ScheduledAt.Equal(b.ScheduledAt) {
				return a.ScheduledAt.Before(b.ScheduledAt)
			}
			return a.MedicationName < b.MedicationName
		})
	}
	return nil
}
