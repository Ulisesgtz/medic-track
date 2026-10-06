// Package reminder sends a Web Push reminder at the scheduled time of every dose that
// hasn't been marked as taken, to every device on which the tutor turned reminders on
// (specs/011-recordatorios-push). It only repeats the schedule the tutor registered —
// never an indication, a dose or a medical judgement (constitution, Principio I).
package reminder

import (
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// DetailMode is what a reminder shows: the medication and child, or a generic text.
type DetailMode string

const (
	DetailDetailed DetailMode = "detailed"
	DetailGeneric  DetailMode = "generic"
)

// Device is a browser or installed PWA on which a tutor turned reminders on.
type Device struct {
	ID          uuid.UUID
	AccountID   uuid.UUID
	Endpoint    string
	P256dh      string
	Auth        string
	Active      bool
	ActivatedAt time.Time
}

// DueDose is a dose claimed for the reminder of ONE person (specs/032: a dose is reminded to each person with access and
// an active device, once each), with what that reminder needs to say.
type DueDose struct {
	DoseID         uuid.UUID
	ConsultationID uuid.UUID
	// AccountID is the person this reminder is for (the account whose devices receive it), not the child's owner.
	AccountID      uuid.UUID
	ScheduledAt    time.Time
	MedicationName string
	ChildFirstName string
	// Detail is that person's own choice; nil while they haven't chosen (treated as generic,
	// the most private option).
	Detail *DetailMode
}

// Payload is the JSON encrypted and pushed to a device; the service worker turns it into the
// notification. In generic mode Medication and Child are not sent at all, not even encrypted.
type Payload struct {
	Kind           DetailMode `json:"kind"`
	DoseID         string     `json:"doseId"`
	ConsultationID string     `json:"consultationId"`
	ScheduledAt    string     `json:"scheduledAt"`
	Medication     string     `json:"medication,omitempty"`
	Child          string     `json:"child,omitempty"`
	ActionToken    string     `json:"actionToken,omitempty"`
}

var (
	// ErrRemindersUnavailable: the backend has no VAPID keys, so no device can be subscribed.
	ErrRemindersUnavailable = errors.New("reminders are not available on this server")
	// ErrInvalidActionToken covers every reason a "Tomada" token is refused: bad signature,
	// expired, device inactive or not the dose's account. One error on purpose, so a caller
	// learns nothing about which one it was.
	ErrInvalidActionToken = errors.New("invalid action token")
)

// FieldError is a request field that failed validation (the API-wide shape, httpx).
type FieldError = httpx.FieldError

// ValidationErrors is every field that failed, returned together.
type ValidationErrors []FieldError

func (v ValidationErrors) Error() string {
	if len(v) == 0 {
		return "validation error"
	}
	return v[0].Field + ": " + v[0].Message
}
