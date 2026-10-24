package vaccination

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Service holds the rules of the vaccination card. Reading and validating happen before any transaction opens.
type Service struct {
	repo *Repository
	now  func() time.Time
}

// NewService creates a Service.
func NewService(repo *Repository) *Service { return &Service{repo: repo, now: time.Now} }

// List is the child's doses.
func (s *Service) List(ctx context.Context, childID uuid.UUID) ([]Vaccination, error) {
	return s.repo.List(ctx, childID)
}

// Create validates and records a dose.
func (s *Service) Create(ctx context.Context, childID, actor uuid.UUID, in Input) (*Vaccination, error) {
	c, err := s.clean(ctx, childID, in)
	if err != nil {
		return nil, err
	}
	return s.repo.Create(ctx, childID, actor, c, in.AllowDuplicate)
}

// Update validates and corrects a dose.
func (s *Service) Update(ctx context.Context, childID, id, actor uuid.UUID, in Input) (*Vaccination, error) {
	c, err := s.clean(ctx, childID, in)
	if err != nil {
		return nil, err
	}
	return s.repo.Update(ctx, childID, id, actor, c, in.AllowDuplicate)
}

// Delete removes a dose.
func (s *Service) Delete(ctx context.Context, childID, id uuid.UUID) error {
	return s.repo.Delete(ctx, childID, id)
}

func (s *Service) clean(ctx context.Context, childID uuid.UUID, in Input) (Cleaned, error) {
	birth, err := s.repo.ChildBirthDate(ctx, childID)
	if err != nil {
		return Cleaned{}, err
	}
	c, errs := Validate(in, birth, s.now().UTC())
	if len(errs) > 0 {
		return Cleaned{}, errs
	}
	return c, nil
}
