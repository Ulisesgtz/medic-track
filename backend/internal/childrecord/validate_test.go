package childrecord_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/childrecord"
)

func s(v string) *string { return &v }

func fields(errs childrecord.ValidationErrors) []string {
	out := []string{}
	for _, e := range errs {
		out = append(out, e.Field)
	}
	return out
}

func TestValidate_CleansAndKeepsTheOrder(t *testing.T) {
	got, errs := childrecord.Validate(childrecord.Content{
		BloodType:    s(" O+ "),
		GeneralNote:  s("   "),
		Pediatrician: &childrecord.Pediatrician{Name: s(" Dra. Ruiz "), Phone: s("+52 (33) 1234-5678"), Office: s("")},
		Allergies: []childrecord.Allergy{
			{Name: " Penicilina ", Kind: s("medication"), Note: s(" ronchas ")},
			{Name: "Cacahuate", Kind: s(" "), Note: nil},
		},
		Conditions: []childrecord.Condition{{Name: "Asma", Note: s("")}},
	})
	require.Empty(t, errs)
	require.Equal(t, "O+", *got.BloodType)
	require.Nil(t, got.GeneralNote)
	require.Equal(t, "Dra. Ruiz", *got.Pediatrician.Name)
	require.Nil(t, got.Pediatrician.Office)
	require.Equal(t, "Penicilina", got.Allergies[0].Name)
	require.Equal(t, "ronchas", *got.Allergies[0].Note)
	require.Equal(t, "Cacahuate", got.Allergies[1].Name)
	require.Nil(t, got.Allergies[1].Kind)
	require.Nil(t, got.Conditions[0].Note)
}

func TestValidate_EmptyPediatricianBecomesNil(t *testing.T) {
	got, errs := childrecord.Validate(childrecord.Content{Pediatrician: &childrecord.Pediatrician{Name: s(" ")}})
	require.Empty(t, errs)
	require.Nil(t, got.Pediatrician)
	require.NotNil(t, got.Allergies)
	require.NotNil(t, got.Conditions)
}

func TestValidate_FieldErrorsNameTheFieldNeverTheValue(t *testing.T) {
	secret := "SECRETO-CLINICO"
	long := func(n int) *string { v := strings.Repeat("a", n); return &v }
	_, errs := childrecord.Validate(childrecord.Content{
		BloodType:    s("Z+" + secret),
		GeneralNote:  long(1001),
		Pediatrician: &childrecord.Pediatrician{Name: long(121), Phone: s("tel " + secret), Office: long(301)},
		Allergies: []childrecord.Allergy{
			{Name: "ok"},
			{Name: "  "},
			{Name: *long(121), Kind: s("pollen" + secret), Note: long(301)},
		},
		Conditions: []childrecord.Condition{{Name: ""}, {Name: "x", Note: long(301)}},
	})
	require.ElementsMatch(t, []string{
		"bloodType", "generalNote", "pediatrician.name", "pediatrician.phone", "pediatrician.office",
		"allergies[1].name", "allergies[2].name", "allergies[2].kind", "allergies[2].note",
		"conditions[0].name", "conditions[1].note",
	}, fields(errs))
	for _, e := range errs {
		require.NotContains(t, e.Message, secret)
		require.NotContains(t, e.Field, secret)
	}
	require.Contains(t, errs.Error(), "bloodType")
	require.NotContains(t, errs.Error(), secret)
}

func TestValidate_PhoneTooLong(t *testing.T) {
	_, errs := childrecord.Validate(childrecord.Content{Pediatrician: &childrecord.Pediatrician{Phone: s(strings.Repeat("1", 31))}})
	require.Equal(t, []string{"pediatrician.phone"}, fields(errs))
}

func TestValidate_TheCaps(t *testing.T) {
	mk := func(n int) []childrecord.Allergy {
		out := make([]childrecord.Allergy, n)
		for i := range out {
			out[i] = childrecord.Allergy{Name: fmt.Sprintf("a%d", i)}
		}
		return out
	}
	_, errs := childrecord.Validate(childrecord.Content{Allergies: mk(30)})
	require.Empty(t, errs)
	_, errs = childrecord.Validate(childrecord.Content{Allergies: mk(31)})
	require.Equal(t, []string{"allergies"}, fields(errs))

	conds := make([]childrecord.Condition, 31)
	for i := range conds {
		conds[i] = childrecord.Condition{Name: "c"}
	}
	_, errs = childrecord.Validate(childrecord.Content{Conditions: conds})
	require.Equal(t, []string{"conditions"}, fields(errs))
}

func TestValidate_EveryBloodTypeAndKind(t *testing.T) {
	for _, b := range []string{"O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-", "unknown"} {
		_, errs := childrecord.Validate(childrecord.Content{BloodType: s(b)})
		require.Empty(t, errs, b)
	}
	for _, k := range []string{"medication", "food", "other"} {
		_, errs := childrecord.Validate(childrecord.Content{Allergies: []childrecord.Allergy{{Name: "x", Kind: s(k)}}})
		require.Empty(t, errs, k)
	}
}

func TestEqual(t *testing.T) {
	a := childrecord.Content{Allergies: []childrecord.Allergy{{Name: "x"}}}
	b := childrecord.Content{Allergies: []childrecord.Allergy{{Name: "x"}}, Conditions: []childrecord.Condition{}}
	require.True(t, childrecord.Equal(a, b))
	require.True(t, childrecord.Equal(childrecord.Content{}, childrecord.Content{Allergies: []childrecord.Allergy{}}))
	b.Allergies[0].Name = "y"
	require.False(t, childrecord.Equal(a, b))
	require.False(t, childrecord.Equal(a, childrecord.Content{BloodType: s("O+")}))
}
