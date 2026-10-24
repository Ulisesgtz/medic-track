package childdevice

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Service is the rules of the child devices over the repository, with an injectable clock.
type Service struct {
	repo *Repository
	now  func() time.Time
}

// NewService creates a Service that reads the real clock.
func NewService(repo *Repository) *Service { return &Service{repo: repo, now: time.Now} }

// SetClock replaces the clock (tests).
func (s *Service) SetClock(now func() time.Time) { s.now = now }

// Now is the service's clock; the middleware uses the same one so tests move everything at once.
func (s *Service) Now() time.Time { return s.now() }

// Repository is the service's repository (the middleware reads the device from it).
func (s *Service) Repository() *Repository { return s.repo }

// CreateLink makes the one-use link of a phone for a child.
func (s *Service) CreateLink(ctx context.Context, childID, actor uuid.UUID, name string) (*Link, string, error) {
	return s.repo.Create(ctx, childID, actor, name, s.now())
}

// List is a child's phones and links.
func (s *Service) List(ctx context.Context, childID uuid.UUID) ([]Link, error) {
	return s.repo.List(ctx, childID, s.now())
}

// Revoke removes a phone, at once.
func (s *Service) Revoke(ctx context.Context, childID, linkID, actor uuid.UUID) error {
	return s.repo.Revoke(ctx, childID, linkID, actor, s.now())
}

// SetReminderDetail chooses what a phone's reminders say.
func (s *Service) SetReminderDetail(ctx context.Context, childID, linkID uuid.UUID, detail string) (*Link, error) {
	return s.repo.SetReminderDetail(ctx, childID, linkID, detail)
}

// Rotate renews a phone's credential.
func (s *Service) Rotate(ctx context.Context, linkID uuid.UUID) (string, time.Time, error) {
	return s.repo.Rotate(ctx, linkID, s.now())
}

// Redeem exchanges a link's token for the phone's credential.
func (s *Service) Redeem(ctx context.Context, token string) (*Redeemed, error) {
	return s.repo.Redeem(ctx, token, s.now())
}
