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
	// ClerkUserID is the id of the Clerk user this account is linked to. Nil
	// for an account created before authentication existed (specs/008),
	// until its tutor's first post-authentication login links it.
	ClerkUserID *string
	// DisclaimerAccepted is whether the account has acknowledged CurrentDisclaimerVersion of the
	// "Antes de empezar" notice (specs/010-registro-aceptacion-aviso). Filled by the repository's reads.
	DisclaimerAccepted bool
	// ReminderDetail is what this account's dose reminders show: "detailed" (medication and child)
	// or "generic". Nil until the tutor chooses, on the first activation (specs/011-recordatorios-push).
	ReminderDetail *string
	// Family is set (only by GetByClerkUserID) when the account is an invited person of another account's family
	// (specs/032-compartir-con-familia); Children then also lists the children shared with it.
	Family *FamilyMembership
}

// FamilyMembership is an account's place in the family of another account.
type FamilyMembership struct {
	Role           string
	OwnerAccountID uuid.UUID
	OwnerName      string
	OwnerPlan      Plan
}

// ReadOnly: the invited person is read-only when the family's owner is no longer on the paid plan.
func (f FamilyMembership) ReadOnly() bool { return f.OwnerPlan != PlanPaid }

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
	// Role is the reader's role over this child: "" (or "owner") for the account's own children, else the
	// role of the family membership that shares it. Plan is the plan of the family the child belongs to (the
	// owner account's) and ReadOnly whether the reader can only see and mark (specs/032-compartir-con-familia).
	Role     string
	Plan     Plan
	ReadOnly bool
}
