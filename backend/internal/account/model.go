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
	// ConsultationSharing and SharedProfiles are the person's own consultations (specs/058): whether they share theirs with
	// the Tutors of their family, and who shares with them. Filled by the reads that fill Family.
	ConsultationSharing ConsultationSharing
	SharedProfiles      []SharedProfile
	// DeletionScheduledFor is when the account will be deleted, if its owner asked for it (specs/070); nil otherwise.
	// Filled by GetByClerkUserID.
	DeletionScheduledFor *time.Time
	// FirstUseGuide is the state of the first-use guide on the home (specs/071). Filled by the reads that fill
	// DisclaimerAccepted; the zero value is "not closed, no consultation".
	FirstUseGuide FirstUseGuide
	// HiddenChildren are the account's own children the person hid (specs/074-unir-hijo-duplicado): effective only while the
	// person is an active Tutor or Caregiver of a family (childhidden). They are NOT in Children.
	HiddenChildren []HiddenChild
}

// HiddenChild is a child the person hid, as the «Hijos ocultos» list shows it.
type HiddenChild struct {
	ID        uuid.UUID
	FirstName string
}

// ChildMerge is a union that gave this child the records of another one (specs/074): when and who (first name only; nil if that
// account was deleted).
type ChildMerge struct {
	At          time.Time
	ByFirstName *string
}

// FirstUseGuide is what the server knows for the first-use guide of the home (specs/071-primer-uso-guiado).
type FirstUseGuide struct {
	// Dismissed is whether the account closed the guide with «Ahora no».
	Dismissed bool
	// FirstConsultation is the account's oldest consultation, a child's or its own; nil if it has none.
	FirstConsultation *FirstConsultation
}

// FirstConsultation names the oldest consultation of an account: step 1 of the guide is done once one exists.
type FirstConsultation struct {
	ID         uuid.UUID
	DoctorName string
	// ChildID is nil for a consultation of the person themselves (specs/058).
	ChildID *uuid.UUID
}

// FamilyMembership is an account's place in the family of another account.
type FamilyMembership struct {
	Role           string
	OwnerAccountID uuid.UUID
	OwnerName      string
	OwnerPlan      Plan
	// DeletionScheduledFor is set when the family's owner asked to delete her account (specs/070): the family's children
	// are deleted on that date.
	DeletionScheduledFor *time.Time
}

// ReadOnly: the invited person is read-only when the family's owner is no longer on the paid plan, or asked to delete her
// account (they still see and mark until the date, specs/070).
func (f FamilyMembership) ReadOnly() bool {
	return f.OwnerPlan != PlanPaid || f.DeletionScheduledFor != nil
}

// Child represents a child associated with an Account.
// A Child can never be deleted. Its data can be corrected (specs/064-editar-datos-hijo, which replaces FR-006a of
// specs/001): height and weight on every plan, FirstName, LastName and BirthDate only on the paid plan.
type Child struct {
	ID        uuid.UUID
	AccountID uuid.UUID
	FirstName string
	LastName  string
	BirthDate time.Time
	Height    *float64
	Weight    *float64
	CreatedAt time.Time
	// CorrectedAt and CorrectedBy (the first name of who corrected it) are the trace of the last correction of the child's
	// data (specs/064-editar-datos-hijo); nil if it was never corrected.
	CorrectedAt *time.Time
	CorrectedBy *string
	// Merges are the unions that added records to this child, oldest first (specs/074); empty if none.
	Merges []ChildMerge
	// Role is the reader's role over this child: "" (or "owner") for the account's own children, else the
	// role of the family membership that shares it. Plan is the plan of the family the child belongs to (the
	// owner account's) and ReadOnly whether the reader can only see and mark (specs/032-compartir-con-familia).
	Role     string
	Plan     Plan
	ReadOnly bool
}
