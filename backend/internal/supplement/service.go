package supplement

import (
	"context"
	"time"

	"github.com/google/uuid"
)

const (
	maxListWindow = 48 * time.Hour
	maxGetWindow  = 62 * 24 * time.Hour
)

// Service holds the rules of routines that aren't SQL: the form's validation and the windows of a read.
type Service struct {
	repo *Repository
	now  func() time.Time
}

// NewService creates a Service backed by the given repository.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo, now: time.Now}
}

func checkWindow(from, to time.Time, max time.Duration) error {
	if !to.After(from) {
		return ValidationErrors{{Field: "to", Message: "must be after from"}}
	}
	if to.Sub(from) > max {
		return ValidationErrors{{Field: "to", Message: "the window is too long"}}
	}
	return nil
}

// List returns a child's routines with the doses of [from, to) (at most 48 hours: the parent's local day).
func (s *Service) List(ctx context.Context, childID uuid.UUID, from, to time.Time) (*RoutineList, error) {
	if err := checkWindow(from, to, maxListWindow); err != nil {
		return nil, err
	}
	return s.repo.ListByChild(ctx, childID, from, to)
}

// Get returns a routine with the doses of [from, to) (at most 62 days: one month of the calendar).
func (s *Service) Get(ctx context.Context, routineID uuid.UUID, from, to time.Time) (*RoutineView, error) {
	if err := checkWindow(from, to, maxGetWindow); err != nil {
		return nil, err
	}
	return s.repo.Get(ctx, routineID, from, to)
}

// Create validates the form, saves the routine (the plan and the cap are the repository's, under the lock) and returns it
// with its doses of today in its own local day.
func (s *Service) Create(ctx context.Context, childID uuid.UUID, in Input, createdBy uuid.UUID) (*RoutineView, error) {
	routine, errs := ValidateInput(in, s.now())
	if errs.HasErrors() {
		return nil, errs
	}
	id, err := s.repo.Create(ctx, childID, routine, createdBy)
	if err != nil {
		return nil, err
	}
	local := s.now().In(localZone(routine.UtcOffsetMinutes))
	from := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, local.Location())
	return s.repo.Get(ctx, id, from, from.AddDate(0, 0, 1))
}

// MarkDose marks or unmarks a dose of the routine (see Repository.UpdateDoseStatus).
func (s *Service) MarkDose(ctx context.Context, routineID, doseID uuid.UUID, taken bool, actor Actor) (*Dose, error) {
	return s.repo.UpdateDoseStatus(ctx, routineID, doseID, taken, actor)
}
