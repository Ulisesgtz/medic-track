package consultation

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// specs/031: the pure parts of the history search — the Spanish folding and the criteria's validation.

func TestFoldSpanish(t *testing.T) {
	cases := map[string]string{
		"López":          "lopez",
		"LÓPEZ":          "lopez",
		"niño":           "nino",
		"NIÑO":           "nino",
		"Pingüino":       "pinguino",
		"Iván Robles":    "ivan robles",
		"Dra. Cázares":   "dra. cazares",
		"Amoxicilina":    "amoxicilina",
		"250 mg (c/8 h)": "250 mg (c/8 h)",
		"":               "",
		"ÁÉÍÓÚÜÑ":        "aeiouun",
	}
	for in, want := range cases {
		require.Equal(t, want, foldSpanish(in), in)
	}
}

func TestSQLFold_WrapsTheExpressionAndListsBothCases(t *testing.T) {
	got := sqlFold("c.doctor_name")

	require.Equal(t, "translate(lower(c.doctor_name), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')", got)
}

func date(y int, m time.Month, d int) *time.Time {
	t := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	return &t
}

func TestValidateHistorySearch_NothingGivenIsValidAndFiltersNothing(t *testing.T) {
	out, errs := validateHistorySearch(HistorySearch{})

	require.False(t, errs.HasErrors())
	require.Equal(t, KindAll, out.Kind)
	require.Empty(t, out.Q)
	require.Empty(t, out.SymptomCodes)
}

func TestValidateHistorySearch_TrimsAndDropsRepeatedOrEmptyCodes(t *testing.T) {
	out, errs := validateHistorySearch(HistorySearch{
		Q: "  amox  ", Doctor: " Dra. López ", Medication: "\tParacetamol\n",
		SymptomCodes: []string{" fever", "cough", "fever", "  ", ""},
		Kind:         KindRecord,
	})

	require.False(t, errs.HasErrors())
	require.Equal(t, "amox", out.Q)
	require.Equal(t, "Dra. López", out.Doctor)
	require.Equal(t, "Paracetamol", out.Medication)
	require.Equal(t, []string{"fever", "cough"}, out.SymptomCodes)
	require.Equal(t, KindRecord, out.Kind)
}

func fields(errs ValidationErrors) []string {
	out := make([]string, 0, len(errs))
	for _, e := range errs {
		out = append(out, e.Field)
	}
	return out
}

func TestValidateHistorySearch_RejectsWhatIsOutOfRange(t *testing.T) {
	long := func(n int) string { return strings.Repeat("ñ", n) } // counted in characters, not bytes

	_, ok := validateHistorySearch(HistorySearch{Q: long(maxSearchTextRunes), Doctor: long(maxSearchNameRunes), Medication: long(maxSearchNameRunes)})
	require.False(t, ok.HasErrors(), "the limits themselves are valid")

	_, errs := validateHistorySearch(HistorySearch{
		Q: long(maxSearchTextRunes + 1), Doctor: long(maxSearchNameRunes + 1), Medication: long(maxSearchNameRunes + 1),
		From: date(2026, 7, 1), To: date(2026, 6, 1), Kind: "everything",
		SymptomCodes: func() []string {
			codes := make([]string, maxSearchSymptoms+1)
			for i := range codes {
				codes[i] = "code_" + strings.Repeat("x", i+1)
			}
			return codes
		}(),
	})

	require.ElementsMatch(t, []string{"q", "doctor", "medication", "to", "kind", "symptomCodes"}, fields(errs))
}

func TestValidateHistorySearch_TheSameDayOrOnlyOneEndIsFine(t *testing.T) {
	for _, in := range []HistorySearch{
		{From: date(2026, 6, 1), To: date(2026, 6, 1)},
		{From: date(2026, 6, 1)},
		{To: date(2026, 6, 1)},
		{From: date(2099, 1, 1)}, // the future is valid: it just matches nothing
	} {
		_, errs := validateHistorySearch(in)
		require.False(t, errs.HasErrors())
	}
}

func TestValidateHistorySearch_EveryKindButOneIsKnown(t *testing.T) {
	for _, kind := range []string{"", KindAll, KindTreatment, KindRecord} {
		_, errs := validateHistorySearch(HistorySearch{Kind: kind})
		require.False(t, errs.HasErrors(), kind)
	}
	_, errs := validateHistorySearch(HistorySearch{Kind: "ALL"})
	require.Equal(t, []string{"kind"}, fields(errs), "the kinds are lower case")
}
