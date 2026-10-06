package family

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// planPaid is the value of accounts.plan that lets a family invite and accept (the table is read directly, as
// internal/consultation does, so this package doesn't import internal/account).
const planPaid = "paid"

// Repository stores the family's people and invitations.
type Repository struct {
	pool *pgxpool.Pool
	now  func() time.Time
}

// NewRepository creates a Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, now: time.Now}
}

// normalizeEmail is how e-mails are compared and stored: trimmed and lower case.
func normalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

// AccountIDByClerk is the account of a Clerk session; ErrAccountRequired if the person has none yet.
func (r *Repository) AccountIDByClerk(ctx context.Context, clerkUserID string) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `SELECT id FROM accounts WHERE clerk_user_id = $1`, clerkUserID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrAccountRequired
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("finding the account of the session: %w", err)
	}
	return id, nil
}

// FamilyOf is the family an account belongs to: the owner account and the role. An account with no active membership is the
// owner of its own family (role "owner").
func (r *Repository) FamilyOf(ctx context.Context, accountID uuid.UUID) (ownerID uuid.UUID, role string, err error) {
	err = r.pool.QueryRow(ctx, `SELECT family_account_id, role FROM family_members WHERE account_id = $1 AND status = 'active'`, accountID).Scan(&ownerID, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return accountID, "owner", nil
	}
	if err != nil {
		return uuid.Nil, "", fmt.Errorf("finding the family: %w", err)
	}
	return ownerID, role, nil
}

// Owner is the first name and plan of a family's owner account.
func (r *Repository) Owner(ctx context.Context, ownerID uuid.UUID) (name, plan string, err error) {
	err = r.pool.QueryRow(ctx, `SELECT first_name, plan::text FROM accounts WHERE id = $1`, ownerID).Scan(&name, &plan)
	if err != nil {
		return "", "", fmt.Errorf("reading the owner: %w", err)
	}
	return name, plan, nil
}

