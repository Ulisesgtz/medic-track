package family

import "errors"

// Domain errors, mapped to HTTP statuses by the Handler (contracts/family.md).
var (
	// ErrNotAllowed: the session can't do this in the family (it needs to do everything: the owner or a Tutor).
	ErrNotAllowed = errors.New("not allowed")
	// ErrPlanRequired: the family's owner is not on the paid plan (inviting and joining are the paid plan's).
	ErrPlanRequired = errors.New("the family's plan is not paid")
	// ErrAlreadyMember: that e-mail already has access to the family (or is the owner's).
	ErrAlreadyMember = errors.New("already a member")
	// ErrInvitationPending: that e-mail already has a pending invitation in this family.
	ErrInvitationPending = errors.New("an invitation is already pending")
	// ErrFamilyFull: the family has its maximum of people, counting pending invitations.
	ErrFamilyFull = errors.New("the family is full")
	// ErrInvitationNotFound: unknown, used, expired or canceled — one answer for all, so nothing about the family leaks.
	ErrInvitationNotFound = errors.New("invitation not found")
	// ErrEmailMismatch: the session's verified e-mail is not the invited one.
	ErrEmailMismatch = errors.New("the session's e-mail is not the invited one")
	// ErrEmailNotVerified: the session has no verified e-mail to compare.
	ErrEmailNotVerified = errors.New("the session's e-mail is not verified")
	// ErrAccountRequired: the person has no PediTrack account yet (the app creates one, without children, and tries again).
	ErrAccountRequired = errors.New("a PediTrack account is required")
	// ErrAlreadyInFamily: the person already belongs to a family as an invited person (one at a time).
	ErrAlreadyInFamily = errors.New("already in a family")
	// ErrMemberNotFound: no such active member in that family.
	ErrMemberNotFound = errors.New("member not found")
	// ErrCannotRemoveTutor: a Tutor can't be removed by anyone else, not even by the owner (custody, research R10).
	ErrCannotRemoveTutor = errors.New("a tutor cannot be removed")
	// ErrOwnerCannotLeave: the owner is the family's, they can't leave it.
	ErrOwnerCannotLeave = errors.New("the owner cannot leave")
)

// ValidationError describes one invalid field of a request.
type ValidationError struct {
	Field   string
	Message string
}

// ValidationErrors is a request's invalid fields, returned together.
type ValidationErrors []ValidationError

func (v ValidationErrors) Error() string {
	if len(v) == 0 {
		return "validation error"
	}
	return v[0].Field + ": " + v[0].Message
}

// HasErrors reports whether there is any.
func (v ValidationErrors) HasErrors() bool { return len(v) > 0 }
