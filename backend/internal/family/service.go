package family

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
)

// EmailResolver gives the VERIFIED e-mail of a Clerk session (internal/account's, in production). It returns
// ErrEmailNotVerified when the session's address isn't verified.
type EmailResolver interface {
	VerifiedEmail(ctx context.Context, clerkUserID string) (string, error)
}

// EmailFunc adapts a plain function to EmailResolver.
type EmailFunc func(ctx context.Context, clerkUserID string) (string, error)

// VerifiedEmail calls f.
func (f EmailFunc) VerifiedEmail(ctx context.Context, clerkUserID string) (string, error) {
	return f(ctx, clerkUserID)
}

// Accessor says what a session can do with a family's owner account (internal/access).
type Accessor interface {
	OnAccount(ctx context.Context, clerkUserID string, accountID uuid.UUID) (access.Access, error)
}

// Service holds the family's rules: who can invite, who can accept, and what the session sees of its family.
type Service struct {
	repo     *Repository
	access   Accessor
	emails   EmailResolver
	newToken func() (string, []byte, error)
}

// NewService creates a Service.
func NewService(repo *Repository, accessRepo Accessor, emails EmailResolver) *Service {
	return &Service{repo: repo, access: accessRepo, emails: emails, newToken: NewToken}
}

// InviteInput is a request to invite someone.
type InviteInput struct {
	Email   string
	Role    Role
	ChildID *uuid.UUID
	// Consent is the tutor's consent for the Child role (not offered yet).
	Consent bool
}

var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

const maxEmailLength = 254

func validateInvite(in InviteInput) (InviteInput, ValidationErrors) {
	var errs ValidationErrors
	in.Email = normalizeEmail(in.Email)
	if in.Email == "" {
		errs = append(errs, ValidationError{Field: "email", Message: "is required"})
	} else if len(in.Email) > maxEmailLength || !emailPattern.MatchString(in.Email) {
		errs = append(errs, ValidationError{Field: "email", Message: "must be a valid e-mail address"})
	}
	switch in.Role {
	case RoleTutor, RoleCaregiver:
	case RoleChild:
		// Entrega 3: how a child gets in depends on the legal answer (spec 032, Supuestos).
		errs = append(errs, ValidationError{Field: "role", Message: "child is not available yet"})
	default:
		errs = append(errs, ValidationError{Field: "role", Message: "must be tutor or caregiver"})
	}
	if in.ChildID != nil {
		errs = append(errs, ValidationError{Field: "childId", Message: "only the child role has a child"})
	}
	return in, errs
}

// actorAndFamily is the session's account, the owner account of its family, its role in it ("owner" for somebody who shares
// nothing) and what the session can do with that account.
func (s *Service) actorAndFamily(ctx context.Context, clerkUserID string) (actorID, familyID uuid.UUID, role string, level access.Level, err error) {
	actorID, err = s.repo.AccountIDByClerk(ctx, clerkUserID)
	if err != nil {
		return uuid.Nil, uuid.Nil, "", access.None, err
	}
	familyID, role, err = s.repo.FamilyOf(ctx, actorID)
	if err != nil {
		return uuid.Nil, uuid.Nil, "", access.None, err
	}
	got, err := s.access.OnAccount(ctx, clerkUserID, familyID)
	if err != nil {
		return uuid.Nil, uuid.Nil, "", access.None, err
	}
	return actorID, familyID, role, got.Level, nil
}

// View is what the session sees of its family (GET /family): its role and the family's plan, the people, and — to who can
// do everything — the invitations waiting.
func (s *Service) View(ctx context.Context, clerkUserID string) (*View, error) {
	actorID, familyID, role, level, err := s.actorAndFamily(ctx, clerkUserID)
	if err != nil {
		return nil, err
	}
	name, plan, err := s.repo.Owner(ctx, familyID)
	if err != nil {
		return nil, err
	}
	members, err := s.repo.ListMembers(ctx, familyID)
	if err != nil {
		return nil, err
	}
	invitations, err := s.repo.ListInvitations(ctx, familyID)
	if err != nil {
		return nil, err
	}

	view := &View{
		Role: role, OwnerAccountID: familyID, OwnerName: name, Plan: plan,
		ReadOnly: role != "owner" && plan != planPaid,
		Max:      MaxPeople,
	}
	pending := 0
	for _, inv := range invitations {
		if inv.Status == StatusPending {
			pending++
		}
	}
	view.Used = 1 + len(members) + pending
	for _, m := range members {
		view.Members = append(view.Members, MemberView{Member: m, CanRemove: level == access.Full && m.Role != RoleTutor && m.AccountID != actorID, You: m.AccountID == actorID})
	}
	if view.Members == nil {
		view.Members = []MemberView{}
	}
	if level == access.Full {
		view.Invitations = invitations
	} else {
		view.Invitations = []Invitation{}
	}
	return view, nil
}

