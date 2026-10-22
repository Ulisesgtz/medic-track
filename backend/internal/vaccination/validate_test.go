package vaccination

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

var (
	birth    = time.Date(2021, 3, 14, 0, 0, 0, 0, time.UTC)
	todayFix = time.Date(2026, 10, 17, 15, 0, 0, 0, time.UTC)
)

func fieldsOf(errs ValidationErrors) []string {
	out := []string{}
	for _, e := range errs {
		out = append(out, e.Field)
	}
	return out
}

func TestValidate_ACatalogVaccineWithItsDateIsEnough(t *testing.T) {
	c, errs := Validate(Input{VaccineCode: " hepatitis_b ", AppliedOn: "2021-03-14"}, birth, todayFix)

	require.Empty(t, errs)
	require.Equal(t, "hepatitis_b", *c.VaccineCode)
	require.Nil(t, c.CustomName)
	require.Equal(t, birth, c.AppliedOn, "the day of the birth is valid")
	require.Nil(t, c.DoseNumber)
	require.Nil(t, c.Lot)
	require.Nil(t, c.Place)
	require.Nil(t, c.Notes)
}

func TestValidate_TheParentsOwnNameIsKeptAsWritten(t *testing.T) {
	c, errs := Validate(Input{CustomName: "  Vacuna del Dr. Pérez ", AppliedOn: "2026-10-17"}, birth, todayFix)

	require.Empty(t, errs)
	require.Equal(t, "Vacuna del Dr. Pérez", *c.CustomName)
	require.Nil(t, c.VaccineCode)
}

func TestValidate_ExactlyOneOfTheCodeAndTheOwnName(t *testing.T) {
	_, none := Validate(Input{AppliedOn: "2026-10-17"}, birth, todayFix)
	_, both := Validate(Input{VaccineCode: "bcg", CustomName: "Otra", AppliedOn: "2026-10-17"}, birth, todayFix)
	_, long := Validate(Input{CustomName: strings.Repeat("a", 101), AppliedOn: "2026-10-17"}, birth, todayFix)
	_, edge := Validate(Input{CustomName: strings.Repeat("ñ", 100), AppliedOn: "2026-10-17"}, birth, todayFix)

	require.Equal(t, []string{"vaccine"}, fieldsOf(none))
	require.Equal(t, []string{"vaccine"}, fieldsOf(both))
	require.Equal(t, []string{"customName"}, fieldsOf(long))
	require.Empty(t, edge, "100 characters (not bytes) fit")
}

func TestValidate_TheDateIsRequiredAndNotAfterTodayPlusOneDayNorBeforeTheBirth(t *testing.T) {
	_, missing := Validate(Input{VaccineCode: "bcg"}, birth, todayFix)
	_, garbled := Validate(Input{VaccineCode: "bcg", AppliedOn: "14/03/2021"}, birth, todayFix)
	_, tomorrow := Validate(Input{VaccineCode: "bcg", AppliedOn: "2026-10-18"}, birth, todayFix)
	_, afterTomorrow := Validate(Input{VaccineCode: "bcg", AppliedOn: "2026-10-19"}, birth, todayFix)
	_, beforeBirth := Validate(Input{VaccineCode: "bcg", AppliedOn: "2021-03-13"}, birth, todayFix)

	require.Equal(t, []string{"appliedOn"}, fieldsOf(missing))
	require.Equal(t, []string{"appliedOn"}, fieldsOf(garbled))
	require.Empty(t, tomorrow, "one day of tolerance: the server does not know the parent's time zone")
	require.Equal(t, []string{"appliedOn"}, fieldsOf(afterTomorrow))
	require.Equal(t, []string{"appliedOn"}, fieldsOf(beforeBirth))
}

func TestValidate_TheLimitsOfTheOptionalFields(t *testing.T) {
	ok, errs := Validate(Input{VaccineCode: "bcg", AppliedOn: "2026-10-17", DoseNumber: intPtr(20), Lot: strings.Repeat("l", 60), Place: strings.Repeat("p", 120), Notes: "n"}, birth, todayFix)
	require.Empty(t, errs)
	require.Equal(t, 20, *ok.DoseNumber)

	_, low := Validate(Input{VaccineCode: "bcg", AppliedOn: "2026-10-17", DoseNumber: intPtr(0)}, birth, todayFix)
	_, high := Validate(Input{VaccineCode: "bcg", AppliedOn: "2026-10-17", DoseNumber: intPtr(21)}, birth, todayFix)
	_, all := Validate(Input{VaccineCode: "bcg", AppliedOn: "2026-10-17", Lot: strings.Repeat("l", 61), Place: strings.Repeat("p", 121), Notes: strings.Repeat("n", 501)}, birth, todayFix)

	require.Equal(t, []string{"doseNumber"}, fieldsOf(low))
	require.Equal(t, []string{"doseNumber"}, fieldsOf(high))
	require.Equal(t, []string{"lot", "place", "notes"}, fieldsOf(all))
}

func TestValidate_TheMessagesAreFixedAndNeverRepeatWhatWasWritten(t *testing.T) {
	secret := "Nota secreta de salud " + strings.Repeat("x", 600)
	_, errs := Validate(Input{CustomName: "Mi vacuna privada", AppliedOn: "no es fecha", Lot: "LOTE-PRIVADO" + strings.Repeat("l", 60), Notes: secret}, birth, todayFix)

	require.NotEmpty(t, errs)
	for _, e := range errs {
		require.NotContains(t, e.Message, "privada")
		require.NotContains(t, e.Message, "LOTE-PRIVADO")
		require.NotContains(t, e.Message, "secreta")
	}
	require.Contains(t, errs.Error(), "appliedOn")
}

func TestFold_IgnoresCaseAndAccents(t *testing.T) {
	require.Equal(t, fold("Neumocócica CONJUGADA"), fold(" neumococica conjugada "))
	require.Equal(t, "nino", fold("Niño"))
	require.Equal(t, "pinguino", fold("PINGÜINO"))
	require.NotEqual(t, fold("Varicela"), fold("Varicelo"))
}

func intPtr(n int) *int { return &n }
