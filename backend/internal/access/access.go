// Package access answers "what can this session do with this child?" (specs/032-compartir-con-familia, research R3). It
// replaces the old "does the session own it?" (internal/ownership) for children, consultations and doses: a child's data
// belongs to its owner account, and other people reach it through a membership (a family), so the answer is a level, not a
// yes or no.
//
// The levels: None (no access), Mark (see everything of the child and mark doses) and Full (everything). The owner account
// and a Tutor are Full; a Caregiver is Mark; a Child-role member is Mark for their own child only. A person who is not
// the owner is capped at Mark when the owner's plan is not paid (they keep seeing and marking, FR-024) — derived on every
// request, nothing stored, so quitting someone or a plan change takes effect at once.
package access

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Level is how much a session can do with a child.
type Level int

const (
	// None: no access (the resource is answered as forbidden, the same as one that doesn't exist).
	None Level = iota
	// Mark: see everything of the child and mark/unmark doses (the ones they marked).
	Mark
	// Full: everything the owner can do.
	Full
)

// AtLeast reports whether l is at least min.
func (l Level) AtLeast(min Level) bool { return l >= min }

// Access is what the session can do, with the session's own account (the actor: whose name goes on a dose it marks).
type Access struct {
	Level Level
	// ActorAccountID is the account of the session; uuid.Nil if the session has no PediTrack account yet.
	ActorAccountID uuid.UUID
}

type contextKey struct{}

// WithAccess stores what the session can do for the request.
func WithAccess(ctx context.Context, a Access) context.Context {
	return context.WithValue(ctx, contextKey{}, a)
}

// FromContext returns what RequireAccess found out for the request.
func FromContext(ctx context.Context) (Access, bool) {
	a, ok := ctx.Value(contextKey{}).(Access)
	return a, ok
}

// Repository runs the access queries.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a Repository backed by the given pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// levelCase computes the level of the actor account `a` over the owner account `owner` (and, for a child-role member, over
// the child `ch`; pass "TRUE" for `childOK` where no single child is involved). `m` is the actor's active membership in
// the owner's family, if any. 2 = Full, 1 = Mark, 0 = None.
func levelCase(childOK string) string {
	return `CASE
		WHEN owner.id = a.id THEN 2
		WHEN m.id IS NULL THEN 0
		WHEN m.role = 'child' AND NOT (` + childOK + `) THEN 0
		WHEN m.role = 'tutor' AND owner.plan = 'paid' THEN 2
		ELSE 1
	END`
}

// onChild: the actor is chosen by `actorWhere`; $1 is the actor key, $2 the child.
func onChildQuery(actorWhere string) string {
	return `
		SELECT a.id, ` + levelCase("m.child_id = ch.id") + `
		FROM accounts a
		JOIN children ch ON ch.id = $2
		JOIN accounts owner ON owner.id = ch.account_id
		LEFT JOIN family_members m
		       ON m.account_id = a.id AND m.family_account_id = owner.id AND m.status = 'active'
		WHERE ` + actorWhere
}

func onConsultationQuery(actorWhere string) string {
	return `
		SELECT a.id, ` + levelCase("m.child_id = ch.id") + `
		FROM accounts a
		JOIN consultations k ON k.id = $2
		JOIN children ch ON ch.id = k.child_id
		JOIN accounts owner ON owner.id = ch.account_id
		LEFT JOIN family_members m
		       ON m.account_id = a.id AND m.family_account_id = owner.id AND m.status = 'active'
		WHERE ` + actorWhere
}

// onAccountQuery: access over a family's owner account itself (adding children to the family). A Child-role member has
// none of it.
func onAccountQuery(actorWhere string) string {
	return `
		SELECT a.id, ` + levelCase("FALSE") + `
		FROM accounts a
		JOIN accounts owner ON owner.id = $2
		LEFT JOIN family_members m
		       ON m.account_id = a.id AND m.family_account_id = owner.id AND m.status = 'active'
		WHERE ` + actorWhere
}

const (
	byClerkUser = `a.clerk_user_id = $1`
	byAccount   = `a.id = $1::uuid`
)

func (r *Repository) run(ctx context.Context, query string, key any, id uuid.UUID) (Access, error) {
	var actor uuid.UUID
	var level int
	err := r.pool.QueryRow(ctx, query, key, id).Scan(&actor, &level)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// No account for the session, or no such resource: nothing is reachable.
			return Access{Level: None}, nil
		}
		return Access{}, fmt.Errorf("resolving access: %w", err)
	}
	return Access{Level: Level(level), ActorAccountID: actor}, nil
}

// OnChild is what the Clerk session can do with the child. An empty clerkUserID never has access.
func (r *Repository) OnChild(ctx context.Context, clerkUserID string, childID uuid.UUID) (Access, error) {
	if clerkUserID == "" {
		return Access{Level: None}, nil
	}
	return r.run(ctx, onChildQuery(byClerkUser), clerkUserID, childID)
}

// OnConsultation is what the Clerk session can do with the consultation (resolved through its child).
func (r *Repository) OnConsultation(ctx context.Context, clerkUserID string, consultationID uuid.UUID) (Access, error) {
	if clerkUserID == "" {
		return Access{Level: None}, nil
	}
	return r.run(ctx, onConsultationQuery(byClerkUser), clerkUserID, consultationID)
}

// OnAccount is what the Clerk session can do with a family's owner account (adding children to that family).
func (r *Repository) OnAccount(ctx context.Context, clerkUserID string, ownerAccountID uuid.UUID) (Access, error) {
	if clerkUserID == "" {
		return Access{Level: None}, nil
	}
	return r.run(ctx, onAccountQuery(byClerkUser), clerkUserID, ownerAccountID)
}

// OfAccountOnChild is what an account (not a session) can do with the child: the "Tomada" button of a reminder knows the
// device's account, not a Clerk session.
func (r *Repository) OfAccountOnChild(ctx context.Context, accountID, childID uuid.UUID) (Level, error) {
	got, err := r.run(ctx, onChildQuery(byAccount), accountID, childID)
	return got.Level, err
}
