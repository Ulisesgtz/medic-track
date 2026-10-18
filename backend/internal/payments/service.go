package payments

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Reporter records a failure of a background process or of the notices in error_logs (satisfied by *jobreport.Reporter). The
// messages are fixed texts: never an address, a token, a key or a card.
type Reporter interface {
	Report(kind, message string, accountID *uuid.UUID)
}

// Topics of the provider's notices that are processed.
const (
	TopicSubscription      = "subscription_preapproval"
	TopicAuthorizedPayment = "subscription_authorized_payment"
	TopicPayment           = "payment"
)

const subscriptionReason = "PediTrack: plan completo (anual)"

// Service holds the rules of the subscriptions: starting one, reading its state, canceling it and applying what the provider
// reports. The plan of the account is only ever written by Repository.Recompute, in the same transaction.
type Service struct {
	repo     *Repository
	provider Provider
	cfg      Config
	reporter Reporter
	now      func() time.Time
}

// NewService creates a Service.
func NewService(repo *Repository, provider Provider, cfg Config) *Service {
	return &Service{repo: repo, provider: provider, cfg: cfg, now: time.Now}
}

// SetReporter makes the failures of the notices and of the sweeper be recorded.
func (s *Service) SetReporter(r Reporter) { s.reporter = r }

func (s *Service) report(kind, message string) {
	if s.reporter != nil {
		s.reporter.Report(kind, message, nil)
	}
}

// Available reports whether the charge can run in this environment.
func (s *Service) Available() bool { return s.cfg.Available() }

// PublicSubscription is what the app is told about a subscription: no provider id, no card, no e-mail.
type PublicSubscription struct {
	Status        Status
	PaidThrough   *time.Time
	Renews        bool
	NextRenewalAt *time.Time
	GraceUntil    *time.Time
	EndedAt       *time.Time
	// CheckoutURL is only given while the subscription waits for its payment.
	CheckoutURL string
}

// State is what /planes needs (contracts/api.md).
type State struct {
	Available     bool
	PriceMXN      int
	CanSubscribe  bool
	BlockedReason string
	CoveredBy     string
	Subscription  *PublicSubscription
}

// State reads the state for the account. It never depends on the plan.
func (s *Service) State(ctx context.Context, accountID uuid.UUID) (State, error) {
	d, err := s.repo.CanSubscribe(ctx, accountID)
	if err != nil {
		return State{}, err
	}
	st := State{Available: s.cfg.Available(), PriceMXN: s.cfg.PriceMXN, BlockedReason: d.Reason, CoveredBy: d.CoveredBy}
	switch {
	case d.Reason == "" && !st.Available:
		st.BlockedReason = ReasonUnavailable
	case d.Reason == "":
		st.CanSubscribe = true
	}
	cur, err := s.repo.Current(ctx, accountID)
	if err != nil {
		return State{}, err
	}
	if cur == nil {
		cur, err = s.repo.LastEnded(ctx, accountID)
		if err != nil {
			return State{}, err
		}
	}
	if cur != nil {
		st.Subscription = publicOf(*cur)
	}
	return st, nil
}

func publicOf(sub Subscription) *PublicSubscription {
	p := &PublicSubscription{Status: sub.Status, PaidThrough: sub.PaidThrough, NextRenewalAt: sub.NextRenewalAt, GraceUntil: sub.GraceUntil}
	p.Renews = sub.Status == StatusActive || sub.Status == StatusGrace
	switch sub.Status {
	case StatusPending:
		p.CheckoutURL = sub.CheckoutURL
	case StatusEnded:
		ended := sub.UpdatedAt
		p.EndedAt = &ended
	}
	return p
}

// SubscribeResult is the page where the person pays; Reused is true when a pending subscription of the last 24 hours was used.
type SubscribeResult struct {
	CheckoutURL string
	Reused      bool
}

