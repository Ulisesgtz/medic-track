package accountdeletion

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SweepInterval is how often the API looks for deletions whose date has come (research R6).
const SweepInterval = 10 * time.Minute

// ConfirmWord is what the person writes to confirm (FR-009).
const ConfirmWord = "ELIMINAR"

// Errors of Service.Request.
var (
	ErrConfirm            = errors.New("the confirmation word is not ELIMINAR")
	ErrReverification     = errors.New("the session must verify it is the person again")
	ErrSubscriptionCancel = errors.New("the subscription could not be canceled")
	ErrAccountNotFound    = errors.New("no account exists for this id")
)

// ClerkUsers is what the deletion needs of the sign-in provider. Delete treats an already deleted user as done.
type ClerkUsers interface {
	Delete(ctx context.Context, clerkUserID string) error
}

// SubscriptionCanceler cancels the account's open subscription, if any (research R5). canceled says there was one.
type SubscriptionCanceler func(ctx context.Context, accountID uuid.UUID) (canceled bool, err error)

// PaymentsCanceler is the SubscriptionCanceler of production: when the account has an open subscription (pending, active
// or in grace) it calls cancel (payments.Service.Cancel, which asks the provider first and changes nothing if it fails).
func PaymentsCanceler(pool *pgxpool.Pool, cancel func(ctx context.Context, accountID uuid.UUID) error) SubscriptionCanceler {
	return func(ctx context.Context, accountID uuid.UUID) (bool, error) {
		var open bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM subscriptions WHERE account_id = $1
			AND status IN ('pending', 'active', 'grace'))`, accountID).Scan(&open); err != nil {
			return false, fmt.Errorf("reading the subscription: %w", err)
		}
		if !open || cancel == nil {
			return false, nil
		}
		if err := cancel(ctx, accountID); err != nil {
			return false, err
		}
		return true, nil
	}
}

// Reporter writes a failure of the deletion to error_logs (*jobreport.Reporter, job:account-deletion).
type Reporter interface {
	Report(kind, message string, accountID *uuid.UUID)
}

// The kinds and fixed messages of the deletion's failures (contracts/api.md).
const (
	KindClerk  = "clerk"
	KindPurge  = "purge"
	KindNotify = "notify"

	messageClerk  = "The sign-in user could not be deleted"
	messagePurge  = "The account data could not be deleted"
	messageNotify = "The account deletion e-mail could not be sent"
)

// Service asks for, cancels and completes the deletion of accounts.
type Service struct {
	repo     *Repository
	pool     *pgxpool.Pool
	clerk    ClerkUsers
	cancel   SubscriptionCanceler
	notify   Notifier
	reporter Reporter
	// async runs the e-mails after answering (tests replace it with a direct call).
	async func(func())
}

// NewService creates the Service. cancel, notify and reporter may be nil.
func NewService(repo *Repository, pool *pgxpool.Pool, clerk ClerkUsers, cancel SubscriptionCanceler, notify Notifier, reporter Reporter) *Service {
	return &Service{repo: repo, pool: pool, clerk: clerk, cancel: cancel, notify: notify, reporter: reporter,
		async: func(f func()) { go f() }}
}

func (s *Service) report(kind, message string, accountID uuid.UUID) {
	if s.reporter != nil {
		s.reporter.Report(kind, message, &accountID)
	}
}

// RequestResult is what asking for the deletion did.
type RequestResult struct {
	Deletion             *Deletion
	SubscriptionCanceled bool
	FamilyNotified       int
}

// Request asks to delete the account (FR-007 to FR-012, FR-016). Order: the word, a recent sign-in, no open request, the
// subscription canceled (if the provider fails nothing is saved), then in one transaction with the account locked: the
// request, and the account's pending invitations and child-phone links stop working. The e-mails go after answering.
func (s *Service) Request(ctx context.Context, accountID uuid.UUID, confirm string, recentlyVerified bool) (*RequestResult, error) {
	if confirm != ConfirmWord {
		return nil, ErrConfirm
	}
	if !recentlyVerified {
		return nil, ErrReverification
	}
	if open, err := s.repo.Open(ctx, accountID); err != nil {
		return nil, err
	} else if open != nil {
		return &RequestResult{Deletion: open}, ErrAlreadyPending
	}

	result := &RequestResult{}
	if s.cancel != nil {
		canceled, err := s.cancel(ctx, accountID)
		if err != nil {
			return nil, ErrSubscriptionCancel
		}
		result.SubscriptionCanceled = canceled
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("starting the deletion request: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()

	var clerkUserID *string
	var email, firstName string
	err = tx.QueryRow(ctx, `SELECT clerk_user_id, email, first_name FROM accounts WHERE id = $1 FOR UPDATE`, accountID).
		Scan(&clerkUserID, &email, &firstName)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrAccountNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading the account: %w", err)
	}
	d, err := s.repo.request(ctx, tx, accountID, clerkUserID)
	if errors.Is(err, ErrAlreadyPending) {
		// Another request of the same person won the race.
		open, openErr := s.repo.Open(ctx, accountID)
		if openErr != nil {
			return nil, openErr
		}
		return &RequestResult{Deletion: open}, ErrAlreadyPending
	}
	if err != nil {
		return nil, err
	}
	// Links and invitations that would let someone new in stop working at once (FR-012).
	if _, err := tx.Exec(ctx, `UPDATE family_invitations SET status = 'canceled', responded_at = now()
		WHERE family_account_id = $1 AND status = 'pending'`, accountID); err != nil {
		return nil, fmt.Errorf("canceling the pending invitations: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE child_device_links SET status = 'revoked', token_hash = NULL, revoked_at = now(),
			revoked_by_account_id = $1
		WHERE account_id = $1 AND status = 'pending'`, accountID); err != nil {
		return nil, fmt.Errorf("revoking the pending child links: %w", err)
	}
	// The people of the account's family, to tell them (FR-014).
	rows, err := tx.Query(ctx, `SELECT a.email FROM family_members m JOIN accounts a ON a.id = m.account_id
		WHERE m.family_account_id = $1 AND m.status = 'active'`, accountID)
	if err != nil {
		return nil, fmt.Errorf("reading the family: %w", err)
	}
	var family []string
	for rows.Next() {
		var to string
		if err := rows.Scan(&to); err != nil {
			rows.Close()
			return nil, fmt.Errorf("reading the family: %w", err)
		}
		family = append(family, to)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("reading the family: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("saving the deletion request: %w", err)
	}

	result.Deletion = d
	result.FamilyNotified = len(family)
	if s.notify != nil {
		s.async(func() {
			ctx := context.WithoutCancel(ctx)
			failed := s.notify.Requested(ctx, email, firstName, d.ScheduledFor) != nil
			for _, to := range family {
				if s.notify.FamilyNotice(ctx, to, firstName, d.ScheduledFor) != nil {
					failed = true
				}
			}
			if failed {
				s.report(KindNotify, messageNotify, accountID)
			}
		})
	}
	return result, nil
}

