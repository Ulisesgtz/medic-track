// Package childrecord is the child's record sheet (specs/073): what doesn't change from consultation to consultation —
// allergies, blood type, permanent conditions, the pediatrician and a general note — written by the parent and shown as it was
// written. It never compares, warns or classifies (Principio I) and its text only travels in request and response bodies
// (Principio II): never in an address, a log or an error_logs row.
package childrecord

import (
	"errors"
	"strings"
	"time"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// The caps of the sheet.
const (
	MaxEntries     = 30
	MaxNameLen     = 120
	MaxNoteLen     = 300
	MaxGeneralNote = 1000
	MaxPhoneLen    = 30
)

// Allergy kinds and blood types accepted.
var (
	kinds      = map[string]bool{"medication": true, "food": true, "other": true}
	bloodTypes = map[string]bool{"O+": true, "O-": true, "A+": true, "A-": true, "B+": true, "B-": true, "AB+": true, "AB-": true, "unknown": true}
)

// ErrNotFound is a child that doesn't exist.
var ErrNotFound = errors.New("child not found")

// Allergy is one allergy as the parent wrote it.
type Allergy struct {
	Name string
	Kind *string
	Note *string
}

// Condition is one permanent condition as the parent wrote it.
type Condition struct {
	Name string
	Note *string
}

// Pediatrician is the head pediatrician; every part is optional.
type Pediatrician struct {
	Name, Phone, Office *string
}

// Content is what the parent writes: the whole sheet, without its bookkeeping.
type Content struct {
	BloodType    *string
	GeneralNote  *string
	Pediatrician *Pediatrician
	Allergies    []Allergy
	Conditions   []Condition
}

// Record is a stored sheet. Version is 0 and Exists false when the child has none.
type Record struct {
	Exists  bool
	Version int
	Content
	UpdatedAt *time.Time
	// UpdatedBy is the first name of whoever saved it last (nil if that account no longer exists).
	UpdatedBy *string
}

// ValidationErrors are the invalid fields, with fixed messages that never repeat what was written.
type ValidationErrors []httpx.FieldError

func (v ValidationErrors) Error() string {
	fields := make([]string, 0, len(v))
	for _, e := range v {
		fields = append(fields, e.Field)
	}
	return "invalid fields: " + strings.Join(fields, ", ")
}

// ConflictError is a save made over a version that is no longer the stored one; Current is the stored sheet.
type ConflictError struct {
	Current *Record
}

func (c *ConflictError) Error() string { return "the record was saved by someone else meanwhile" }
