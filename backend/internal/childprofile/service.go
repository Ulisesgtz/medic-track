package childprofile

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Service holds the rules of the correction. Validating happens before the transaction opens; the plan, the conflicts and the cap
// are decided inside it, with the child's row locked.
type Service struct {
	repo *Repository
	now  func() time.Time
}

// NewService creates a Service.
func NewService(repo *Repository) *Service { return &Service{repo: repo, now: time.Now} }

// Update validates and corrects the child.
func (s *Service) Update(ctx context.Context, childID, actor uuid.UUID, in Input) (*Saved, error) {
	c, errs := Validate(in, s.now().UTC())
	if len(errs) > 0 {
		return nil, errs
	}
	return s.repo.Update(ctx, childID, actor, c)
}
