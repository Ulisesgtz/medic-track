package appointment

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Service holds the rules of appointments that aren't SQL: the validation against the consultation's date and what the
// session sees (the derived status and its own reminders).
type Service struct {
	repo *Repository
	now  func() time.Time
}

// NewService creates a Service backed by the given repository.
func NewService(repo *Repository) *Service { return &Service{repo: repo, now: time.Now} }

// decorate fills what depends on the clock and on who asks.
func (s *Service) decorate(ctx context.Context, actor uuid.UUID, list ...*Appointment) error {
	now := s.now()
	ids := make([]uuid.UUID, 0, len(list))
	for _, a := range list {
		a.Derived = DerivedStatus(a.Status, a.StartsAt, a.UtcOffsetMinutes, now)
		ids = append(ids, a.ID)
	}
	muted, err := s.repo.MutedAmong(ctx, actor, ids)
	if err != nil {
		return err
	}
	for _, a := range list {
		a.MyReminders = !muted[a.ID]
	}
	return nil
}

func (s *Service) get(ctx context.Context, id, actor uuid.UUID) (*Appointment, error) {
	a, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := s.decorate(ctx, actor, a); err != nil {
		return nil, err
	}
	return a, nil
}

// Get returns one appointment.
func (s *Service) Get(ctx context.Context, id, actor uuid.UUID) (*Appointment, error) {
	return s.get(ctx, id, actor)
}

// Create validates against the consultation's date and saves (the plan is the repository's, under the lock).
func (s *Service) Create(ctx context.Context, consultationID uuid.UUID, in Input, createdBy uuid.UUID) (*Appointment, error) {
	date, _, err := s.repo.ConsultDate(ctx, consultationID)
	if err != nil {
		return nil, err
	}
	norm, errs := ValidateInput(in, date)
	if errs.HasErrors() {
		return nil, errs
	}
	id, err := s.repo.Create(ctx, consultationID, norm, createdBy)
	if err != nil {
		return nil, err
	}
	return s.get(ctx, id, createdBy)
}

// Update replaces the appointment's date, note and notices.
func (s *Service) Update(ctx context.Context, id uuid.UUID, in Input, actor uuid.UUID) (*Appointment, error) {
	current, err := s.repo.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	norm, errs := ValidateInput(in, current.ConsultDate)
	if errs.HasErrors() {
		return nil, errs
	}
	if err := s.repo.Update(ctx, id, norm); err != nil {
		return nil, err
	}
	return s.get(ctx, id, actor)
}

// SetStatus marks it done or canceled, or takes «done» back.
func (s *Service) SetStatus(ctx context.Context, id uuid.UUID, to Status, actor uuid.UUID) (*Appointment, error) {
	if to != StatusDone && to != StatusCanceled && to != StatusScheduled {
		return nil, ValidationErrors{{Field: "status", Message: "must be done, canceled or scheduled"}}
	}
	if err := s.repo.SetStatus(ctx, id, to, actor); err != nil {
		return nil, err
	}
	return s.get(ctx, id, actor)
}

// SetMyReminders turns the session's own reminders of the appointment on or off.
func (s *Service) SetMyReminders(ctx context.Context, id, actor uuid.UUID, enabled bool) error {
	return s.repo.SetMuted(ctx, id, actor, !enabled)
}

// ForConsultation is the consultation's scheduled appointment (nil if none) and whether the plan is paid.
func (s *Service) ForConsultation(ctx context.Context, consultationID, actor uuid.UUID) (*Appointment, bool, error) {
	a, paid, err := s.repo.ForConsultation(ctx, consultationID)
	if err != nil || a == nil {
		return nil, paid, err
	}
	return a, paid, s.decorate(ctx, actor, a)
}

// ForChild is the child's next appointment and its history.
func (s *Service) ForChild(ctx context.Context, childID, actor uuid.UUID) (*Appointment, []Appointment, bool, error) {
	next, history, paid, err := s.repo.ForChild(ctx, childID)
	if err != nil {
		return nil, nil, false, err
	}
	all := make([]*Appointment, 0, len(history)+1)
	if next != nil {
		all = append(all, next)
	}
	for i := range history {
		all = append(all, &history[i])
	}
	return next, history, paid, s.decorate(ctx, actor, all...)
}
