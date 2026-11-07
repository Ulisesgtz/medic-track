package cabinet

import (
	"encoding/base64"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/imagecheck"
)

const maxPhotoBytes = 5 << 20

// Validate trims the texts and checks every field of a medicine. The messages are fixed and never repeat what was written.
func Validate(in Input) (Input, ValidationErrors) {
	in.Name = strings.TrimSpace(in.Name)
	in.Strength = strings.TrimSpace(in.Strength)
	in.Note = strings.TrimSpace(in.Note)
	var errs ValidationErrors
	add := func(field, message string) { errs = append(errs, httpx.FieldError{Field: field, Message: message}) }

	switch n := utf8.RuneCountInString(in.Name); {
	case n == 0:
		add("name", "Escribe el nombre del medicamento.")
	case n > 120:
		add("name", "El nombre puede tener hasta 120 caracteres.")
	}
	if utf8.RuneCountInString(in.Strength) > 60 {
		add("strength", "La concentración puede tener hasta 60 caracteres.")
	}
	if in.Quantity < 0 || in.Quantity > 999 {
		add("quantity", "La cantidad va de 0 a 999.")
	}
	if !slices.Contains(Units, in.Unit) {
		add("unit", "Elige la unidad.")
	}
	if !validExpires(in.Expires) {
		add("expires", "Elige el mes y el año de la caducidad.")
	}
	if utf8.RuneCountInString(in.Note) > 500 {
		add("note", "La nota puede tener hasta 500 caracteres.")
	}
	return in, errs
}

func validExpires(e Expires) bool {
	if e.Year < 2000 || e.Year > 2100 || e.Month < 1 || e.Month > 12 {
		return false
	}
	if e.Day == nil {
		return true
	}
	d := *e.Day
	// A date that exists in its month: 31 feb comes back as another month.
	return d >= 1 && d <= 31 && time.Date(e.Year, time.Month(e.Month), d, 0, 0, 0, 0, time.UTC).Day() == d
}

// DecodePhoto turns the base64 a client sent into the image bytes: an image the app accepts and no bigger than 5 MiB.
func DecodePhoto(photoBase64 string) ([]byte, ValidationErrors) {
	bad := ValidationErrors{{Field: "photoBase64", Message: "La foto no es una imagen válida."}}
	raw, err := base64.StdEncoding.DecodeString(photoBase64)
	if err != nil || len(raw) == 0 {
		return nil, bad
	}
	if len(raw) > maxPhotoBytes {
		return nil, ValidationErrors{{Field: "photoBase64", Message: "La foto puede pesar hasta 5 MB."}}
	}
	if !imagecheck.LooksLike(raw) {
		return nil, bad
	}
	return raw, nil
}