// ListMembers is the active people of the family, oldest first.
func (r *Repository) ListMembers(ctx context.Context, familyID uuid.UUID) ([]Member, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT m.id, m.account_id, a.first_name, m.role, m.child_id, m.accepted_at
		FROM family_members m JOIN accounts a ON a.id = m.account_id
		WHERE m.family_account_id = $1 AND m.status = 'active'
		ORDER BY m.accepted_at, m.id
	`, familyID)
	if err != nil {
		return nil, fmt.Errorf("listing the members: %w", err)
	}
	defer rows.Close()
	members := []Member{}
	for rows.Next() {
		var m Member
		var role string
		if err := rows.Scan(&m.ID, &m.AccountID, &m.Name, &role, &m.ChildID, &m.Since); err != nil {
			return nil, fmt.Errorf("scanning a member: %w", err)
		}
		m.Role = Role(role)
		members = append(members, m)
	}
	return members, rows.Err()
}

const invitationColumns = `i.id, i.family_account_id, i.email, i.role, i.child_id,
	CASE WHEN i.status = 'pending' AND i.expires_at < now() THEN 'expired' ELSE i.status END, i.expires_at, i.created_at`

func scanInvitation(row pgx.Row) (Invitation, error) {
	var inv Invitation
	var role, status string
	if err := row.Scan(&inv.ID, &inv.FamilyAccountID, &inv.Email, &role, &inv.ChildID, &status, &inv.ExpiresAt, &inv.CreatedAt); err != nil {
		return Invitation{}, err
	}
	inv.Role, inv.Status = Role(role), InvitationStatus(status)
	return inv, nil
}

// ListInvitations is the family's invitations still waiting (pending, or pending and past their date: "expired"), newest first.
func (r *Repository) ListInvitations(ctx context.Context, familyID uuid.UUID) ([]Invitation, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+invitationColumns+`
		FROM family_invitations i
		WHERE i.family_account_id = $1 AND i.status = 'pending'
		ORDER BY i.created_at DESC, i.id
	`, familyID)
	if err != nil {
		return nil, fmt.Errorf("listing the invitations: %w", err)
	}
	defer rows.Close()
	invitations := []Invitation{}
	for rows.Next() {
		inv, err := scanInvitation(rows)
		if err != nil {
			return nil, fmt.Errorf("scanning an invitation: %w", err)
		}
		invitations = append(invitations, inv)
	}
	return invitations, rows.Err()
}

// lockOwner takes the owner account's row (so the requests of one family are handled one after the other, as in the child
// limit) and returns its plan.
func lockOwner(ctx context.Context, tx pgx.Tx, ownerID uuid.UUID) (string, error) {
	var plan string
	err := tx.QueryRow(ctx, `SELECT plan::text FROM accounts WHERE id = $1 FOR UPDATE`, ownerID).Scan(&plan)
	if err != nil {
		return "", fmt.Errorf("locking the owner: %w", err)
	}
	return plan, nil
}

// placesTaken counts the owner, the active people and the pending invitations that haven't expired (they hold a place),
// leaving out one invitation (the one being resent or accepted).
func placesTaken(ctx context.Context, tx pgx.Tx, familyID, exceptInvitation uuid.UUID) (int, error) {
	var n int
	err := tx.QueryRow(ctx, `
		SELECT 1
		     + (SELECT count(*) FROM family_members WHERE family_account_id = $1 AND status = 'active')
		     + (SELECT count(*) FROM family_invitations WHERE family_account_id = $1 AND status = 'pending' AND expires_at >= now() AND id <> $2)
	`, familyID, exceptInvitation).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("counting the family: %w", err)
	}
	return n, nil
}

// CreateInvitation invites an e-mail to the family, with the token's hash already made. Inside one transaction with the
// owner locked: the owner must be on the paid plan, the e-mail not already a person of the family (or the owner's), no
// other invitation of that e-mail waiting, and a place free (research R9). The invitation expires in InvitationTTL.
func (r *Repository) CreateInvitation(ctx context.Context, familyID, invitedBy uuid.UUID, email string, role Role, childID *uuid.UUID, tokenHash []byte) (*Invitation, error) {
	email = normalizeEmail(email)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning the invitation: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	plan, err := lockOwner(ctx, tx, familyID)
	if err != nil {
		return nil, err
	}
	if plan != planPaid {
		return nil, ErrPlanRequired
	}

	var already bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM accounts WHERE id = $1 AND lower(email) = $2)
		    OR EXISTS (SELECT 1 FROM family_members m JOIN accounts a ON a.id = m.account_id
		               WHERE m.family_account_id = $1 AND m.status = 'active' AND lower(a.email) = $2)
	`, familyID, email).Scan(&already); err != nil {
		return nil, fmt.Errorf("checking the e-mail: %w", err)
	}
	if already {
		return nil, ErrAlreadyMember
	}

	// A pending invitation past its date no longer blocks a new one: it is closed as expired first.
	if _, err := tx.Exec(ctx, `
		UPDATE family_invitations SET status = 'expired', responded_at = now()
		WHERE family_account_id = $1 AND email = $2 AND status = 'pending' AND expires_at < now()
	`, familyID, email); err != nil {
		return nil, fmt.Errorf("closing an expired invitation: %w", err)
	}
	var pending bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM family_invitations WHERE family_account_id = $1 AND email = $2 AND status = 'pending')`, familyID, email).Scan(&pending); err != nil {
		return nil, fmt.Errorf("checking for a pending invitation: %w", err)
	}
	if pending {
		return nil, ErrInvitationPending
	}

	taken, err := placesTaken(ctx, tx, familyID, uuid.Nil)
	if err != nil {
		return nil, err
	}
	if taken >= MaxPeople {
		return nil, ErrFamilyFull
	}

	inv, err := scanInvitation(tx.QueryRow(ctx, `
		WITH i AS (
			INSERT INTO family_invitations (family_account_id, email, role, child_id, token_hash, invited_by_account_id, expires_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING *
		)
		SELECT `+invitationColumns+` FROM i
	`, familyID, email, string(role), childID, tokenHash, invitedBy, r.now().Add(InvitationTTL)))
	if err != nil {
		return nil, fmt.Errorf("saving the invitation: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing the invitation: %w", err)
	}
	return &inv, nil
}

// Resend gives a pending invitation a new token (its hash) and a new date, and the old link stops working. A place has to
// be free if it had expired. ErrInvitationNotFound if it isn't a pending invitation of that family.
func (r *Repository) Resend(ctx context.Context, familyID, invitationID uuid.UUID, tokenHash []byte) (*Invitation, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning the resend: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	plan, err := lockOwner(ctx, tx, familyID)
	if err != nil {
		return nil, err
	}
	if plan != planPaid {
		return nil, ErrPlanRequired
	}
	taken, err := placesTaken(ctx, tx, familyID, invitationID)
	if err != nil {
		return nil, err
	}
	if taken >= MaxPeople {
		return nil, ErrFamilyFull
	}
	inv, err := scanInvitation(tx.QueryRow(ctx, `
		WITH i AS (
			UPDATE family_invitations SET token_hash = $3, expires_at = $4
			WHERE id = $1 AND family_account_id = $2 AND status = 'pending'
			RETURNING *
		)
		SELECT `+invitationColumns+` FROM i
	`, invitationID, familyID, tokenHash, r.now().Add(InvitationTTL)))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("resending the invitation: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing the resend: %w", err)
	}
	return &inv, nil
}

// Cancel closes a pending invitation of the family. ErrInvitationNotFound if it isn't one.
func (r *Repository) Cancel(ctx context.Context, familyID, invitationID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE family_invitations SET status = 'canceled', responded_at = now()
		WHERE id = $1 AND family_account_id = $2 AND status = 'pending'
	`, invitationID, familyID)
	if err != nil {
		return fmt.Errorf("canceling the invitation: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrInvitationNotFound
	}
	return nil
}

