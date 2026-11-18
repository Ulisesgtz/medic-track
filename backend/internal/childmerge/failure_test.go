package childmerge_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/childmerge"
)

// failAt makes one statement of the union fail, for the test's children only (the trigger's WHEN names them, so the other
// packages that share the database are not touched), and removes the trigger when the test ends.
func failAt(t *testing.T, w *world, table, event, when string) {
	t.Helper()
	fn := "cm_forced_failure_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	trg := fn + "_trg"
	exec(t, w.pool, fmt.Sprintf(`CREATE FUNCTION %s() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'forced failure'; END $f$`, fn))
	exec(t, w.pool, fmt.Sprintf(`CREATE TRIGGER %s BEFORE %s ON %s FOR EACH ROW WHEN (%s) EXECUTE FUNCTION %s()`, trg, event, table, when, fn))
	t.Cleanup(func() {
		_, _ = w.pool.Exec(context.Background(), fmt.Sprintf(`DROP TRIGGER IF EXISTS %s ON %s`, trg, table))
		_, _ = w.pool.Exec(context.Background(), fmt.Sprintf(`DROP FUNCTION IF EXISTS %s()`, fn))
	})
}

// TestMerge_AFailureAtAnyStepLeavesNothingMoved: the union is all or nothing (SC-003).
func TestMerge_AFailureAtAnyStepLeavesNothingMoved(t *testing.T) {
	steps := []struct {
		name, table, event, when string // `when` uses {S} and {T} for the ids of the two children
	}{
		{"consultations", "consultations", "UPDATE", "NEW.child_id = '{T}'"},
		{"symptoms", "consultation_symptoms", "UPDATE", "NEW.child_id = '{T}'"},
		{"appointments", "consultation_appointments", "UPDATE", "NEW.child_id = '{T}'"},
		{"vaccines", "vaccine_records", "UPDATE", "NEW.child_id = '{T}'"},
		{"card photos", "vaccine_card_photos", "UPDATE", "NEW.child_id = '{T}'"},
		{"measurements", "growth_measurements", "UPDATE", "NEW.child_id = '{T}'"},
		{"phones moved", "child_device_links", "UPDATE", "NEW.child_id = '{T}'"},
		{"phones removed", "child_device_links", "UPDATE", "NEW.status = 'revoked'"},
		{"treatment extensions", "medication_extensions", "UPDATE", "NEW.medication_id = '{M}'"},
		{"routines", "supplement_routines", "UPDATE", "NEW.child_id = '{T}'"},
		{"chosen data", "children", "UPDATE", "NEW.id = '{T}'"},
		{"delete of the source", "children", "DELETE", "OLD.id = '{S}'"},
		{"record of the union", "child_merges", "INSERT", "NEW.target_child_id = '{T}'"},
	}
	for _, step := range steps {
		t.Run(step.name, func(t *testing.T) {
			w := newWorld(t, "tutor", account.PlanPaid)
			exec(t, w.pool, `INSERT INTO medication_extensions (medication_id, account_id, proposed_doses, added_doses) VALUES ($1, $2, 1, 1)`, w.medicine, w.laura)
			when := strings.NewReplacer("{S}", w.lauraChild.String(), "{T}", w.anaChild.String(), "{M}", w.medicine.String()).Replace(step.when)
			if step.name == "phones removed" {
				when += " AND NEW.child_id = '" + w.lauraChild.String() + "'"
			}
			failAt(t, w, step.table, step.event, when)
			_, err := childmerge.NewRepository(w.pool).Merge(context.Background(), w.laura, w.pair(nil))
			require.Error(t, err)
			require.Contains(t, err.Error(), "forced failure")

			require.Equal(t, 1, w.count(t, "children", "id", w.lauraChild))
			for _, table := range []string{"consultations", "consultation_symptoms", "consultation_appointments", "vaccine_records", "vaccine_card_photos",
				"growth_measurements", "supplement_routines", "child_device_links"} {
				require.Equal(t, 1, w.count(t, table, "child_id", w.lauraChild), table)
				require.Equal(t, 0, w.count(t, table, "child_id", w.anaChild), table)
			}
			var status string
			require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT status FROM child_device_links WHERE id = $1`, w.link).Scan(&status))
			require.Equal(t, "active", status)
			require.Equal(t, 0, w.count(t, "child_merges", "target_child_id", w.anaChild))
		})
	}
}

func TestHandler_AnUnexpectedFailureIs500WithTheResultsOfTheOthers(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	a := newAPI(t, w)
	failAt(t, w, "child_merges", "INSERT", "NEW.target_child_id = '"+w.anaChild.String()+"'")
	rec, body := a.call(w.lauraClerk, http.MethodPost, "/family/merges", pairsBody(w.lauraChild, w.anaChild, ""))
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.Equal(t, "internal_error", body["error"])
	res := body["results"].([]any)[0].(map[string]any)
	require.Equal(t, "failed", res["status"])
	require.Equal(t, "internal_error", res["error"])
	require.Equal(t, 1, w.count(t, "children", "id", w.lauraChild))
}

func TestMerge_UsesItsClock(t *testing.T) {
	w := newWorld(t, "tutor", account.PlanPaid)
	repo := childmerge.NewRepository(w.pool)
	at := time.Date(2026, 12, 3, 10, 0, 0, 0, time.UTC)
	repo.SetNow(func() time.Time { return at })
	_, err := repo.Merge(context.Background(), w.laura, w.pair(nil))
	require.NoError(t, err)
	var got time.Time
	var revoked time.Time
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT merged_at FROM child_merges WHERE target_child_id = $1`, w.anaChild).Scan(&got))
	require.True(t, got.Equal(at))
	require.NoError(t, w.pool.QueryRow(context.Background(), `SELECT revoked_at FROM child_device_links WHERE id = $1`, w.link).Scan(&revoked))
	require.True(t, revoked.Equal(at))
}
