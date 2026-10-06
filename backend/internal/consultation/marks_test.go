package consultation_test

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// specs/032-compartir-con-familia: who marked a dose, the first mark wins, and who may unmark.

// person creates an account (its first name is `name`) to act as; it needs no family for these tests, the repository only
// stores the author.
func person(t *testing.T, pool *pgxpool.Pool, name string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(), `
		INSERT INTO accounts (first_name, last_name, email, plan) VALUES ($1, 'Prueba', $2, 'free') RETURNING id`,
		name, fmt.Sprintf("marks.%s@example.com", uuid.NewString())).Scan(&id))
	return id
}

func freshDose(t *testing.T) (*consultation.Service, *pgxpool.Pool, *consultation.Consultation, uuid.UUID) {
	t.Helper()
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	c, err := svc.CreateConsultation(context.Background(), createTestChild(t, pool), activeInput())
	require.NoError(t, err)
	return svc, pool, c, c.Medications[0].Doses[0].ID
}

func TestMarks_AMarkSavesWhoAndWhenAndEveryoneReadsIt(t *testing.T) {
	svc, pool, c, doseID := freshDose(t)
	ana := person(t, pool, "Ana")

	dose, err := svc.MarkDose(context.Background(), c.ID, doseID, true, consultation.Actor{AccountID: ana})

	require.NoError(t, err)
	require.True(t, dose.Taken)
	require.NotNil(t, dose.TakenBy)
	require.Equal(t, "Ana", dose.TakenBy.Name, "the first name, never the e-mail")
	require.Equal(t, ana, dose.TakenBy.AccountID)
	require.False(t, dose.TakenBy.At.IsZero())

	// It is what the detail and the child's overview say too.
	detail, err := svc.GetConsultation(context.Background(), c.ID)
	require.NoError(t, err)
	got := detail.Medications[0].Doses[0]
	require.NotNil(t, got.TakenBy)
	require.Equal(t, "Ana", got.TakenBy.Name)
	require.Equal(t, consultation.DoseStatusTaken, got.Status)
	for _, other := range detail.Medications[0].Doses[1:] {
		require.Nil(t, other.TakenBy, "a dose nobody marked has no author")
	}
}

func TestMarks_TheFirstMarkWinsAndTheSecondSeesTheDoseAsItWas(t *testing.T) {
	svc, pool, c, doseID := freshDose(t)
	ana, luis := person(t, pool, "Ana"), person(t, pool, "Luis")
	ctx := context.Background()
	_, err := svc.MarkDose(ctx, c.ID, doseID, true, consultation.Actor{AccountID: ana})
	require.NoError(t, err)

	second, err := svc.MarkDose(ctx, c.ID, doseID, true, consultation.Actor{AccountID: luis})

	require.NoError(t, err, "not an error: the dose is marked, which is what they wanted")
	require.True(t, second.Taken)
	require.Equal(t, "Ana", second.TakenBy.Name, "the author stays the first one's")
}

