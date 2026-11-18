package childrecord

import (
	"fmt"
	"reflect"
	"strings"
	"unicode/utf8"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Validate cleans a Content (trims, empty becomes nil) and checks it. The errors name the field and never the value.
func Validate(in Content) (Content, ValidationErrors) {
	var errs ValidationErrors
	bad := func(field, message string) { errs = append(errs, httpx.FieldError{Field: field, Message: message}) }
	out := Content{Allergies: []Allergy{}, Conditions: []Condition{}}

	out.BloodType = clean(in.BloodType)
	if out.BloodType != nil && !bloodTypes[*out.BloodType] {
		bad("bloodType", "Elige un tipo de sangre de la lista.")
	}
	out.GeneralNote = clean(in.GeneralNote)
	if tooLong(out.GeneralNote, MaxGeneralNote) {
		bad("generalNote", "La nota es demasiado larga.")
	}

	if p := in.Pediatrician; p != nil {
		cp := Pediatrician{Name: clean(p.Name), Phone: clean(p.Phone), Office: clean(p.Office)}
		if tooLong(cp.Name, MaxNameLen) {
			bad("pediatrician.name", "El nombre es demasiado largo.")
		}
		if tooLong(cp.Phone, MaxPhoneLen) {
			bad("pediatrician.phone", "El teléfono es demasiado largo.")
		} else if cp.Phone != nil && !validPhone(*cp.Phone) {
			bad("pediatrician.phone", "El teléfono solo puede tener números, espacios y + - ( ) .")
		}
		if tooLong(cp.Office, MaxNoteLen) {
			bad("pediatrician.office", "El consultorio es demasiado largo.")
		}
		if cp.Name != nil || cp.Phone != nil || cp.Office != nil {
			out.Pediatrician = &cp
		}
	}

	if len(in.Allergies) > MaxEntries {
		bad("allergies", "Hay demasiadas alergias.")
	}
	for i, a := range in.Allergies {
		field := fmt.Sprintf("allergies[%d]", i)
		ca := Allergy{Name: strings.TrimSpace(a.Name), Kind: clean(a.Kind), Note: clean(a.Note)}
		checkName(ca.Name, field+".name", bad)
		if ca.Kind != nil && !kinds[*ca.Kind] {
			bad(field+".kind", "Elige un tipo de la lista.")
		}
		if tooLong(ca.Note, MaxNoteLen) {
			bad(field+".note", "La nota es demasiado larga.")
		}
		out.Allergies = append(out.Allergies, ca)
	}

	if len(in.Conditions) > MaxEntries {
		bad("conditions", "Hay demasiados padecimientos.")
	}
	for i, c := range in.Conditions {
		field := fmt.Sprintf("conditions[%d]", i)
		cc := Condition{Name: strings.TrimSpace(c.Name), Note: clean(c.Note)}
		checkName(cc.Name, field+".name", bad)
		if tooLong(cc.Note, MaxNoteLen) {
			bad(field+".note", "La nota es demasiado larga.")
		}
		out.Conditions = append(out.Conditions, cc)
	}
	return out, errs
}

func checkName(name, field string, bad func(field, message string)) {
	switch {
	case name == "":
		bad(field, "Escribe el nombre.")
	case utf8.RuneCountInString(name) > MaxNameLen:
		bad(field, "El nombre es demasiado largo.")
	}
}

// clean trims a text; an empty one is nil.
func clean(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}

func tooLong(s *string, max int) bool { return s != nil && utf8.RuneCountInString(*s) > max }

// validPhone allows digits, spaces and + - ( ) . — free format, as the parent writes it.
func validPhone(s string) bool {
	for _, r := range s {
		if (r < '0' || r > '9') && !strings.ContainsRune(" +-().", r) {
			return false
		}
	}
	return true
}

// Equal reports whether two cleaned contents are the same, so saving without changes doesn't count as an update.
func Equal(a, b Content) bool {
	norm := func(c Content) Content {
		if c.Allergies == nil {
			c.Allergies = []Allergy{}
		}
		if c.Conditions == nil {
			c.Conditions = []Condition{}
		}
		return c
	}
	return reflect.DeepEqual(norm(a), norm(b))
}
