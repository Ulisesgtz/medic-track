package childdevice

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

const (
	// LinkLifetime is how long a link waits to be opened.
	LinkLifetime = 24 * time.Hour
	// MaxLinksPerChild caps the devices plus the pending links of one child.
	MaxLinksPerChild = 3
	// CredentialIdle is how long a device can go unused before its credential stops working.
	CredentialIdle = 90 * 24 * time.Hour
	// RotateEvery is how often the device is asked to renew its credential.
	RotateEvery = 7 * 24 * time.Hour
	// RotateGrace is how long the previous credential still works after a rotation (two tabs, a retry after a lost answer).
	RotateGrace = 24 * time.Hour
	// TouchEvery is the least time between two writes of last_seen_at.
	TouchEvery = 10 * time.Minute
	// MaxNameRunes is the longest name a parent can give a device.
	MaxNameRunes = 40
)

// Link statuses.
const (
	StatusPending = "pending"
	StatusActive  = "active"
	StatusRevoked = "revoked"
)

// Link is one access of a phone to a child, as the parent sees it. It never carries a hash or a secret.
type Link struct {
	ID             uuid.UUID
	ChildID        uuid.UUID
	Name           string
	Status         string
	CreatedAt      time.Time
	RedeemedAt     *time.Time
	LastSeenAt     *time.Time
	ExpiresAt      time.Time
	ReminderDetail *string
}

// Principal is the device behind a request: who is acting and over which child.
type Principal struct {
	LinkID         uuid.UUID
	ChildID        uuid.UUID
	OwnerAccountID uuid.UUID
	ChildFirstName string
	DeviceName     string
	ReminderDetail *string
	// RotateAfter is when the device should ask for a new credential.
	RotateAfter time.Time
}

var (
	// ErrNotFound is any credential or link that doesn't work: unknown, used, expired, canceled, removed, idle for too long. It is
	// always the same error so nothing tells which.
	ErrNotFound = errors.New("child device link not found")
	// ErrInvalidName is a device name that is empty after cleaning or longer than MaxNameRunes.
	ErrInvalidName = errors.New("invalid device name")
	// ErrChildNotFound is a child that doesn't exist.
	ErrChildNotFound = errors.New("child not found")
)

// ErrPlanRequired: making a link needs the paid plan.
type ErrPlanRequired struct{}

func (ErrPlanRequired) Error() string { return "the child device access needs the paid plan" }

// ErrLimit: the child already has the most devices and pending links.
type ErrLimit struct{ Limit int }

func (e ErrLimit) Error() string { return "the child already has the most devices" }