// PreviewByToken is what a person sees before accepting: only a pending invitation that hasn't expired (anything else is
// ErrInvitationNotFound, with no detail). EmailMatches is for the caller to fill.
func (r *Repository) PreviewByToken(ctx context.Context, tokenHash []byte) (*Preview, error) {
	var p Preview
	var role string
	err := r.pool.QueryRow(ctx, `
		SELECT o.first_name, i.role, COALESCE(ch.first_name, ''), i.email, i.expires_at
		FROM family_invitations i
		JOIN accounts o ON o.id = i.family_account_id
		LEFT JOIN children ch ON ch.id = i.child_id
		WHERE i.token_hash = $1 AND i.status = 'pending' AND i.expires_at >= now()
	`, tokenHash).Scan(&p.OwnerName, &role, &p.ChildFirstName, &p.Email, &p.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading the invitation: %w", err)
	}
	p.Role = Role(role)
	return &p, nil
}

// invitationRow is what Accept and Decline read of an invitation, locked.
type invitationRow struct {
	id, familyID, invitedBy uuid.UUID
	email, status           string
	role                    string
	childID                 *uuid.UUID
	expired                 bool
	memberID                *uuid.UUID
	consentBy               *uuid.UUID
	consentAt               *time.Time
}

func lockInvitation(ctx context.Context, tx pgx.Tx, tokenHash []byte) (*invitationRow, error) {
	var i invitationRow
	err := tx.QueryRow(ctx, `
		SELECT id, family_account_id, invited_by_account_id, email, status, role, child_id, expires_at < now(), member_id,
		       consent_by_account_id, consent_at
		FROM family_invitations WHERE token_hash = $1 FOR UPDATE
	`, tokenHash).Scan(&i.id, &i.familyID, &i.invitedBy, &i.email, &i.status, &i.role, &i.childID, &i.expired, &i.memberID, &i.consentBy, &i.consentAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading the invitation: %w", err)
	}
	return &i, nil
}

