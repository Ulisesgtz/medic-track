package childprofile

import (
	"strings"
	"time"

	"github.com/Ulisesgtz/medic-track/backend/internal/account"
	"github.com/Ulisesgtz/medic-track/backend/internal/growth"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Validate cleans an Input and checks it, with the rules of the signup (specs/001: the names, a birth date not in the future,
// a positive height and weight) and, for the measurement, those of the growth record (specs/063) against the NEW birth date.
// `today` is the server's date; a date may be up to one day after it, because the server doesn't know the parent's time zone.
// The messages are fixed and never repeat what was written.
func Validate(in Input, today time.Time) (Cleaned, ValidationErrors) {
	var errs ValidationErrors
	c := Cleaned{FirstName: strings.TrimSpace(in.FirstName), LastName: strings.TrimSpace(in.LastName), Height: in.Height, Weight: in.Weight}

	for _, f := range []struct{ field, value, empty, invalid string }{
		{"firstName", c.FirstName, "Escribe el nombre.", "El nombre solo puede tener letras, espacios, guiones y apóstrofes, hasta 100."},
		{"lastName", c.LastName, "Escribe el apellido.", "El apellido solo puede tener letras, espacios, guiones y apóstrofes, hasta 100."},
	} {
		switch {
		case f.value == "":
			errs = append(errs, httpx.FieldError{Field: f.field, Message: f.empty})
		case account.ValidateName(f.value) != "":
			errs = append(errs, httpx.FieldError{Field: f.field, Message: f.invalid})
		}
	}

	limit := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, 1)
	birthOK := false
	if birth, err := time.Parse("2006-01-02", strings.TrimSpace(in.BirthDate)); err != nil {
		errs = append(errs, httpx.FieldError{Field: "birthDate", Message: "Escribe la fecha de nacimiento."})
	} else if birth.After(limit) {
		errs = append(errs, httpx.FieldError{Field: "birthDate", Message: "La fecha de nacimiento no puede ser futura."})
	} else {
		c.BirthDate, birthOK = birth, true
	}

	if c.Height != nil && *c.Height <= 0 {
		errs = append(errs, httpx.FieldError{Field: "height", Message: "Escribe la talla en centímetros."})
	}
	if c.Weight != nil && *c.Weight <= 0 {
		errs = append(errs, httpx.FieldError{Field: "weight", Message: "Escribe el peso en kilogramos."})
	}

	if in.Measurement != nil {
		switch {
		case c.Height == nil && c.Weight == nil:
			errs = append(errs, httpx.FieldError{Field: "measurement", Message: "Escribe la talla, el peso o los dos para anotarlos como medida."})
		case birthOK:
			m, merrs := growth.Validate(growth.Input{MeasuredOn: in.Measurement.MeasuredOn, WeightKg: c.Weight, HeightCm: c.Height}, c.BirthDate, today)
			for _, e := range merrs {
				errs = append(errs, httpx.FieldError{Field: "measurement." + e.Field, Message: e.Message})
			}
			if len(merrs) == 0 {
				c.Measurement = &m
			}
		}
	}
	return c, errs
}

// identityChanged: the names or the birth date are not those saved (the only changes that need the paid plan).
func identityChanged(cur current, c Cleaned) bool {
	return cur.firstName != c.FirstName || cur.lastName != c.LastName || !cur.birthDate.Equal(c.BirthDate)
}

// anythingChanged: some datum of the child is not the one saved (a correction to stamp).
func anythingChanged(cur current, c Cleaned) bool {
	return identityChanged(cur, c) || !sameValue(cur.height, c.Height) || !sameValue(cur.weight, c.Weight)
}

func sameValue(a, b *float64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}