// FR-014: two people at once leave exactly one mark, with one author — never a mix.
func TestMarks_TwoAtOnceLeaveOneMarkWithOneAuthor(t *testing.T) {
	svc, pool, c, doseID := freshDose(t)
	people := []uuid.UUID{person(t, pool, "Ana"), person(t, pool, "Luis"), person(t, pool, "Rosa"), person(t, pool, "Paco")}
	results := make([]*consultation.Dose, len(people))
	errs := make([]error, len(people))
	var wg sync.WaitGroup
	for i := range people {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = svc.MarkDose(context.Background(), c.ID, doseID, true, consultation.Actor{AccountID: people[i]})
		}(i)
	}
	wg.Wait()

	var winner string
	for i, r := range results {
		require.NoError(t, errs[i])
		require.True(t, r.Taken)
		if winner == "" {
			winner = r.TakenBy.Name
		}
		require.Equal(t, winner, r.TakenBy.Name, "everybody is told the same author")
	}
	var marks int
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT count(*) FROM doses WHERE id = $1 AND taken AND taken_by_account_id IS NOT NULL`, doseID).Scan(&marks))
	require.Equal(t, 1, marks)
}

func TestMarks_WhoMayUnmark(t *testing.T) {
	svc, pool, c, doseID := freshDose(t)
	ana, luis := person(t, pool, "Ana"), person(t, pool, "Luis")
	ctx := context.Background()
	mark := func() {
		_, err := svc.MarkDose(ctx, c.ID, doseID, true, consultation.Actor{AccountID: ana})
		require.NoError(t, err)
	}
	taken := func() bool {
		var v bool
		require.NoError(t, pool.QueryRow(ctx, `SELECT taken FROM doses WHERE id = $1`, doseID).Scan(&v))
		return v
	}

	mark()
	// Someone who only sees and marks can't undo another person's mark.
	_, err := svc.MarkDose(ctx, c.ID, doseID, false, consultation.Actor{AccountID: luis})
	require.ErrorIs(t, err, consultation.ErrDoseForbidden)
	require.True(t, taken())

	// The same person can.
	dose, err := svc.MarkDose(ctx, c.ID, doseID, false, consultation.Actor{AccountID: ana})
	require.NoError(t, err)
	require.False(t, dose.Taken)
	require.Nil(t, dose.TakenBy, "an unmarked dose has no author")
	require.False(t, taken())
	var author *uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT taken_by_account_id FROM doses WHERE id = $1`, doseID).Scan(&author))
	require.Nil(t, author)

	// Someone who can do everything (the owner or a Tutor) can undo anyone's.
	mark()
	dose, err = svc.MarkDose(ctx, c.ID, doseID, false, consultation.Actor{AccountID: luis, Full: true})
	require.NoError(t, err)
	require.False(t, dose.Taken)

	// Unmarking what is not marked is harmless for anyone.
	_, err = svc.MarkDose(ctx, c.ID, doseID, false, consultation.Actor{AccountID: luis})
	require.NoError(t, err)
}

// FR-015: a dose marked before the feature has no author; it is read as "tomada" and only someone with everything unmarks it.
func TestMarks_ADoseMarkedBeforeTheFeatureHasNoAuthor(t *testing.T) {
	svc, pool, c, doseID := freshDose(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx, `UPDATE doses SET taken = true WHERE id = $1`, doseID) // as the old code did: no author, no time
	require.NoError(t, err)

	detail, err := svc.GetConsultation(ctx, c.ID)
	require.NoError(t, err)
	require.True(t, detail.Medications[0].Doses[0].Taken)
	require.Nil(t, detail.Medications[0].Doses[0].TakenBy)

	_, err = svc.MarkDose(ctx, c.ID, doseID, false, consultation.Actor{AccountID: person(t, pool, "Luis")})
	require.ErrorIs(t, err, consultation.ErrDoseForbidden)
	_, err = svc.MarkDose(ctx, c.ID, doseID, false, consultation.Actor{Full: true})
	require.NoError(t, err)
}

func TestMarks_ADoseOfAnotherConsultationIsNotFound(t *testing.T) {
	svc, _, _, doseID := freshDose(t)

	_, err := svc.MarkDose(context.Background(), uuid.New(), doseID, true, anyone)
	require.ErrorIs(t, err, consultation.ErrDoseNotFound)
	_, err = svc.MarkDose(context.Background(), uuid.New(), doseID, false, anyone)
	require.ErrorIs(t, err, consultation.ErrDoseNotFound)
}

