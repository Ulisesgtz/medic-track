package growth_test

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/growth"
)

func f(v float64) *float64 { return &v }

func fields(errs growth.ValidationErrors) []string {
	out := []string{}
	for _, e := range errs {
		out = append(out, e.Field)
	}
	return out
}

func TestValidate(t *testing.T) {
	birth := time.Date(2024, 3, 10, 0, 0, 0, 0, time.UTC)
	today := time.Date(2026, 11, 8, 20, 0, 0, 0, time.UTC)

	t.Run("a date and a weight are enough; the note is trimmed", func(t *testing.T) {
		c, errs := growth.Validate(growth.Input{MeasuredOn: "2026-11-03", WeightKg: f(12.45), Note: "  en ayunas "}, birth, today)
		require.Empty(t, errs)
		require.Equal(t, "2026-11-03", c.MeasuredOn.Format("2006-01-02"))
		require.Equal(t, 12.45, *c.WeightKg)
		require.Nil(t, c.HeightCm)
		require.Equal(t, "en ayunas", *c.Note)
	})
	t.Run("only the height, an empty note is nil", func(t *testing.T) {
		c, errs := growth.Validate(growth.Input{MeasuredOn: "2026-11-03", HeightCm: f(86.5), Note: "   "}, birth, today)
		require.Empty(t, errs)
		require.Nil(t, c.Note)
		require.Equal(t, 86.5, *c.HeightCm)
	})
	t.Run("neither value", func(t *testing.T) {
		_, errs := growth.Validate(growth.Input{MeasuredOn: "2026-11-03"}, birth, today)
		require.Equal(t, []string{"weightKg"}, fields(errs))
	})
	t.Run("the date: missing, future, before the birth; tomorrow is allowed for time zones", func(t *testing.T) {
		_, errs := growth.Validate(growth.Input{MeasuredOn: "ayer", WeightKg: f(10)}, birth, today)
		require.Equal(t, []string{"measuredOn"}, fields(errs))
		_, errs = growth.Validate(growth.Input{MeasuredOn: "2026-11-10", WeightKg: f(10)}, birth, today)
		require.Equal(t, "La fecha no puede ser futura.", errs[0].Message)
		_, errs = growth.Validate(growth.Input{MeasuredOn: "2024-03-09", WeightKg: f(10)}, birth, today)
		require.Equal(t, "La fecha no puede ser anterior al nacimiento.", errs[0].Message)
		_, errs = growth.Validate(growth.Input{MeasuredOn: "2026-11-09", WeightKg: f(10)}, birth, today)
		require.Empty(t, errs)
		_, errs = growth.Validate(growth.Input{MeasuredOn: "2024-03-10", WeightKg: f(3.2)}, birth, today)
		require.Empty(t, errs, "the day of the birth")
	})
	t.Run("ranges and decimals", func(t *testing.T) {
		for _, bad := range []float64{0, 0.29, 200.01, 12.345} {
			_, errs := growth.Validate(growth.Input{MeasuredOn: "2026-11-03", WeightKg: f(bad)}, birth, today)
			require.Equal(t, []string{"weightKg"}, fields(errs), bad)
		}
		for _, bad := range []float64{29.9, 220.1, 86.25} {
			_, errs := growth.Validate(growth.Input{MeasuredOn: "2026-11-03", HeightCm: f(bad)}, birth, today)
			require.Equal(t, []string{"heightCm"}, fields(errs), bad)
		}
		_, errs := growth.Validate(growth.Input{MeasuredOn: "2026-11-03", WeightKg: f(0.3), HeightCm: f(220)}, birth, today)
		require.Empty(t, errs)
		_, errs = growth.Validate(growth.Input{MeasuredOn: "2026-11-03", WeightKg: f(200), HeightCm: f(30)}, birth, today)
		require.Empty(t, errs)
	})
	t.Run("a long note", func(t *testing.T) {
		_, errs := growth.Validate(growth.Input{MeasuredOn: "2026-11-03", WeightKg: f(10), Note: strings.Repeat("á", 301)}, birth, today)
		require.Equal(t, []string{"note"}, fields(errs))
		_, errs = growth.Validate(growth.Input{MeasuredOn: "2026-11-03", WeightKg: f(10), Note: strings.Repeat("á", 300)}, birth, today)
		require.Empty(t, errs)
	})
	t.Run("the messages never judge the child", func(t *testing.T) {
		_, errs := growth.Validate(growth.Input{MeasuredOn: "x", WeightKg: f(500), HeightCm: f(5), Note: strings.Repeat("a", 400)}, birth, today)
		require.Len(t, errs, 4)
		for _, e := range errs {
			for _, word := range []string{"normal", "bajo", "alto", "riesgo", "sobrepeso", "desnutri", "debería"} {
				require.NotContains(t, strings.ToLower(e.Message), word)
			}
		}
	})
}

func TestValidSex(t *testing.T) {
	s, ok := growth.ValidSex("female")
	require.True(t, ok)
	require.Equal(t, growth.Female, s)
	_, ok = growth.ValidSex("male")
	require.True(t, ok)
	_, ok = growth.ValidSex("x")
	require.False(t, ok)
}

func TestReference(t *testing.T) {
	w, h := growth.ReferenceFor(growth.Male)
	require.Equal(t, 120, w.MaxMonths)
	require.Equal(t, 228, h.MaxMonths)
	// Points published by WHO (weight-for-age and length/height-for-age, boys): the tables are copied as they are.
	require.Equal(t, growth.Point{Months: 0, P3: 2.5, P15: 2.9, P50: 3.3, P85: 3.9, P97: 4.3}, w.Curves[0])
	require.Equal(t, 12.2, w.Curves[24].P50)
	require.Equal(t, 86.9, h.Curves[23].P50, "length lying until 23 months")
	require.Equal(t, 87.1, h.Curves[24].P50, "height standing from 24 months")
	require.Equal(t, 176.543, h.Curves[228].P50)
	for i, p := range h.Curves {
		require.Equal(t, i, p.Months, "one point per month, no gaps")
		require.Less(t, p.P3, p.P15)
		require.Less(t, p.P15, p.P50)
		require.Less(t, p.P50, p.P85)
		require.Less(t, p.P85, p.P97)
	}
	gw, gh := growth.ReferenceFor(growth.Female)
	require.Equal(t, 3.2, gw.Curves[0].P50)
	require.Equal(t, 49.1, gh.Curves[0].P50)
	require.Len(t, gw.Curves, 121)
}

func TestAgeInMonths(t *testing.T) {
	birth := time.Date(2025, 6, 10, 0, 0, 0, 0, time.UTC)
	require.Equal(t, 0.0, growth.AgeInMonths(birth, birth))
	require.Equal(t, 0.99, growth.AgeInMonths(birth, birth.AddDate(0, 0, 30).Add(10*time.Hour)), "30 days of 30.4375; the hour is ignored")
	require.Equal(t, 11.99, growth.AgeInMonths(birth, time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC)), "365 days / 30.4375")
}
