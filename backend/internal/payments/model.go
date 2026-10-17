package payments

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// Status is where a subscription is (data-model.md). `pending` is created and not paid yet; `active` has an approved charge;
// `grace` is a failed renewal that still gives the plan for a few days; `canceled` will not renew but the plan lasts until
// `PaidThrough`; `ended` is over.
type Status string

const (
	StatusPending  Status = "pending"
	StatusActive   Status = "active"
	StatusGrace    Status = "grace"
	StatusCanceled Status = "canceled"
	StatusEnded    Status = "ended"
)

const (
	planPaid = "paid"
	planFree = "free"

	sourceManual       = "manual"
	sourceSubscription = "subscription"

	// PendingMaxAge is how long a subscription may wait for its payment before it expires.
	PendingMaxAge = 24 * time.Hour
)

// Reasons a person can't subscribe (the `blockedReason` of the API).
const (
	ReasonAlreadyPaid     = "already_paid"
	ReasonCoveredByFamily = "covered_by_family"
	ReasonPending         = "pending"
	ReasonUnavailable     = "unavailable"
)

var (
	// ErrUnavailable: the charge is not configured or the provider did not answer (nothing was saved).
	ErrUnavailable = errors.New("payments are not available")
	// ErrProvider: the provider refused or did not answer a cancellation (nothing was changed).
	ErrProvider = errors.New("the payment provider failed")
	// ErrNotFound: no such subscription.
	ErrNotFound = errors.New("subscription not found")
)

// NotAllowedError says why an account can't subscribe (FR-003, FR-011).
type NotAllowedError struct {
	Reason    string
	CoveredBy string // first name of the family's owner, only with ReasonCoveredByFamily
}

func (e *NotAllowedError) Error() string { return "subscription not allowed: " + e.Reason }

// Subscription is a stored subscription. It holds no card data and no e-mail.
type Subscription struct {
	ID            uuid.UUID
	AccountID     uuid.UUID
	Provider      string
	ProviderID    string
	Status        Status
	PaidThrough   *time.Time
	NextRenewalAt *time.Time
	GraceUntil    *time.Time
	CheckoutURL   string
	LastCheckedAt *time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// grantsPlan is whether the subscription gives the full plan at `now` (the plan rule of data-model.md).
func (s Subscription) grantsPlan(now time.Time) bool {
	switch s.Status {
	case StatusActive:
		return true
	case StatusGrace:
		return s.GraceUntil != nil && s.GraceUntil.After(now)
	case StatusCanceled, StatusPending:
		// A pending one can carry the days a canceled subscription still had (the person subscribed again): no gap.
		return s.PaidThrough != nil && s.PaidThrough.After(now)
	}
	return false
}

// Decision is the answer of CanSubscribe: Reason is empty when the person can.
type Decision struct {
	Reason    string
	CoveredBy string
}

// Allowed reports whether the person can subscribe.
func (d Decision) Allowed() bool { return d.Reason == "" }