func TestMarks_TheOverviewSaysWhoMarkedToo(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	c, err := svc.CreateConsultation(context.Background(), childID, activeInput())
	require.NoError(t, err)
	ana := person(t, pool, "Ana")
	// Today's dose of the consultation.
	scheduled := c.Medications[0].Doses[0]
	doseID := scheduled.ID
	_, err = svc.MarkDose(context.Background(), c.ID, doseID, true, consultation.Actor{AccountID: ana})
	require.NoError(t, err)

	overview, err := svc.GetChildOverview(context.Background(), childID, scheduled.ScheduledAt.Add(-time.Hour), scheduled.ScheduledAt.Add(time.Hour))

	require.NoError(t, err)
	require.Len(t, overview.Doses, 1)
	require.NotNil(t, overview.Doses[0].TakenBy)
	require.Equal(t, "Ana", overview.Doses[0].TakenBy.Name)
}

// ---- the HTTP side: the actor comes from RequireAccess, who may unmark is a 403, and the response says who marked.

func TestHandler_UpdateDose_SaysWhoMarkedAndForbidsUnmarkingSomeoneElses(t *testing.T) {
	pool := testPool(t)
	ana, luis := person(t, pool, "Ana"), person(t, pool, "Luis")
	svc := consultation.NewService(consultation.NewRepository(pool))
	c, err := svc.CreateConsultation(context.Background(), createTestChild(t, pool), activeInput())
	require.NoError(t, err)
	path := "/consultations/" + c.ID.String() + "/doses/" + c.Medications[0].Doses[0].ID.String()
	asAna, _ := routerAs(t, access.Access{Level: access.Mark, ActorAccountID: ana})
	asLuis, _ := routerAs(t, access.Access{Level: access.Mark, ActorAccountID: luis})
	asLuisWithEverything, _ := routerAs(t, access.Access{Level: access.Full, ActorAccountID: luis})

	marked := doPatchPath(t, asAna, path, map[string]any{"taken": true})
	require.Equal(t, http.StatusOK, marked.Code, marked.Body.String())
	body := decodeBody(t, marked.Body)
	takenBy := body["takenBy"].(map[string]any)
	require.Equal(t, "Ana", takenBy["name"])
	require.NotEmpty(t, takenBy["at"])
	require.NotContains(t, marked.Body.String(), "@", "never an e-mail")
	require.Equal(t, true, takenBy["mine"], "the author is told it is their own mark")

	// Somebody else reading it is told it is not theirs; so is the detail, which is what the screens read.
	detailPath := "/consultations/" + c.ID.String()
	seen := doGet(t, asLuis, detailPath)
	require.Equal(t, http.StatusOK, seen.Code, seen.Body.String())
	require.Contains(t, seen.Body.String(), `"mine":false`)
	require.NotContains(t, seen.Body.String(), `"mine":true`)
	own := doGet(t, asAna, detailPath)
	require.Contains(t, own.Body.String(), `"mine":true`)

	// Luis (see and mark) can't unmark Ana's; with everything he can.
	denied := doPatchPath(t, asLuis, path, map[string]any{"taken": false})
	require.Equal(t, http.StatusForbidden, denied.Code)
	require.Equal(t, "forbidden", decodeBody(t, denied.Body)["error"])
	allowed := doPatchPath(t, asLuisWithEverything, path, map[string]any{"taken": false})
	require.Equal(t, http.StatusOK, allowed.Code)
	require.Nil(t, decodeBody(t, allowed.Body)["takenBy"])
}

func TestHandler_UpdateDose_WithoutTheSessionsAccessNothingIsChanged(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	c, err := svc.CreateConsultation(context.Background(), createTestChild(t, pool), activeInput())
	require.NoError(t, err)
	// A handler reached without RequireAccess in front fails closed.
	router := routerWithoutAccess(t)

	rec := doPatchPath(t, router, "/consultations/"+c.ID.String()+"/doses/"+c.Medications[0].Doses[0].ID.String(), map[string]any{"taken": true})

	require.Equal(t, http.StatusInternalServerError, rec.Code)
	var taken bool
	require.NoError(t, pool.QueryRow(context.Background(), `SELECT taken FROM doses WHERE id = $1`, c.Medications[0].Doses[0].ID).Scan(&taken))
	require.False(t, taken)
}

