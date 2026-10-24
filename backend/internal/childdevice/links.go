package childdevice

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// cleanName is the name a parent gave a phone: control characters and line breaks become spaces, the spaces are collapsed and the
// ends trimmed. It must then have 1 to MaxNameRunes characters. It is free text: it only ever travels in request bodies.
func cleanName(name string) (string, error) {
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, name)
	name = strings.Join(strings.Fields(name), " ")
	if n := utf8.RuneCountInString(name); n < 1 || n > MaxNameRunes {
		return "", ErrInvalidName
	}
	return name, nil
}

// Create makes the one-use link of a phone for the child, in one transaction that locks the owner account's row (the plan is
// decided under it, like every plan limit) and the child's row (the cap is counted under it, so simultaneous requests can't all
// take the last place). It returns the link and the link's token, which is the only time the token exists in the clear.
//
// A pending link with the same name is canceled first (a new link for the same phone replaces the old one). Active links plus
// pending ones that haven't expired are at most MaxLinksPerChild. A phone idle for longer than its credential lasts (it can no
// longer get in, and the list says «Vencido») doesn't take a place.
func (r *Repository) Create(ctx context.Context, childID, actor uuid.UUID, name string, now time.Time) (*Link, string, error) {
	name, err := cleanName(name)
	if err != nil {
		return nil, "", err
	}
	token, hash, err := NewToken()
	if err != nil {
		return nil, "", err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, "", fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var accountID uuid.UUID
	var plan string
	err = tx.QueryRow(ctx, `
		SELECT a.id, a.plan FROM children c JOIN accounts a ON a.id = c.account_id WHERE c.id = $1 FOR UPDATE OF a, c`, childID).Scan(&accountID, &plan)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrChildNotFound
	}
	if err != nil {
		return nil, "", fmt.Errorf("locking the child: %w", err)
	}
	if plan != "paid" {
		return nil, "", ErrPlanRequired{}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE child_device_links
		SET status = 'revoked', token_hash = NULL, revoked_at = $3, revoked_by_account_id = $4
		WHERE child_id = $1 AND status = 'pending' AND name = $2`, childID, name, now, actor); err != nil {
		return nil, "", fmt.Errorf("replacing the pending link: %w", err)
	}

	var taken int
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM child_device_links
		WHERE child_id = $1 AND ((status = 'active' AND COALESCE(last_seen_at, redeemed_at) > $2::timestamptz - make_interval(secs => $3))
		       OR (status = 'pending' AND expires_at > $2))`, childID, now, CredentialIdle.Seconds()).Scan(&taken); err != nil {
		return nil, "", fmt.Errorf("counting the child's devices: %w", err)
	}
	if taken >= MaxLinksPerChild {
		return nil, "", ErrLimit{Limit: MaxLinksPerChild}
	}

	l := &Link{ChildID: childID, Name: name, Status: StatusPending, ExpiresAt: now.Add(LinkLifetime)}
	err = tx.QueryRow(ctx, `
		INSERT INTO child_device_links (child_id, account_id, name, created_by_account_id, status, token_hash, expires_at, created_at)
		VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7) RETURNING id, created_at`,
		childID, accountID, name, actor, hash, l.ExpiresAt, now).Scan(&l.ID, &l.CreatedAt)
	if err != nil {
		return nil, "", fmt.Errorf("creating the link: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, "", fmt.Errorf("committing the link: %w", err)
	}
	return l, token, nil
}

// Redeemed is what opening a link gives the phone: the credential it will send from now on, once.
type Redeemed struct {
	Credential     string
	ChildID        uuid.UUID
	ChildFirstName string
	RotateAfter    time.Time
}

// Redeem turns the token of a link into a credential, in ONE statement: the link must still be pending and unexpired, and it
// becomes active in the same instant, so two phones opening it at once can't both get a credential. A token that is unknown,
// already used, expired or canceled is the same ErrNotFound.
func (r *Repository) Redeem(ctx context.Context, token string, now time.Time) (*Redeemed, error) {
	tokenHash, ok := ParseToken(token)
	if !ok {
		return nil, ErrNotFound
	}
	credential, credentialHash, err := NewToken()
	if err != nil {
		return nil, err
	}
	out := &Redeemed{Credential: credential}
	err = r.pool.QueryRow(ctx, `
		WITH redeemed AS (
			UPDATE child_device_links
			SET status = 'active', token_hash = NULL, redeemed_at = $2, credential_hash = $3, rotated_at = $2
			WHERE token_hash = $1 AND status = 'pending' AND expires_at > $2
			RETURNING child_id
		)
		SELECT c.id, c.first_name FROM redeemed JOIN children c ON c.id = redeemed.child_id`,
		tokenHash, now, credentialHash).Scan(&out.ChildID, &out.ChildFirstName)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("redeeming a link: %w", err)
	}
	out.RotateAfter = now.Add(RotateEvery)
	return out, nil
}
