package growth

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Service holds the rules of the growth record. Validating happens before any transaction opens.
type Service struct {
	repo             *Repository
	now              func() time.Time
	referenceEnabled bool
}

// NewService creates a Service. The WHO curves stay off until SetReferenceEnabled(true) (WHO_GROWTH_REFERENCE_ENABLED).
func NewService(repo *Repository) *Service { return &Service{repo: repo, now: time.Now} }

// SetReferenceEnabled turns the WHO curves of the chart on or off (research R1: on only with WHO's written permission).
func (s *Service) SetReferenceEnabled(on bool) { s.referenceEnabled = on }

// List is the child's measurements and the child's own data. Every plan.
func (s *Service) List(ctx context.Context, childID uuid.UUID) (List, error) {
	c, err := s.repo.Child(ctx, childID)
	if err != nil {
		return List{}, err
	}
	ms, err := s.repo.List(ctx, childID)
	if err != nil {
		return List{}, err
	}
	return List{Child: c, Measurements: ms}, nil
}

// Create validates and writes a measurement down. Every plan.
func (s *Service) Create(ctx context.Context, childID, actor uuid.UUID, in Input) (*Measurement, error) {
	c, err := s.clean(ctx, childID, in)
	if err != nil {
		return nil, err
	}
	return s.repo.Create(ctx, childID, actor, c)
}

// Update validates and corrects a measurement. Every plan.
func (s *Service) Update(ctx context.Context, childID, id, actor uuid.UUID, in Input) (*Measurement, error) {
	c, err := s.clean(ctx, childID, in)
	if err != nil {
		return nil, err
	}
	return s.repo.Update(ctx, childID, id, actor, c)
}

// Delete removes a measurement. Every plan.
func (s *Service) Delete(ctx context.Context, childID, id uuid.UUID) error {
	return s.repo.Delete(ctx, childID, id)
}

// SetSex saves which WHO table the chart uses. Every plan (it is a datum of the child, like correcting one).
func (s *Service) SetSex(ctx context.Context, childID uuid.UUID, sex Sex) error {
	return s.repo.SetSex(ctx, childID, sex)
}

// Chart is the chart's data: the plan first (ErrPlanRequired before anything is read), then the points and, with a WHO table
// chosen, the reference curves. Nothing here computes where a child stands.
func (s *Service) Chart(ctx context.Context, childID uuid.UUID) (Chart, error) {
	c, err := s.repo.Child(ctx, childID)
	if err != nil {
		return Chart{}, err
	}
	if !c.Paid {
		return Chart{}, ErrPlanRequired
	}
	ms, err := s.repo.List(ctx, childID)
	if err != nil {
		return Chart{}, err
	}
	out := Chart{BirthDate: c.BirthDate.Format("2006-01-02"), Sex: c.Sex, Weight: []ChartPoint{}, Height: []ChartPoint{},
		ReferenceAvailable: s.referenceEnabled}
	// The list is newest first; the chart goes in the order of time.
	for i := len(ms) - 1; i >= 0; i-- {
		m := ms[i]
		on, err := time.Parse("2006-01-02", m.MeasuredOn)
		if err != nil {
			continue
		}
		months := AgeInMonths(c.BirthDate, on)
		if m.WeightKg != nil {
			out.Weight = append(out.Weight, ChartPoint{MeasuredOn: m.MeasuredOn, Months: months, Value: *m.WeightKg})
		}
		if m.HeightCm != nil {
			out.Height = append(out.Height, ChartPoint{MeasuredOn: m.MeasuredOn, Months: months, Value: *m.HeightCm})
		}
	}
	if c.Sex != nil {
		w, h := ReferenceFor(*c.Sex)
		if !s.referenceEnabled {
			w.Curves, h.Curves = []Point{}, []Point{}
		}
		out.WeightReference, out.HeightReference = &w, &h
	}
	return out, nil
}

func (s *Service) clean(ctx context.Context, childID uuid.UUID, in Input) (Cleaned, error) {
	c, err := s.repo.Child(ctx, childID)
	if err != nil {
		return Cleaned{}, err
	}
	cleaned, errs := Validate(in, c.BirthDate, s.now().UTC())
	if len(errs) > 0 {
		return Cleaned{}, errs
	}
	return cleaned, nil
}
