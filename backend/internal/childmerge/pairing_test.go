package childmerge_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/childmerge"
	"github.com/Ulisesgtz/medic-track/backend/internal/childrecord"
)

func str(s string) *string   { return &s }
func num(f float64) *float64 { return &f }

var base = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func child(first, last string, created int) childmerge.ChildData {
	return childmerge.ChildData{
		ID: uuid.New(), FirstName: first, LastName: last, CreatedAt: base.Add(time.Duration(created) * time.Hour),
		BirthDate: time.Date(2022, 3, 3, 0, 0, 0, 0, time.UTC),
	}
}

func TestSuggestPairs_FoldsCaseAccentsAndSpaces(t *testing.T) {
	own := []childmerge.ChildData{child("  MATEO ", "López", 0)}
	fam := []childmerge.ChildData{child("mateo", "lopez  ", 0)}
	got := childmerge.SuggestPairs(own, fam)
	require.Len(t, got, 1)
	require.Equal(t, own[0].ID, got[0].OwnChildID)
	require.Equal(t, fam[0].ID, got[0].FamilyChildID)
	require.Equal(t, "same_name", got[0].Reason)
}

func TestSuggestPairs_DifferentLastNameOrFirstName(t *testing.T) {
	require.Empty(t, childmerge.SuggestPairs([]childmerge.ChildData{child("Mateo", "López", 0)}, []childmerge.ChildData{child("Mateo", "Pérez", 0)}))
	require.Empty(t, childmerge.SuggestPairs([]childmerge.ChildData{child("Mateo", "López", 0)}, []childmerge.ChildData{child("Luis", "López", 0)}))
	require.Empty(t, childmerge.SuggestPairs([]childmerge.ChildData{child("", "López", 0)}, []childmerge.ChildData{child("", "López", 0)}))
}

func TestSuggestPairs_MissingLastNameStillMatches(t *testing.T) {
	require.Len(t, childmerge.SuggestPairs([]childmerge.ChildData{child("Mateo", "", 0)}, []childmerge.ChildData{child("Mateo", "López", 0)}), 1)
}

func TestSuggestPairs_NeverUsesTheBirthDate(t *testing.T) {
	a, b := child("Mateo", "López", 0), child("Mateo", "López", 0)
	b.BirthDate = time.Date(2010, 1, 1, 0, 0, 0, 0, time.UTC)
	require.Len(t, childmerge.SuggestPairs([]childmerge.ChildData{a}, []childmerge.ChildData{b}), 1)
}

func TestSuggestPairs_EachChildAtMostOnceInOrderOfRegistration(t *testing.T) {
	young := child("Mateo", "López", 5)
	old := child("Mateo", "López", 1)
	famOnly := child("Mateo", "López", 0)
	got := childmerge.SuggestPairs([]childmerge.ChildData{young, old}, []childmerge.ChildData{famOnly})
	require.Len(t, got, 1)
	require.Equal(t, old.ID, got[0].OwnChildID, "the one registered first takes the pair")
}

func TestSuggestPairs_TieOnDateGoesById(t *testing.T) {
	a, b := child("Ana", "X", 0), child("Ana", "X", 0)
	fa, fb := child("Ana", "X", 0), child("Ana", "X", 0)
	got := childmerge.SuggestPairs([]childmerge.ChildData{a, b}, []childmerge.ChildData{fa, fb})
	require.Len(t, got, 2)
	require.NotEqual(t, got[0].FamilyChildID, got[1].FamilyChildID)
}

func TestDifferences_NoneWhenEqual(t *testing.T) {
	a, b := child("Mateo", "López", 0), child("Mateo", "López", 0)
	require.Empty(t, childmerge.Differences(a, b))
	// a record on one side only never counts
	a.Record = &childmerge.RecordData{BloodType: str("O+")}
	require.Empty(t, childmerge.Differences(a, b))
}

func TestDifferences_AllFieldsInContractOrder(t *testing.T) {
	a, b := child("Mateo", "López", 0), child("Mateito", "Lopez", 0)
	b.BirthDate = a.BirthDate.AddDate(0, 0, 1)
	a.Height, b.Height = num(90), num(91)
	a.Weight = num(13) // the other has none: still a difference
	a.GrowthReferenceSex, b.GrowthReferenceSex = str("male"), str("female")
	a.Record = &childmerge.RecordData{BloodType: str("O+"), GeneralNote: str("x"), Pediatrician: &childrecord.Pediatrician{Name: str("Dra. Ruiz")}}
	b.Record = &childmerge.RecordData{BloodType: str("A+"), GeneralNote: str("y"), Pediatrician: &childrecord.Pediatrician{Name: str("Dr. Paz")}}
	require.Equal(t, []string{"firstName", "lastName", "birthDate", "height", "weight", "growthReferenceSex", "bloodType", "pediatrician", "generalNote"},
		childmerge.Differences(a, b))
	require.True(t, childmerge.IsRecordField("bloodType"))
	require.False(t, childmerge.IsRecordField("height"))
}

func TestDifferences_PediatricianBlockIgnoresEmptyAndSpaces(t *testing.T) {
	a, b := child("A", "B", 0), child("A", "B", 0)
	a.Record = &childmerge.RecordData{Pediatrician: nil, GeneralNote: str("  ")}
	b.Record = &childmerge.RecordData{Pediatrician: &childrecord.Pediatrician{Name: str(" ")}}
	require.Empty(t, childmerge.Differences(a, b))
	b.Record.Pediatrician.Phone = str("123")
	require.Equal(t, []string{"pediatrician"}, childmerge.Differences(a, b))
}

func TestSuggestPairs_FoldsEveryAccentOfSpanishAndFriends(t *testing.T) {
	own := []childmerge.ChildData{child("ÁÀÄ éèë íìï óòö úùü Ñ", "X", 0)}
	fam := []childmerge.ChildData{child("aaa eee iii ooo uuu n", "x", 0)}
	require.Len(t, childmerge.SuggestPairs(own, fam), 1)
}
