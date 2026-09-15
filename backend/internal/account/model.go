// Package account implements the Account and Child domain: creation, validation,
// and the freemium child-limit business rule.
package account

import (
	"time"

	"github.com/google/uuid"
)

// Plan represents an account's subscription tier.
type Plan string

const (
	PlanFree Plan = "free"
	PlanPaid Plan = "paid"
)

// Account represents a parent/guardian who registers in PediTrack.
type Account struct {
	ID          uuid.UUID
	FirstName   string
	LastName    string
	Email       string
	CountryCode *string
	StateCode   *string
	Plan        Plan
	CreatedAt   time.Time
	Children    []Child
}

// Child represents a child associated with an Account.
// Per FR-006a, once persisted, a Child's FirstName, LastName and BirthDate
// are immutable and it can never be deleted in this scope.
type Child struct {
	ID        uuid.UUID
	AccountID uuid.UUID
	FirstName string
	LastName  string
	BirthDate time.Time
	Height    *float64
	Weight    *float64
	CreatedAt time.Time
}