// Invite invites an e-mail to the session's family. The session must be able to do everything (the owner or a Tutor of a
// family that is paid), and the family must be paid; the invitation comes back with its token, the only time it does.
func (s *Service) Invite(ctx context.Context, clerkUserID string, in InviteInput) (*Invitation, error) {
	in, errs := validateInvite(in)
	if errs.HasErrors() {
		return nil, errs
	}
	actorID, familyID, _, level, err := s.actorAndFamily(ctx, clerkUserID)
	if err != nil {
		return nil, err
	}
	if level != access.Full {
		return nil, ErrNotAllowed
	}
	token, hash, err := s.newToken()
	if err != nil {
		return nil, err
	}
	inv, err := s.repo.CreateInvitation(ctx, familyID, actorID, in.Email, in.Role, in.ChildID, hash)
	if err != nil {
		return nil, err
	}
	inv.Token = token
	return inv, nil
}

// Resend gives a pending invitation a new link (the old one stops working).
func (s *Service) Resend(ctx context.Context, clerkUserID string, invitationID uuid.UUID) (*Invitation, error) {
	_, familyID, _, level, err := s.actorAndFamily(ctx, clerkUserID)
	if err != nil {
		return nil, err
	}
	if level != access.Full {
		return nil, ErrNotAllowed
	}
	token, hash, err := s.newToken()
	if err != nil {
		return nil, err
	}
	inv, err := s.repo.Resend(ctx, familyID, invitationID, hash)
	if err != nil {
		return nil, err
	}
	inv.Token = token
	return inv, nil
}

// Cancel closes a pending invitation of the session's family.
func (s *Service) Cancel(ctx context.Context, clerkUserID string, invitationID uuid.UUID) error {
	_, familyID, _, level, err := s.actorAndFamily(ctx, clerkUserID)
	if err != nil {
		return err
	}
	if level != access.Full {
		return ErrNotAllowed
	}
	return s.repo.Cancel(ctx, familyID, invitationID)
}

// Preview is what a person sees of an invitation before accepting. Whether the session's verified e-mail is the invited one
// is told too (a session whose e-mail can't be read just doesn't match). An unknown, used, expired or canceled token is one
// ErrInvitationNotFound.
func (s *Service) Preview(ctx context.Context, clerkUserID, token string) (*Preview, error) {
	p, err := s.repo.PreviewByToken(ctx, HashToken(token))
	if err != nil {
		return nil, err
	}
	if email, err := s.emails.VerifiedEmail(ctx, clerkUserID); err == nil {
		p.EmailMatches = normalizeEmail(email) == p.Email
	}
	return p, nil
}

// Accept makes the session's person a member of the family of the invitation behind the token.
func (s *Service) Accept(ctx context.Context, clerkUserID, token string) (*Member, error) {
	actorID, err := s.repo.AccountIDByClerk(ctx, clerkUserID)
	if err != nil {
		return nil, err
	}
	email, err := s.emails.VerifiedEmail(ctx, clerkUserID)
	if err != nil {
		return nil, err
	}
	return s.repo.Accept(ctx, HashToken(strings.TrimSpace(token)), actorID, email)
}

// Decline turns a pending invitation down.
func (s *Service) Decline(ctx context.Context, clerkUserID, token string) error {
	email, err := s.emails.VerifiedEmail(ctx, clerkUserID)
	if err != nil {
		return err
	}
	return s.repo.Decline(ctx, HashToken(strings.TrimSpace(token)), email)
}

// Leave is the invited person leaving their family. The owner is the family's: they can't leave it.
func (s *Service) Leave(ctx context.Context, clerkUserID string) error {
	actorID, err := s.repo.AccountIDByClerk(ctx, clerkUserID)
	if err != nil {
		return err
	}
	if _, role, err := s.repo.FamilyOf(ctx, actorID); err != nil {
		return err
	} else if role == "owner" {
		return ErrOwnerCannotLeave
	}
	return s.repo.Leave(ctx, actorID)
}

// RemoveMember removes a Caregiver or a Child-role member. Only who can do everything in the family asks it, and never for a
// Tutor.
func (s *Service) RemoveMember(ctx context.Context, clerkUserID string, memberID uuid.UUID) error {
	actorID, familyID, _, level, err := s.actorAndFamily(ctx, clerkUserID)
	if err != nil {
		return err
	}
	if level != access.Full {
		return ErrNotAllowed
	}
	return s.repo.RemoveMember(ctx, familyID, memberID, actorID)
}

// IsNotFound reports whether err is ErrInvitationNotFound (a small helper for the handler's tests).
func IsNotFound(err error) bool { return errors.Is(err, ErrInvitationNotFound) }