// Status is the account's open request, or nil.
func (s *Service) Status(ctx context.Context, accountID uuid.UUID) (*Deletion, error) {
	return s.repo.Open(ctx, accountID)
}

// Cancel cancels the account's open request (FR-011). Nothing else to undo: everything during the period was derived.
func (s *Service) Cancel(ctx context.Context, accountID uuid.UUID) error {
	_, err := s.repo.Cancel(ctx, accountID)
	return err
}

// RunOnce completes every request whose date has come (R6): the Clerk user first, then the data in one transaction, then
// the last e-mail. A request that fails is counted, reported and left for the next run. Returns how many were completed.
func (s *Service) RunOnce(ctx context.Context) (int, error) {
	var skip []uuid.UUID
	completed := 0
	for {
		if err := ctx.Err(); err != nil {
			return completed, err
		}
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return completed, fmt.Errorf("starting a deletion: %w", err)
		}
		d, err := s.repo.nextDue(ctx, tx, skip)
		if err != nil || d == nil {
			_ = tx.Rollback(context.WithoutCancel(ctx))
			if err != nil && s.reporter != nil && ctx.Err() == nil {
				s.reporter.Report(KindPurge, messagePurge, nil)
			}
			return completed, err
		}
		email, firstName, kind, err := s.complete(ctx, tx, d)
		if err == nil {
			if err = tx.Commit(ctx); err != nil {
				kind = KindPurge
			}
		}
		if err != nil {
			_ = tx.Rollback(context.WithoutCancel(ctx))
			skip = append(skip, d.ID)
			_ = s.repo.markAttempt(context.WithoutCancel(ctx), d.ID)
			if kind == KindClerk {
				s.report(KindClerk, messageClerk, d.AccountID)
			} else {
				s.report(KindPurge, messagePurge, d.AccountID)
			}
			continue
		}
		completed++
		if s.notify != nil && email != "" {
			accountID := d.AccountID
			s.async(func() {
				if s.notify.Completed(context.WithoutCancel(ctx), email, firstName) != nil {
					s.report(KindNotify, messageNotify, accountID)
				}
			})
		}
	}
}

// complete deletes one account in tx. It returns the e-mail and first name for the last notice, and which step failed.
func (s *Service) complete(ctx context.Context, tx pgx.Tx, d *Deletion) (email, firstName, kind string, err error) {
	err = tx.QueryRow(ctx, `SELECT email, first_name FROM accounts WHERE id = $1 FOR UPDATE`, d.AccountID).Scan(&email, &firstName)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", "", KindPurge, fmt.Errorf("reading the account: %w", err)
	}
	if d.ClerkUserID != nil && s.clerk != nil {
		if err := s.clerk.Delete(ctx, *d.ClerkUserID); err != nil {
			return "", "", KindClerk, fmt.Errorf("deleting the sign-in user: %w", err)
		}
	}
	if err := Purge(ctx, tx, d.AccountID); err != nil {
		return "", "", KindPurge, err
	}
	if err := s.repo.complete(ctx, tx, d.ID); err != nil {
		return "", "", KindPurge, err
	}
	return email, firstName, "", nil
}

