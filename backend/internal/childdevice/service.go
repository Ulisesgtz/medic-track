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

// Redeem exchanges a link's token for the phone's credential.
func (s *Service) Redeem(ctx context.Context, token string) (*Redeemed, error) {
	return s.repo.Redeem(ctx, token, s.now())
}
