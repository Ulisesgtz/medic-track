package payments

import (
	"context"
	"errors"
	"time"
)

// Provider is the payment provider (Mercado Pago, or the fake of the tests). It only ever talks about subscriptions and their
// charges: the card is captured on the provider's own page, so nothing here ever sees one.
type Provider interface {
	// CreateSubscription creates a pending subscription and returns the provider's page where the person pays.
	CreateSubscription(ctx context.Context, req CreateRequest) (Created, error)
	// GetSubscription reads the subscription's real state.
	GetSubscription(ctx context.Context, id string) (Remote, error)
	// GetAuthorizedPayment reads one recurring charge of a subscription.
	GetAuthorizedPayment(ctx context.Context, id string) (RemotePayment, error)
	// GetPayment reads one payment.
	GetPayment(ctx context.Context, id string) (RemotePayment, error)
	// CancelSubscription stops the renewals.
	CancelSubscription(ctx context.Context, id string) error
	// Name is what is stored in subscriptions.provider.
	Name() string
}

// CreateRequest is what is sent to create a subscription. It carries nothing about children or health.
type CreateRequest struct {
	Reason            string
	ExternalReference string // the PediTrack account id
	PayerEmail        string
	AmountMXN         int
	FrequencyMonths   int
	BackURL           string
	NotificationURL   string
}

// Created is the provider's answer to CreateSubscription.
type Created struct {
	ID          string
	CheckoutURL string
}

// Remote is a subscription as the provider reports it.
type Remote struct {
	ID                string
	Status            string // pending | authorized | paused | cancelled
	NextPaymentDate   *time.Time
	LastModified      time.Time
	ExternalReference string
}

// RemotePayment is a charge as the provider reports it.
type RemotePayment struct {
	ID             string
	SubscriptionID string
	Status         string // approved | rejected | recycling | scheduled | processed | cancelled …
	LastModified   time.Time
}

var (
	// ErrRemoteNotFound: the provider has no such resource.
	ErrRemoteNotFound = errors.New("the provider has no such resource")
	// ErrTemporary: the provider failed in a way that is worth retrying (network, 5xx, 429, timeout).
	ErrTemporary = errors.New("the provider failed temporarily")
)