// Accept makes the person a member of the family of the invitation behind the token. The e-mail the session has VERIFIED has
// to be the invited one; the owner must still be on the paid plan; the person must not belong to a family already (one at a
// time), nor be the owner. The invitation is used up in the same transaction. The same person accepting again gets their
// membership back (idempotent); anything else about a used, expired or unknown token is ErrInvitationNotFound.
func (r *Repository) Accept(ctx context.Context, tokenHash []byte, accountID uuid.UUID, verifiedEmail string) (*Member, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("beginning the acceptance: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	inv, err := lockInvitation(ctx, tx, tokenHash)
	if err != nil {
		return nil, err
	}
	if normalizeEmail(verifiedEmail) != inv.email {
		return nil, ErrEmailMismatch
	}
	if inv.status == string(StatusAccepted) && inv.memberID != nil {
		// Idempotent for the same person: their membership, if it is still theirs and active.
		member, err := memberByID(ctx, tx, *inv.memberID)
		if err == nil && member.AccountID == accountID {
			return member, nil
		}
		return nil, ErrInvitationNotFound
	}
	if inv.status != string(StatusPending) || inv.expired {
		return nil, ErrInvitationNotFound
	}

	plan, err := lockOwner(ctx, tx, inv.familyID)
	if err != nil {
		return nil, err
	}
	if plan != planPaid {
		return nil, ErrPlanRequired
	}
	if accountID == inv.familyID {
		return nil, ErrAlreadyMember
	}
	var inAFamily bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM family_members WHERE account_id = $1 AND status = 'active')`, accountID).Scan(&inAFamily); err != nil {
		return nil, fmt.Errorf("checking the person's family: %w", err)
	}
	if inAFamily {
		return nil, ErrAlreadyInFamily
	}

	var memberID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO family_members (family_account_id, account_id, role, child_id, invited_by_account_id, consent_by_account_id, consent_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, inv.familyID, accountID, inv.role, inv.childID, inv.invitedBy, inv.consentBy, inv.consentAt).Scan(&memberID); err != nil {
		return nil, fmt.Errorf("adding the member: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE family_invitations SET status = 'accepted', responded_at = now(), member_id = $2 WHERE id = $1`, inv.id, memberID); err != nil {
		return nil, fmt.Errorf("closing the invitation: %w", err)
	}
	member, err := memberByID(ctx, tx, memberID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("committing the acceptance: %w", err)
	}
	return member, nil
}

func memberByID(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*Member, error) {
	var m Member
	var role string
	err := tx.QueryRow(ctx, `
		SELECT m.id, m.account_id, a.first_name, m.role, m.child_id, m.accepted_at
		FROM family_members m JOIN accounts a ON a.id = m.account_id
		WHERE m.id = $1 AND m.status = 'active'
	`, id).Scan(&m.ID, &m.AccountID, &m.Name, &role, &m.ChildID, &m.Since)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMemberNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading the member: %w", err)
	}
	m.Role = Role(role)
	return &m, nil
}

// Decline closes a pending invitation as declined; like accepting, only for the invited e-mail.
func (r *Repository) Decline(ctx context.Context, tokenHash []byte, verifiedEmail string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning the refusal: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	inv, err := lockInvitation(ctx, tx, tokenHash)
	if err != nil {
		return err
	}
	if inv.status != string(StatusPending) || inv.expired {
		return ErrInvitationNotFound
	}
	if normalizeEmail(verifiedEmail) != inv.email {
		return ErrEmailMismatch
	}
	if _, err := tx.Exec(ctx, `UPDATE family_invitations SET status = 'declined', responded_at = now() WHERE id = $1`, inv.id); err != nil {
		return fmt.Errorf("declining the invitation: %w", err)
	}
	return tx.Commit(ctx)
}
