// Package childmerge joins a child the invited person registered by themselves with the same child of the family
// (specs/074-unir-hijo-duplicado). It only suggests by name and never decides which record is right (Principio I): the
// person pairs the children and chooses every datum that differs. Names and values only travel in request and response
// bodies, never in an address or in error_logs (Principio II).
package childmerge

import (
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/childrecord"
)

// Fields that can differ between two children (the keys of `choices`).
const (
	FieldFirstName          = "firstName"
	FieldLastName           = "lastName"
	FieldBirthDate          = "birthDate"
	FieldHeight             = "height"
	FieldWeight             = "weight"
	FieldGrowthReferenceSex = "growthReferenceSex"
	FieldBloodType          = "bloodType"
	FieldPediatrician       = "pediatrician"
	FieldGeneralNote        = "generalNote"
)

// RecordFields are the fields of the sheet: they only count when both children have one.
var recordFields = map[string]bool{FieldBloodType: true, FieldPediatrician: true, FieldGeneralNote: true}

// IsRecordField is whether a field belongs to the child's sheet (spec 073).
func IsRecordField(f string) bool { return recordFields[f] }

// ChildData is what pairing needs of a child.
type ChildData struct {
	ID                 uuid.UUID
	FirstName          string
	LastName           string
	BirthDate          time.Time
	Height             *float64
	Weight             *float64
	GrowthReferenceSex *string
	CreatedAt          time.Time
	// Record is the sheet of the child; nil when it has none.
	Record *RecordData
}

// RecordData is the part of the sheet that can differ (the lists are merged, not chosen).
type RecordData struct {
	BloodType    *string
	Pediatrician *childrecord.Pediatrician
	GeneralNote  *string
}

// Pair is a suggested pairing.
type Pair struct {
	OwnChildID    uuid.UUID
	FamilyChildID uuid.UUID
	Reason        string
}

// ReasonSameName is the only reason a pair is suggested.
const ReasonSameName = "same_name"

// fold lowers case, strips the Spanish accents and collapses spaces.
func fold(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	return strings.Map(func(r rune) rune {
		switch r {
		case 'á', 'Á', 'à', 'À', 'ä', 'Ä':
			return 'a'
		case 'é', 'É', 'è', 'È', 'ë', 'Ë':
			return 'e'
		case 'í', 'Í', 'ì', 'Ì', 'ï', 'Ï':
			return 'i'
		case 'ó', 'Ó', 'ò', 'Ò', 'ö', 'Ö':
			return 'o'
		case 'ú', 'Ú', 'ù', 'Ù', 'ü', 'Ü':
			return 'u'
		case 'ñ', 'Ñ':
			return 'n'
		}
		return r
	}, strings.ToLower(s))
}

// SuggestPairs suggests which own child is the same as which child of the family: same name and, when both have a last name,
// the same last name, ignoring case, accents and extra spaces. It never looks at the birth date, and every child (own or of
// the family) appears at most once; the own children go in the order they were registered.
func SuggestPairs(own, family []ChildData) []Pair {
	ordered := append([]ChildData(nil), own...)
	sort.SliceStable(ordered, func(i, j int) bool {
		if !ordered[i].CreatedAt.Equal(ordered[j].CreatedAt) {
			return ordered[i].CreatedAt.Before(ordered[j].CreatedAt)
		}
		return ordered[i].ID.String() < ordered[j].ID.String()
	})
	famOrdered := append([]ChildData(nil), family...)
	sort.SliceStable(famOrdered, func(i, j int) bool {
		if !famOrdered[i].CreatedAt.Equal(famOrdered[j].CreatedAt) {
			return famOrdered[i].CreatedAt.Before(famOrdered[j].CreatedAt)
		}
		return famOrdered[i].ID.String() < famOrdered[j].ID.String()
	})
	used := map[uuid.UUID]bool{}
	pairs := []Pair{}
	for _, o := range ordered {
		for _, f := range famOrdered {
			if used[f.ID] || !sameName(o, f) {
				continue
			}
			used[f.ID] = true
			pairs = append(pairs, Pair{OwnChildID: o.ID, FamilyChildID: f.ID, Reason: ReasonSameName})
			break
		}
	}
	return pairs
}

func sameName(a, b ChildData) bool {
	if fold(a.FirstName) != fold(b.FirstName) || fold(a.FirstName) == "" {
		return false
	}
	la, lb := fold(a.LastName), fold(b.LastName)
	if la != "" && lb != "" && la != lb {
		return false
	}
	return true
}

func textOf(p *string) string {
	if p == nil {
		return ""
	}
	return strings.TrimSpace(*p)
}

func sameFloat(a, b *float64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func pedBlock(p *childrecord.Pediatrician) [3]string {
	if p == nil {
		return [3]string{}
	}
	return [3]string{textOf(p.Name), textOf(p.Phone), textOf(p.Office)}
}

// Differences lists the fields in which the two children differ, in the order of the contract. The sheet's fields only count
// when both have a sheet; the pediatrician is compared as one block.
func Differences(own, family ChildData) []string {
	out := []string{}
	if strings.TrimSpace(own.FirstName) != strings.TrimSpace(family.FirstName) {
		out = append(out, FieldFirstName)
	}
	if strings.TrimSpace(own.LastName) != strings.TrimSpace(family.LastName) {
		out = append(out, FieldLastName)
	}
	if !own.BirthDate.Equal(family.BirthDate) {
		out = append(out, FieldBirthDate)
	}
	if !sameFloat(own.Height, family.Height) {
		out = append(out, FieldHeight)
	}
	if !sameFloat(own.Weight, family.Weight) {
		out = append(out, FieldWeight)
	}
	if textOf(own.GrowthReferenceSex) != textOf(family.GrowthReferenceSex) {
		out = append(out, FieldGrowthReferenceSex)
	}
	if own.Record != nil && family.Record != nil {
		if textOf(own.Record.BloodType) != textOf(family.Record.BloodType) {
			out = append(out, FieldBloodType)
		}
		if pedBlock(own.Record.Pediatrician) != pedBlock(family.Record.Pediatrician) {
			out = append(out, FieldPediatrician)
		}
		if textOf(own.Record.GeneralNote) != textOf(family.Record.GeneralNote) {
			out = append(out, FieldGeneralNote)
		}
	}
	return out
}
