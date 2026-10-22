package vaccination

import (
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// The limits of data-model.md, the same as the CHECKs of migration 0028.
const (
	maxCustomName = 100
	maxLot        = 60
	maxPlace      = 120
	maxNotes      = 500
	minDose       = 1
	maxDose       = 20
)

// Validate cleans an Input and checks it. `today` is the server's date; a dose may be dated up to one day after it, because the server
// does not know the parent's time zone (the form already blocks tomorrow with the device's own date). `birth` is the child's birth
// date. The messages are fixed (Spanish, for the screen) and never repeat what was written.
func Validate(in Input, birth, today time.Time) (Cleaned, ValidationErrors) {
	var errs ValidationErrors
	var c Cleaned

	code, custom := strings.TrimSpace(in.VaccineCode), strings.TrimSpace(in.CustomName)
	switch {
	case code == "" && custom == "":
		errs = append(errs, httpx.FieldError{Field: "vaccine", Message: "Elige una vacuna o escribe su nombre."})
	case code != "" && custom != "":
		errs = append(errs, httpx.FieldError{Field: "vaccine", Message: "Elige una vacuna de la lista o escribe otra, no las dos."})
	case code != "":
		c.VaccineCode = &code
	default:
		if utf8.RuneCountInString(custom) > maxCustomName {
			errs = append(errs, httpx.FieldError{Field: "customName", Message: "El nombre puede tener hasta 100 caracteres."})
		} else {
			c.CustomName = &custom
		}
	}

	if on, err := time.Parse("2006-01-02", strings.TrimSpace(in.AppliedOn)); err != nil {
		errs = append(errs, httpx.FieldError{Field: "appliedOn", Message: "Escribe la fecha en que se aplicó."})
	} else {
		limit := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, 1)
		switch {
		case on.After(limit):
			errs = append(errs, httpx.FieldError{Field: "appliedOn", Message: "La fecha de aplicación no puede ser futura."})
		case on.Before(time.Date(birth.Year(), birth.Month(), birth.Day(), 0, 0, 0, 0, time.UTC)):
			errs = append(errs, httpx.FieldError{Field: "appliedOn", Message: "La fecha de aplicación no puede ser anterior al nacimiento."})
		default:
			c.AppliedOn = on
		}
	}

	if in.DoseNumber != nil {
		if *in.DoseNumber < minDose || *in.DoseNumber > maxDose {
			errs = append(errs, httpx.FieldError{Field: "doseNumber", Message: "La dosis es un número del 1 al 20."})
		} else {
			n := *in.DoseNumber
			c.DoseNumber = &n
		}
	}
	c.Lot = optional(&errs, "lot", in.Lot, maxLot, "El lote puede tener hasta 60 caracteres.")
	c.Place = optional(&errs, "place", in.Place, maxPlace, "El lugar puede tener hasta 120 caracteres.")
	c.Notes = optional(&errs, "notes", in.Notes, maxNotes, "La nota puede tener hasta 500 caracteres.")
	return c, errs
}

// optional trims an optional text: empty is nil, too long is an error.
func optional(errs *ValidationErrors, field, value string, max int, message string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	if utf8.RuneCountInString(value) > max {
		*errs = append(*errs, httpx.FieldError{Field: field, Message: message})
		return nil
	}
	return &value
}

// fold lower-cases a name and strips the Spanish accents, so «Varicela» and «varicela» (or «Neumocócica» and «neumococica») are the
// same word when two doses are compared.
func fold(s string) string {
	return strings.Map(func(r rune) rune {
		switch r {
		case 'á', 'Á':
			return 'a'
		case 'é', 'É':
			return 'e'
		case 'í', 'Í':
			return 'i'
		case 'ó', 'Ó':
			return 'o'
		case 'ú', 'Ú', 'ü', 'Ü':
			return 'u'
		case 'ñ', 'Ñ':
			return 'n'
		}
		return r
	}, strings.ToLower(strings.TrimSpace(s)))
}
