package payments

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// Fake is an in-memory Provider for the tests and for development (PAYMENTS_DRIVER=fake): it never talks to anyone and its
// «payment page» is a page of the app itself. It is never used in production.
type Fake struct {
	mu       sync.Mutex
	origin   string
	seq      int
	subs     map[string]*fakeSub
	payments map[string]*fakePayment
	now      func() time.Time
}

type fakeSub struct {
	ref      string
	status   string
	next     *time.Time
	modified time.Time
	lastPay  string
}

type fakePayment struct {
	subscription string
	status       string
	modified     time.Time
}

// NewFake creates the fake; `origin` is the frontend's address (where its payment page lives).
func NewFake(origin string) *Fake {
	return &Fake{origin: origin, subs: map[string]*fakeSub{}, payments: map[string]*fakePayment{}, now: time.Now}
}

// Name is what subscriptions.provider holds.
func (f *Fake) Name() string { return DriverFake }

// CreateSubscription creates a pending subscription whose «payment page» is the app's fake checkout.
func (f *Fake) CreateSubscription(_ context.Context, req CreateRequest) (Created, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.seq++
	id := fmt.Sprintf("fake_%d", f.seq)
	f.subs[id] = &fakeSub{ref: req.ExternalReference, status: "pending", modified: f.now()}
	return Created{ID: id, CheckoutURL: f.origin + "/planes/pago-de-prueba?sub=" + id}, nil
}

func (f *Fake) get(id string) (*fakeSub, error) {
	s, ok := f.subs[id]
	if !ok {
		return nil, ErrRemoteNotFound
	}
	return s, nil
}

// GetSubscription reads the fake's state.
func (f *Fake) GetSubscription(_ context.Context, id string) (Remote, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, err := f.get(id)
	if err != nil {
		return Remote{}, err
	}
	return Remote{ID: id, Status: s.status, NextPaymentDate: s.next, LastModified: s.modified, ExternalReference: s.ref}, nil
}

// GetAuthorizedPayment reads one of the fake's charges.
func (f *Fake) GetAuthorizedPayment(_ context.Context, id string) (RemotePayment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.payments[id]
	if !ok {
		return RemotePayment{}, ErrRemoteNotFound
	}
	return RemotePayment{ID: id, SubscriptionID: p.subscription, Status: p.status, LastModified: p.modified}, nil
}

// GetPayment is the same as GetAuthorizedPayment in the fake.
func (f *Fake) GetPayment(ctx context.Context, id string) (RemotePayment, error) {
	return f.GetAuthorizedPayment(ctx, id)
}

// CancelSubscription stops the renewals.
func (f *Fake) CancelSubscription(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, err := f.get(id)
	if err != nil {
		return err
	}
	s.status, s.modified = "cancelled", f.now()
	return nil
}

func (f *Fake) charge(id, status string, next *time.Time) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, err := f.get(id)
	if err != nil {
		return "", err
	}
	if s.status == "cancelled" {
		return "", errors.New("the subscription is cancelled")
	}
	f.seq++
	payID := fmt.Sprintf("fakepay_%d", f.seq)
	now := f.now()
	f.payments[payID] = &fakePayment{subscription: id, status: status, modified: now}
	s.lastPay, s.modified = payID, now
	if status == "approved" {
		s.status, s.next = "authorized", next
	}
	return payID, nil
}

// Approve is the person paying: the subscription becomes authorized with its next charge date. It returns the charge's id.
func (f *Fake) Approve(id string, next time.Time) (string, error) {
	return f.charge(id, "approved", &next)
}

// Renew is an approved renewal charge with the next date.
func (f *Fake) Renew(id string, next time.Time) (string, error) {
	return f.charge(id, "approved", &next)
}

// Reject is a charge that fails (a renewal rejected).
func (f *Fake) Reject(id string) (string, error) { return f.charge(id, "rejected", nil) }

// Pause pauses the subscription (the provider does it when charges keep failing).
func (f *Fake) Pause(id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	s, err := f.get(id)
	if err != nil {
		return err
	}
	s.status, s.modified = "paused", f.now()
	return nil
}
