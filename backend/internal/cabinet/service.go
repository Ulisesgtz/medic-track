package cabinet

import (
	"context"

	"github.com/google/uuid"
)

// Service validates what the form sends and asks the repository. Who may do what is decided before (the route's level); the
// plan and the cap inside the repository's transaction.
type Service struct {
	repo *Repository
}

// NewService creates a cabinet Service.
func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// List is the family's cabinet and whether the owner is on the paid plan (what adding needs).
func (s *Service) List(ctx context.Context, accountID uuid.UUID) ([]Item, bool, error) {
	items, err := s.repo.List(ctx, accountID)
	if err != nil {
		return nil, false, err
	}
	paid, err := s.repo.PaidPlan(ctx, accountID)
	return items, paid, err
}

// Get is one medicine and whether the owner is on the paid plan.
func (s *Service) Get(ctx context.Context, accountID, itemID uuid.UUID) (Item, bool, error) {
	it, err := s.repo.Get(ctx, accountID, itemID)
	if err != nil {
		return Item{}, false, err
	}
	paid, err := s.repo.PaidPlan(ctx, accountID)
	return it, paid, err
}

// Create validates and adds a medicine; photoBase64 "" means no photo.
func (s *Service) Create(ctx context.Context, accountID, actor uuid.UUID, in Input, photoBase64 string) (Item, error) {
	clean, errs := Validate(in)
	var photo []byte
	if photoBase64 != "" {
		var perrs ValidationErrors
		photo, perrs = DecodePhoto(photoBase64)
		errs = append(errs, perrs...)
	}
	if len(errs) > 0 {
		return Item{}, errs
	}
	id, err := s.repo.Create(ctx, accountID, actor, clean, photo)
	if err != nil {
		return Item{}, err
	}
	return s.repo.Get(ctx, accountID, id)
}

// Update validates and replaces a medicine. photoBase64 nil keeps the photo, "" removes it, anything else replaces it.
func (s *Service) Update(ctx context.Context, accountID, itemID, actor uuid.UUID, in Input, photoBase64 *string) (Item, error) {
	clean, errs := Validate(in)
	change := PhotoChange{Keep: photoBase64 == nil}
	if photoBase64 != nil && *photoBase64 == "" {
		change = PhotoChange{Remove: true}
	} else if photoBase64 != nil {
		photo, perrs := DecodePhoto(*photoBase64)
		errs = append(errs, perrs...)
		change = PhotoChange{Photo: photo}
	}
	if len(errs) > 0 {
		return Item{}, errs
	}
	if err := s.repo.Update(ctx, accountID, itemID, actor, clean, change); err != nil {
		return Item{}, err
	}
	return s.repo.Get(ctx, accountID, itemID)
}

// Delete removes a medicine.
func (s *Service) Delete(ctx context.Context, accountID, itemID uuid.UUID) error {
	return s.repo.Delete(ctx, accountID, itemID)
}

// Photo is a medicine's image.
func (s *Service) Photo(ctx context.Context, accountID, itemID uuid.UUID) ([]byte, error) {
	return s.repo.Photo(ctx, accountID, itemID)
}