// Subscribe starts the payment. In one transaction with the account's row locked: the rule of who can subscribe (FR-003, FR-011),
// the reuse of a recent pending subscription, the closing of a canceled one (its days are carried to the new one, so there is no
// gap), the creation at the provider and the row. If the provider fails nothing is saved. The person's e-mail and the payment page
// are never written to a log or an error.
func (s *Service) Subscribe(ctx context.Context, accountID uuid.UUID) (SubscribeResult, error) {
	if !s.cfg.Available() {
		return SubscribeResult{}, ErrUnavailable
	}
	// The family is read before the transaction: see familyInfo.
	fam, err := s.repo.familyOf(ctx, accountID)
	if err != nil {
		return SubscribeResult{}, err
	}
	tx, err := s.repo.pool.Begin(ctx)
	if err != nil {
		return SubscribeResult{}, fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	acc, err := lockAccount(ctx, tx, accountID)
	if err != nil {
		return SubscribeResult{}, err
	}
	d, err := s.repo.Decide(ctx, tx, accountID, acc, fam)
	if err != nil {
		return SubscribeResult{}, err
	}
	open, err := openSubscription(ctx, tx, accountID)
	if err != nil {
		return SubscribeResult{}, err
	}
	if d.Reason == ReasonPending && open != nil {
		return SubscribeResult{CheckoutURL: open.CheckoutURL, Reused: true}, nil
	}
	if !d.Allowed() || (open != nil && (open.Status == StatusActive || open.Status == StatusGrace)) {
		reason := d.Reason
		if reason == "" {
			reason = ReasonAlreadyPaid
		}
		return SubscribeResult{}, &NotAllowedError{Reason: reason, CoveredBy: d.CoveredBy}
	}

	now := s.now()
	var carry *time.Time
	if open != nil { // a canceled one (it will not renew) or a pending one that expired: closed, its days carried
		if open.PaidThrough != nil && open.PaidThrough.After(now) {
			carry = open.PaidThrough
		}
		open.Status, open.NextRenewalAt, open.GraceUntil, open.CheckoutURL = StatusEnded, nil, nil, ""
		if err := update(ctx, tx, *open, now); err != nil {
			return SubscribeResult{}, err
		}
	}

	created, err := s.provider.CreateSubscription(ctx, CreateRequest{
		Reason: subscriptionReason, ExternalReference: accountID.String(), PayerEmail: acc.email,
		AmountMXN: s.cfg.PriceMXN, FrequencyMonths: 12, BackURL: s.cfg.BackURL(), NotificationURL: s.cfg.WebhookURL,
	})
	if err != nil {
		message := "The payment provider did not create the subscription"
		var refused *RefusedError
		if errors.As(err, &refused) {
			message += " (" + refused.Detail() + ")"
		}
		s.report("create", message)
		return SubscribeResult{}, ErrUnavailable
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO subscriptions (account_id, provider, provider_subscription_id, status, paid_through, checkout_url, created_at, updated_at)
		VALUES ($1, $2, $3, 'pending', $4, $5, $6, $6)`, accountID, s.provider.Name(), created.ID, carry, created.CheckoutURL, now)
	if err != nil {
		return SubscribeResult{}, fmt.Errorf("inserting the subscription: %w", err)
	}
	if err := s.repo.Recompute(ctx, tx, accountID); err != nil {
		return SubscribeResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SubscribeResult{}, fmt.Errorf("committing the subscription: %w", err)
	}
	return SubscribeResult{CheckoutURL: created.CheckoutURL}, nil
}

// ProcessNotification applies a notice of the provider. The notice only says «this resource changed»: the real state is read
// from the provider, so a repeated or out-of-order notice gives the same result and the notice's body never decides anything.
// An unknown subscription or resource is reported and ignored (nil). A temporary failure of the provider is returned so the handler
// answers 500 and the provider retries.
func (s *Service) ProcessNotification(ctx context.Context, topic, resourceID string) error {
	switch topic {
	case TopicSubscription:
		remote, err := s.provider.GetSubscription(ctx, resourceID)
		if err != nil {
			return s.providerFailed(err)
		}
		return s.apply(ctx, topic, resourceID, remote, nil)
	case TopicAuthorizedPayment, TopicPayment:
		var pay RemotePayment
		var err error
		if topic == TopicPayment {
			pay, err = s.provider.GetPayment(ctx, resourceID)
		} else {
			pay, err = s.provider.GetAuthorizedPayment(ctx, resourceID)
		}
		if err != nil {
			return s.providerFailed(err)
		}
		if pay.SubscriptionID == "" {
			s.report("webhook", "A payment notice did not belong to a subscription")
			return nil
		}
		remote, err := s.provider.GetSubscription(ctx, pay.SubscriptionID)
		if err != nil {
			return s.providerFailed(err)
		}
		return s.apply(ctx, topic, resourceID, remote, &pay)
	}
	return nil
}

// providerFailed classifies an error of the provider: an unknown resource is ignored, anything else is returned to be retried.
func (s *Service) providerFailed(err error) error {
	if errors.Is(err, ErrRemoteNotFound) {
		s.report("webhook", "A notice named a resource the provider does not have")
		return nil
	}
	s.report("verify", "The payment provider could not be asked about a notice")
	return fmt.Errorf("%w: asking the provider", ErrTemporary)
}

// apply writes what the provider reports into the subscription, in one transaction with the account's row locked, and recomputes
// the plan. The event is recorded first: a repeated one changes nothing.
func (s *Service) apply(ctx context.Context, topic, resourceID string, remote Remote, pay *RemotePayment) error {
	tx, err := s.repo.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	sub, err := s.repo.bySubscriptionID(ctx, tx, s.provider.Name(), remote.ID)
	if err != nil {
		return err
	}
	if sub == nil {
		s.report("webhook", "A notice named a subscription PediTrack does not know")
		return nil
	}
	state := remote.Status
	modified := remote.LastModified
	if pay != nil {
		state += "/" + pay.Status
		if pay.LastModified.After(modified) {
			modified = pay.LastModified
		}
	}
	key := fmt.Sprintf("%s|%s|%s|%d", topic, resourceID, state, modified.UnixMilli())
	fresh, err := recordEvent(ctx, tx, s.provider.Name(), key, topic, resourceID, &sub.ID)
	if err != nil {
		return err
	}
	if !fresh {
		return nil
	}
	now := s.now()
	next := nextState(*sub, remote, pay, now, s.cfg.GraceDays)
	if err := update(ctx, tx, next, now); err != nil {
		return err
	}
	if err := s.repo.Recompute(ctx, tx, sub.AccountID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing the notice: %w", err)
	}
	return nil
}

// nextState is the table of states of contracts/webhook.md: what a subscription becomes given what the provider reports. Pure.
func nextState(sub Subscription, remote Remote, pay *RemotePayment, now time.Time, graceDays int) Subscription {
	n := sub
	n.LastCheckedAt = &now
	if sub.Status == StatusEnded {
		return n // terminal: a new subscription is a new row
	}
	enterGrace := func() {
		if sub.Status != StatusActive && sub.Status != StatusGrace {
			return // one that never paid is not given a grace period
		}
		if n.Status != StatusGrace {
			until := now.AddDate(0, 0, graceDays)
			n.Status, n.GraceUntil = StatusGrace, &until
		}
	}
	switch remote.Status {
	case "cancelled":
		n.NextRenewalAt, n.GraceUntil, n.CheckoutURL = nil, nil, ""
		if sub.PaidThrough != nil && sub.PaidThrough.After(now) {
			n.Status = StatusCanceled
		} else {
			n.Status = StatusEnded
		}
	case "paused":
		enterGrace()
	case "authorized":
		switch {
		case sub.Status == StatusCanceled:
			// We asked to cancel; a late «authorized» does not bring it back.
		case pay != nil && (pay.Status == "rejected" || pay.Status == "recycling"):
			enterGrace()
		case sub.Status == StatusGrace && (pay == nil || pay.Status != "approved") && !newerPeriod(sub, remote):
			// A notice about the subscription alone does not end a grace period: only an approved charge does.
		default:
			n.Status, n.GraceUntil, n.CheckoutURL = StatusActive, nil, ""
			through := n.PaidThrough
			if remote.NextPaymentDate != nil {
				n.NextRenewalAt = remote.NextPaymentDate
				if through == nil || remote.NextPaymentDate.After(*through) {
					through = remote.NextPaymentDate
				}
			} else if through == nil || !through.After(now) {
				year := now.AddDate(1, 0, 0)
				through = &year
			}
			n.PaidThrough = through
		}
	}
	return n
}

// newerPeriod reports whether the provider's next charge date is past the one we had: a new period was charged.
func newerPeriod(sub Subscription, remote Remote) bool {
	return remote.NextPaymentDate != nil && sub.PaidThrough != nil && remote.NextPaymentDate.After(*sub.PaidThrough)
}

// Cancel stops the renewals (history 3). An active or grace subscription is canceled at the provider and becomes `canceled` (the
// plan lasts until `paid_through`); one that never paid becomes `ended`; anything else is left as it is (idempotent). If the provider
// fails nothing changes and ErrProvider is returned: the person never ends up canceled here and charged there.
func (s *Service) Cancel(ctx context.Context, accountID uuid.UUID) error {
	tx, err := s.repo.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := lockAccount(ctx, tx, accountID); err != nil {
		return err
	}
	sub, err := openSubscription(ctx, tx, accountID)
	if err != nil {
		return err
	}
	if sub == nil || sub.Status == StatusCanceled {
		return nil
	}
	if err := s.provider.CancelSubscription(ctx, sub.ProviderID); err != nil && !errors.Is(err, ErrRemoteNotFound) {
		s.report("cancel", "The payment provider did not cancel the subscription")
		return ErrProvider
	}
	now := s.now()
	sub.NextRenewalAt, sub.GraceUntil, sub.CheckoutURL = nil, nil, ""
	// A pending one that carried days from a canceled subscription keeps them (canceled lasts until `paid_through`); one that never
	// paid and carries nothing ends.
	if sub.Status == StatusPending && (sub.PaidThrough == nil || !sub.PaidThrough.After(now)) {
		sub.Status = StatusEnded
	} else {
		sub.Status = StatusCanceled
	}
	if err := update(ctx, tx, *sub, now); err != nil {
		return err
	}
	if err := s.repo.Recompute(ctx, tx, accountID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing the cancellation: %w", err)
	}
	return nil
}
