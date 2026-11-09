package growth

import (
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// The limits of data-model.md, the same as the CHECKs of migration 0034. They are what can be written down, not a judgement
// about a child.
const (
	minWeight = 0.3
	maxWeight = 200
	minHeight = 30
	maxHeight = 220
	maxNote   = 300
)

// Validate cleans an Input and checks it. `today` is the server's date; a measurement may be dated up to one day after it,
// because the server does not know the parent's time zone (the form already blocks tomorrow with the device's own date), as the
// vaccination card does. `birth` is the child's birth date. The messages are fixed and never repeat what was written.
func Validate(in Input, birth, today time.Time) (Cleaned, ValidationErrors) {
	var errs ValidationErrors
	var c Cleaned

	if on, err := time.Parse("2006-01-02", strings.TrimSpace(in.MeasuredOn)); err != nil {
		errs = append(errs, httpx.FieldError{Field: "measuredOn", Message: "Escribe la fecha de la medida."})
	} else {
		limit := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, 1)
		switch {
		case on.After(limit):
			errs = append(errs, httpx.FieldError{Field: "measuredOn", Message: "La fecha no puede ser futura."})
		case on.Before(time.Date(birth.Year(), birth.Month(), birth.Day(), 0, 0, 0, 0, time.UTC)):
			errs = append(errs, httpx.FieldError{Field: "measuredOn", Message: "La fecha no puede ser anterior al nacimiento."})
		default:
			c.MeasuredOn = on
		}
	}

	if in.WeightKg == nil && in.HeightCm == nil {
		errs = append(errs, httpx.FieldError{Field: "weightKg", Message: "Escribe el peso, la talla o los dos."})
	}
	if in.WeightKg != nil {
		if v := *in.WeightKg; !inRange(v, minWeight, maxWeight) || !hasDecimals(v, 2) {
			errs = append(errs, httpx.FieldError{Field: "weightKg", Message: "Escribe el peso en kilogramos, entre 0.3 y 200, con hasta 2 decimales."})
		} else {
			c.WeightKg = &v
		}
	}
	if in.HeightCm != nil {
		if v := *in.HeightCm; !inRange(v, minHeight, maxHeight) || !hasDecimals(v, 1) {
			errs = append(errs, httpx.FieldError{Field: "heightCm", Message: "Escribe la talla en centímetros, entre 30 y 220, con hasta 1 decimal."})
		} else {
			c.HeightCm = &v
		}
	}

	note := strings.TrimSpace(in.Note)
	switch {
	case note == "":
	case utf8.RuneCountInString(note) > maxNote:
		errs = append(errs, httpx.FieldError{Field: "note", Message: "La nota puede tener hasta 300 caracteres."})
	default:
		c.Note = &note
	}
	return c, errs
}

func inRange(v, min, max float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= min && v <= max
}

// hasDecimals is whether v has at most `places` decimals (12.45 has 2; 12.456 has 3), allowing for the binary float.
func hasDecimals(v float64, places int) bool {
	scaled := v * math.Pow10(places)
	return math.Abs(scaled-math.Round(scaled)) < 1e-6
}

// ValidSex is whether s names one of the two WHO tables.
func ValidSex(s string) (Sex, bool) {
	switch Sex(s) {
	case Female, Male:
		return Sex(s), true
	}
	return "", false
}
