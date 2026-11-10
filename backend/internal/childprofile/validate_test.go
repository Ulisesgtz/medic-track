package childprofile

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func f(v float64) *float64 { return &v }

func fields(errs ValidationErrors) []string {
	out := []string{}
	for _, e := range errs {
		out = append(out, e.Field)
	}
	return out
}

var today = time.Date(2026, 11, 9, 15, 0, 0, 0, time.UTC)

func TestValidate_TheSignupsRules(t *testing.T) {
	c, errs := Validate(Input{FirstName: "  Sofía ", LastName: "Gómez-Ruiz", BirthDate: "2021-03-14", Height: f(88.5), Weight: nil}, today)
	require.Empty(t, errs)
	require.Equal(t, "Sofía", c.FirstName, "trimmed")
	require.Equal(t, time.Date(2021, 3, 14, 0, 0, 0, 0, time.UTC), c.BirthDate)
	require.Nil(t, c.Weight, "emptied")
	require.Nil(t, c.Measurement)

	_, errs = Validate(Input{FirstName: "", LastName: "Sofi4", BirthDate: "ayer", Height: f(0), Weight: f(-1)}, today)
	require.Equal(t, []string{"firstName", "lastName", "birthDate", "height", "weight"}, fields(errs))
	for _, e := range errs {
		require.NotContains(t, e.Message, "Sofi4", "a message never repeats what was written")
	}

	_, errs = Validate(Input{FirstName: strings.Repeat("a", 101), LastName: "Gómez", BirthDate: "2026-11-11"}, today)
	require.Equal(t, []string{"firstName", "birthDate"}, fields(errs), "too long; and the day after tomorrow is the future")
	_, errs = Validate(Input{FirstName: "Ana", LastName: "Gómez", BirthDate: "2026-11-10"}, today)
	require.Empty(t, errs, "tomorrow in UTC is allowed: the server doesn't know the parent's time zone")
}

func TestValidate_TheMeasurementHasTheGrowthRecordsRules(t *testing.T) {
	base := Input{FirstName: "Mateo", LastName: "Gómez", BirthDate: "2024-01-10", Weight: f(12.4), Height: f(88.5),
		Measurement: &MeasurementInput{MeasuredOn: "2026-11-09"}}
	c, errs := Validate(base, today)
	require.Empty(t, errs)
	require.Equal(t, 12.4, *c.Measurement.WeightKg)
	require.Equal(t, 88.5, *c.Measurement.HeightCm)
	require.Nil(t, c.Measurement.Note)

	bad := base
	bad.Weight = f(250)
	_, errs = Validate(bad, today)
	require.Equal(t, []string{"measurement.weightKg"}, fields(errs), "the signup takes it, a measurement doesn't")

	before := base
	before.Measurement = &MeasurementInput{MeasuredOn: "2024-01-09"}
	_, errs = Validate(before, today)
	require.Equal(t, []string{"measurement.measuredOn"}, fields(errs), "against the NEW birth date")

	empty := base
	empty.Weight, empty.Height = nil, nil
	_, errs = Validate(empty, today)
	require.Equal(t, []string{"measurement"}, fields(errs))

	noBirth := base
	noBirth.BirthDate = ""
	_, errs = Validate(noBirth, today)
	require.Equal(t, []string{"birthDate"}, fields(errs), "without a birth date the measurement isn't checked")
}

func TestChanges(t *testing.T) {
	birth := time.Date(2024, 1, 10, 0, 0, 0, 0, time.UTC)
	cur := current{firstName: "Mateo", lastName: "Gómez", birthDate: birth, height: f(85), weight: nil}
	same := Cleaned{FirstName: "Mateo", LastName: "Gómez", BirthDate: birth, Height: f(85)}
	require.False(t, identityChanged(cur, same))
	require.False(t, anythingChanged(cur, same))

	weight := same
	weight.Weight = f(12)
	require.False(t, identityChanged(cur, weight))
	require.True(t, anythingChanged(cur, weight))

	emptied := same
	emptied.Height = nil
	require.True(t, anythingChanged(cur, emptied))

	other := same
	other.Height = f(86)
	require.True(t, anythingChanged(cur, other))

	for _, c := range []Cleaned{
		{FirstName: "Mateó", LastName: "Gómez", BirthDate: birth, Height: f(85)},
		{FirstName: "Mateo", LastName: "Ruiz", BirthDate: birth, Height: f(85)},
		{FirstName: "Mateo", LastName: "Gómez", BirthDate: birth.AddDate(0, 0, 1), Height: f(85)},
	} {
		require.True(t, identityChanged(cur, c))
	}
	require.Contains(t, (&ConflictError{}).Error(), "birth date")
	require.Equal(t, "invalid fields: firstName", ValidationErrors{{Field: "firstName"}}.Error())
}
