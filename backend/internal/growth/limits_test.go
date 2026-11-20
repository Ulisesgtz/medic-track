package growth_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/growth"
)

func TestMaxMonths_AreTheLastRowOfEveryTable(t *testing.T) {
	for _, sex := range []growth.Sex{growth.Male, growth.Female} {
		w, h := growth.ReferenceFor(sex)
		require.Equal(t, growth.WeightMaxMonths, w.MaxMonths)
		require.Equal(t, growth.HeightMaxMonths, h.MaxMonths)
		require.Equal(t, growth.WeightMaxMonths, w.Curves[len(w.Curves)-1].Months)
		require.Equal(t, growth.HeightMaxMonths, h.Curves[len(h.Curves)-1].Months)
	}
	require.Equal(t, 120, growth.WeightMaxMonths)
	require.Equal(t, 228, growth.HeightMaxMonths)
}

// newFamilyBornOn is an owner account with one child born on `birth`.
func newFamilyBornOn(t *testing.T, pool *pgxpool.Pool, birth time.Time) family {
	t.Helper()
	suffix := fmt.Sprintf("%d.%s", time.Now().UnixNano(), uuid.NewString()[:6])
	acc := &account.Account{
		FirstName: "Ana", LastName: "Prueba", Email: "limits." + suffix + "@example.com", Plan: account.PlanPaid,
		Children: []account.Child{{FirstName: "Sofia", LastName: "Prueba", BirthDate: birth}},
	}
	require.NoError(t, account.NewRepository(pool).Create(context.Background(), acc))
	return family{accountID: acc.ID, childID: acc.Children[0].ID, birth: birth}
}

func TestChart_OnlyWhatTheCurveCoversIsDrawn(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	svc := growth.NewService(growth.NewRepository(pool))
	birth := time.Date(time.Now().Year()-20, 2, 29, 0, 0, 0, 0, time.UTC) // a leap day: the rounded age is not to be trusted
	if birth.Day() != 29 {
		birth = time.Date(birth.Year(), 3, 1, 0, 0, 0, 0, time.UTC)
	}
	fam := newFamilyBornOn(t, pool, birth)
	add := func(on time.Time, w, h *float64) {
		_, err := svc.Create(ctx, fam.childID, fam.accountID, growth.Input{MeasuredOn: day(on), WeightKg: w, HeightCm: h})
		require.NoError(t, err)
	}
	tenth := birth.AddDate(0, 120, 0)
	nineteenth := birth.AddDate(0, 228, 0)
	add(tenth.AddDate(0, 0, -1), f(30), f(130))     // day before: both in
	add(tenth, f(31), f(131))                       // the birthday itself: in
	add(tenth.AddDate(0, 0, 1), f(32), f(132))      // after: weight out, height in
	add(nineteenth, nil, f(170))                    // height's last day: in
	add(nineteenth.AddDate(0, 0, 1), f(60), f(171)) // both out

	c, err := svc.Chart(ctx, fam.childID)
	require.NoError(t, err)
	require.Nil(t, c.WeightReference, "no table chosen")
	require.Len(t, c.Weight, 2)
	require.Equal(t, day(tenth), c.Weight[1].MeasuredOn)
	require.Len(t, c.Height, 4)
	require.Equal(t, 170.0, c.Height[3].Value)
	require.Equal(t, growth.Limit{MaxMonths: 120, Later: 2}, c.Limits.Weight)
	require.Equal(t, growth.Limit{MaxMonths: 228, Later: 1}, c.Limits.Height)

	// The list is untouched: every measurement is there.
	l, err := svc.List(ctx, fam.childID)
	require.NoError(t, err)
	require.Len(t, l.Measurements, 5)

	// With the table chosen and the curves off the limits are the same.
	require.NoError(t, svc.SetSex(ctx, fam.childID, growth.Male))
	c, err = svc.Chart(ctx, fam.childID)
	require.NoError(t, err)
	require.False(t, c.ReferenceAvailable)
	require.Equal(t, growth.Limit{MaxMonths: 120, Later: 2}, c.Limits.Weight)
}

func TestHandler_TheChartAlwaysSaysWhereTheCurvesEnd(t *testing.T) {
	e := newEnv(t, account.PlanPaid, access.Full, nil)
	base := "/children/" + e.fam.childID.String()
	chart := e.do(t, http.MethodGet, base+"/growth-chart", "")
	require.Equal(t, http.StatusOK, chart.Code)
	require.Contains(t, chart.Body.String(), `"limits":{"weight":{"maxMonths":120,"later":0},"height":{"maxMonths":228,"later":0}}`)
	require.Contains(t, chart.Body.String(), `"reference":null`)
}