// UserExists says whether a Clerk user still exists (reconcile-deleted).
type UserExists func(ctx context.Context, clerkUserID string) (bool, error)

// ErrTooManyGone is returned by ReconcileDeleted, with nothing deleted, when more accounts look gone than the limit allows:
// that points at a wrong Clerk key (another instance) rather than at real deletions.
var ErrTooManyGone = errors.New("too many accounts look deleted: check CLERK_SECRET_KEY, or raise the limit with --max")

// ReconcileOptions says how ReconcileDeleted acts. The zero value is the dry run.
type ReconcileOptions struct {
	// Apply deletes the accounts found; false only reports them.
	Apply bool
	// Max is the most accounts one run may delete; 0 means 20% of the accounts linked to Clerk.
	Max int
}

// ReconcileResult is what ReconcileDeleted found and did.
type ReconcileResult struct {
	// Checked is how many accounts linked to Clerk were asked about.
	Checked int
	// Gone are the accounts whose Clerk user no longer exists.
	Gone []uuid.UUID
	// Deleted is how many of them were deleted (always 0 in a dry run).
	Deleted int
}

// ReconcileDeleted finds every account whose Clerk user no longer exists (research R7): after restoring a backup made before
// an account was deleted, the account comes back from the copy but its Clerk user was deleted with it. By default it only
// reports them (dry run); with opts.Apply it deletes each one again in its own transaction and records it as a completed
// deletion, unless more than opts.Max (20% of the linked accounts by default) look gone, which aborts with ErrTooManyGone
// before deleting anything.
func (s *Service) ReconcileDeleted(ctx context.Context, exists UserExists, opts ReconcileOptions) (ReconcileResult, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, clerk_user_id FROM accounts WHERE clerk_user_id IS NOT NULL ORDER BY created_at`)
	if err != nil {
		return ReconcileResult{}, fmt.Errorf("listing the accounts: %w", err)
	}
	type account struct {
		id    uuid.UUID
		clerk string
	}
	var accounts []account
	for rows.Next() {
		var a account
		if err := rows.Scan(&a.id, &a.clerk); err != nil {
			rows.Close()
			return ReconcileResult{}, fmt.Errorf("listing the accounts: %w", err)
		}
		accounts = append(accounts, a)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return ReconcileResult{}, fmt.Errorf("listing the accounts: %w", err)
	}

	var res ReconcileResult
	for _, a := range accounts {
		ok, err := exists(ctx, a.clerk)
		if err != nil {
			return res, fmt.Errorf("asking the sign-in provider: %w", err)
		}
		res.Checked++
		if !ok {
			res.Gone = append(res.Gone, a.id)
		}
	}
	if !opts.Apply || len(res.Gone) == 0 {
		return res, nil
	}
	limit := opts.Max
	if limit <= 0 {
		limit = res.Checked / 5
	}
	if len(res.Gone) > limit {
		return res, ErrTooManyGone
	}

	for _, id := range res.Gone {
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return res, err
		}
		now := s.repo.now()
		if err := Purge(ctx, tx, id); err != nil {
			_ = tx.Rollback(context.WithoutCancel(ctx))
			return res, err
		}
		// The copy may still hold the open request: close it, and keep the record of this deletion.
		if _, err := tx.Exec(ctx, `UPDATE account_deletions d SET completed_at = $2, clerk_user_id = NULL
			WHERE d.account_id = $1 AND `+OpenSQL, id, now); err != nil {
			_ = tx.Rollback(context.WithoutCancel(ctx))
			return res, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO account_deletions (account_id, requested_at, scheduled_for, completed_at)
			SELECT $1::uuid, $2::timestamptz, $2::timestamptz + interval '1 second', $2::timestamptz
			WHERE NOT EXISTS (SELECT 1 FROM account_deletions WHERE account_id = $1 AND completed_at IS NOT NULL)`, id, now); err != nil {
			_ = tx.Rollback(context.WithoutCancel(ctx))
			return res, err
		}
		if err := tx.Commit(ctx); err != nil {
			return res, err
		}
		res.Deleted++
	}
	return res, nil
}

// RunEvery runs RunOnce now and then every interval until ctx ends (started in cmd/api). Errors were already reported.
func (s *Service) RunEvery(ctx context.Context, interval time.Duration) {
	for {
		_, _ = s.RunOnce(ctx)
		select {
		case <-ctx.Done():
			return
		case <-time.After(interval):
		}
	}
}
