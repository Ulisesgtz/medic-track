// Package family implements sharing a family's children and consultations with other people (specs/032-compartir-con-familia):
// a family is its owner account (whose data it is) and the people invited to it, each with a role. Invitations are addressed to
// an e-mail and carry a link with a single-use token; only the account whose verified e-mail is the invited one can accept.
// What each person can then do with a child is decided by internal/access, on every request; this package keeps who is in the
// family and the invitations.
package family

import (
	"time"

	"github.com/google/uuid"
)

// MaxPeople is how many people a family has at most, counting the owner (research R9). Pending invitations take a place.
const MaxPeople = 4

// InvitationTTL is how long an invitation is good for.
const InvitationTTL = 7 * 24 * time.Hour

// Role is what a person invited to a family is.
type Role string

const (
	// RoleTutor: the same access as the owner (a spouse). Cannot be removed by anyone but themselves.
	RoleTutor Role = "tutor"
	// RoleCaregiver: sees everything and marks doses (a grandmother, a nanny).
	RoleCaregiver Role = "caregiver"
	// RoleChild: sees and marks their own doses (Entrega 3: not offered yet).
	RoleChild Role = "child"
)

// InvitationStatus is where an invitation is. "Expired" is derived on read: a pending one whose date passed.
type InvitationStatus string

const (
	StatusPending  InvitationStatus = "pending"
	StatusAccepted InvitationStatus = "accepted"
	StatusDeclined InvitationStatus = "declined"
	StatusCanceled InvitationStatus = "canceled"
	StatusExpired  InvitationStatus = "expired"
)

// Invitation is one invitation to a family. The token itself is never stored (only its hash); it is returned once, when the
// invitation is created or sent again.
type Invitation struct {
	ID              uuid.UUID
	FamilyAccountID uuid.UUID
	Email           string
	Role            Role
	ChildID         *uuid.UUID
	Status          InvitationStatus
	ExpiresAt       time.Time
	CreatedAt       time.Time
	// Token is set only on the invitation just created or resent.
	Token string
}

// Member is a person with access to a family.
type Member struct {
	ID        uuid.UUID
	AccountID uuid.UUID
	// Name is the first name of the person's account (never their e-mail).
	Name    string
	Role    Role
	ChildID *uuid.UUID
	Since   time.Time
}

// Preview is what a person sees of an invitation before accepting it: just what they need to decide.
type Preview struct {
	OwnerName      string
	Role           Role
	ChildFirstName string
	Email          string
	ExpiresAt      time.Time
	EmailMatches   bool
}

// View is the family context of a session (GET /family).
type View struct {
	// Role is "owner" for the owner account (and for a person who shares nothing), else the role of the membership.
	Role           string
	OwnerAccountID uuid.UUID
	OwnerName      string
	// Plan is the owner's plan: the family's.
	Plan string
	// ReadOnly: the person is invited and the family's plan is no longer paid (they see and mark, nothing else).
	ReadOnly    bool
	Members     []MemberView
	Invitations []Invitation
	// Used counts the owner, the active people and the pending invitations; Max is MaxPeople.
	Used, Max int
}

// MemberView is a Member as the session sees it.
type MemberView struct {
	Member
	// CanRemove: the session can remove this person (it can do everything and the person is not a Tutor).
	CanRemove bool
}
