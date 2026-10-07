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
func (s *Service) List(ctx context.Context, childID uuid.UUID, from, to time.Time, actor uuid.UUID) (*RoutineList, error) {
	if err := checkWindow(from, to, maxListWindow); err != nil {
		return nil, err
	}
	list, err := s.repo.ListByChild(ctx, childID, from, to)
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, 0, len(list.Routines))
	for _, v := range list.Routines {
		ids = append(ids, v.ID)
	}
	muted, err := s.repo.MutedAmong(ctx, actor, ids)
	if err != nil {
		return nil, err
	}
	for i := range list.Routines {
		list.Routines[i].MyReminders = !muted[list.Routines[i].ID]
	}
	return list, nil
}

// Get returns a routine with the doses of [from, to) (at most 62 days: one month of the calendar).
func (s *Service) Get(ctx context.Context, routineID uuid.UUID, from, to time.Time, actor uuid.UUID) (*RoutineView, error) {
	if err := checkWindow(from, to, maxGetWindow); err != nil {
		return nil, err
	}
	return s.get(ctx, routineID, from, to, actor)
}

// get reads the routine and says whether the session still gets its reminders.
func (s *Service) get(ctx context.Context, routineID uuid.UUID, from, to time.Time, actor uuid.UUID) (*RoutineView, error) {
	v, err := s.repo.Get(ctx, routineID, from, to)
	if err != nil {
		return nil, err
	}
	muted, err := s.repo.MutedAmong(ctx, actor, []uuid.UUID{routineID})
	if err != nil {
		return nil, err
	}
	v.MyReminders = !muted[routineID]
	return v, nil
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
	return s.get(ctx, id, from, from.AddDate(0, 0, 1), createdBy)
}

// MarkDose marks or unmarks a dose of the routine (see Repository.UpdateDoseStatus).
func (s *Service) MarkDose(ctx context.Context, routineID, doseID uuid.UUID, taken bool, actor Actor) (*Dose, error) {
	return s.repo.UpdateDoseStatus(ctx, routineID, doseID, taken, actor)
}

// viewToday reads the routine with its doses of its own local today (what every mutation answers with).
func (s *Service) viewToday(ctx context.Context, id uuid.UUID, utcOffsetMinutes int, actor uuid.UUID) (*RoutineView, error) {
	local := s.now().In(localZone(utcOffsetMinutes))
	from := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, local.Location())
	return s.get(ctx, id, from, from.AddDate(0, 0, 1), actor)
}

// Update replaces a routine's form (the paid plan's). The first day may be in the past: the routine already started.
func (s *Service) Update(ctx context.Context, routineID uuid.UUID, in Input, actor uuid.UUID) (*RoutineView, error) {
	routine, errs := ValidateEdit(in, s.now())
	if errs.HasErrors() {
		return nil, errs
	}
	if err := s.repo.Update(ctx, routineID, routine); err != nil {
		return nil, err
	}
	return s.viewToday(ctx, routineID, routine.UtcOffsetMinutes, actor)
}

// Pause pauses an active routine.
func (s *Service) Pause(ctx context.Context, routineID uuid.UUID, actor uuid.UUID) (*RoutineView, error) {
	if err := s.repo.Pause(ctx, routineID); err != nil {
		return nil, err
	}
	return s.viewToday(ctx, routineID, 0, actor)
}

// Resume resumes a paused routine, reading its times in the zone the device sends now.
func (s *Service) Resume(ctx context.Context, routineID uuid.UUID, utcOffsetMinutes int, actor uuid.UUID) (*RoutineView, error) {
	if utcOffsetMinutes < -840 || utcOffsetMinutes > 840 {
		return nil, ValidationErrors{{Field: "utcOffsetMinutes", Message: "must be between -840 and 840"}}
	}
	if err := s.repo.Resume(ctx, routineID, utcOffsetMinutes); err != nil {
		return nil, err
	}
	return s.viewToday(ctx, routineID, utcOffsetMinutes, actor)
}

// Finish ends a routine for good (idempotent).
func (s *Service) Finish(ctx context.Context, routineID uuid.UUID, actor uuid.UUID) (*RoutineView, error) {
	if err := s.repo.Finish(ctx, routineID); err != nil {
		return nil, err
	}
	return s.viewToday(ctx, routineID, 0, actor)
}

// SetMyReminders turns the session's own reminders of the routine on or off.
func (s *Service) SetMyReminders(ctx context.Context, routineID, accountID uuid.UUID, enabled bool) error {
	return s.repo.SetMuted(ctx, routineID, accountID, !enabled)
}
