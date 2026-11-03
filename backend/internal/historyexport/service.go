package historyexport

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
	"github.com/Ulisesgtz/medic-track/backend/internal/vaccination"
)

// Service builds the document's data from what the other packages already read: the history's search, the consultation's detail
// (without the photo) and the vaccination card.
type Service struct {
	repo          *Repository
	consultations *consultation.Repository
	vaccinations  *vaccination.Repository
	now           func() time.Time
}

// NewService creates the Service.
func NewService(repo *Repository, consultations *consultation.Repository, vaccinations *vaccination.Repository) *Service {
	return &Service{repo: repo, consultations: consultations, vaccinations: vaccinations, now: time.Now}
}

// Build checks the plan FIRST — a free family gets a *consultation.PlanLimitError (reason pdf_export) and nothing is read, also
// when only the card was asked for — and then reads the document. The period only narrows the consultations; the card is always
// whole. ErrChildNotFound if the child doesn't exist.
func (s *Service) Build(ctx context.Context, childID uuid.UUID, req Request) (*Document, error) {
	if err := s.consultations.RequirePaid(ctx, childID, consultation.PlanLimitPDFExport); err != nil {
		if errors.Is(err, consultation.ErrChildNotFound) {
			return nil, ErrChildNotFound
		}
		return nil, err
	}
	child, err := s.repo.child(ctx, childID)
	if err != nil {
		return nil, err
	}
	search := func(ctx context.Context, h consultation.HistorySearch) ([]consultation.Consultation, error) {
		return s.consultations.SearchAfterPlan(ctx, childID, h)
	}
	doc, err := s.build(ctx, childSubject(childID), child, search, req)
	if err != nil {
		return nil, err
	}
	if req.Vaccinations {
		if err := s.addVaccinations(ctx, childID, req.Photos, doc); err != nil {
			return nil, err
		}
	}
	return doc, nil
}

// BuildOwn is Build for a person's own history (specs/058): their name on the cover, their own consultations and appointments,
// no vaccination card; the plan is that of their own things. ErrAccountNotFound if the person doesn't exist.
func (s *Service) BuildOwn(ctx context.Context, accountID uuid.UUID, req Request) (*Document, error) {
	if err := s.consultations.RequirePaidPerson(ctx, accountID, consultation.PlanLimitPDFExport); err != nil {
		if errors.Is(err, consultation.ErrAccountNotFound) {
			return nil, ErrAccountNotFound
		}
		return nil, err
	}
	person, err := s.repo.person(ctx, accountID)
	if err != nil {
		return nil, err
	}
	search := func(ctx context.Context, h consultation.HistorySearch) ([]consultation.Consultation, error) {
		return s.consultations.SearchOwnAfterPlan(ctx, accountID, h)
	}
	doc, err := s.build(ctx, personSubject(accountID), person, search, req)
	if err != nil {
		return nil, err
	}
	doc.Own = true
	return doc, nil
}

// build reads what a child's and a person's document share: the running treatment, the next appointment and the consultations.
func (s *Service) build(ctx context.Context, subj subject, cover Child, search searchFunc, req Request) (*Document, error) {
	now := s.now()
	doc := &Document{Child: cover, Consultations: []Consultation{}, Vaccinations: []Vaccination{}}
	var err error
	if doc.ActiveTreatment, err = s.repo.activeTreatment(ctx, subj, now); err != nil {
		return nil, err
	}
	appointments, err := s.repo.scheduledAppointments(ctx, subj, now)
	if err != nil {
		return nil, err
	}
	if len(appointments) > 0 {
		next := appointments[0].Appointment
		doc.NextAppointment = &next
	}
	if req.Photos {
		doc.Photos = &Photos{Consultations: []ConsultationPhoto{}, Card: []CardPhoto{}}
	}
	if req.Consultations {
		if err := s.addConsultations(ctx, search, req, appointments, doc); err != nil {
			return nil, err
		}
	}
	return doc, nil
}

// searchFunc is the history's search of the document's subject, once the plan was decided.
type searchFunc func(ctx context.Context, h consultation.HistorySearch) ([]consultation.Consultation, error)

func (s *Service) addConsultations(ctx context.Context, search searchFunc, req Request, appointments []appointmentRow, doc *Document) error {
	found, err := search(ctx, req.search())
	if err != nil {
		return err
	}
	ids := make([]uuid.UUID, len(found))
	for i, c := range found {
		ids[i] = c.ID
	}
	photos, err := s.repo.withPhoto(ctx, ids)
	if err != nil {
		return err
	}
	byConsultation := map[uuid.UUID]Appointment{}
	for _, a := range appointments {
		if _, seen := byConsultation[a.consultationID]; !seen && a.consultationID != uuid.Nil {
			byConsultation[a.consultationID] = a.Appointment
		}
	}
	// One batch for every consultation found (specs/050 T034), in the history's order.
	consultations, err := s.consultations.ListWithoutPhoto(ctx, ids)
	if err != nil {
		return err
	}
	for _, c := range consultations {
		out := Consultation{
			ID: c.ID, ConsultDate: c.ConsultDate, DoctorName: c.DoctorName, RecordOnly: c.RecordOnly, Notes: c.Notes,
			HasPhoto: photos[c.ID], Symptoms: []Symptom{}, Medications: []Medication{},
		}
		for _, sym := range c.Symptoms {
			out.Symptoms = append(out.Symptoms, Symptom{Code: sym.Code, Name: sym.Name})
		}
		for _, m := range c.Medications {
			out.Medications = append(out.Medications, medicationOf(m))
		}
		if a, ok := byConsultation[c.ID]; ok {
			out.Appointment = &a
		}
		doc.Consultations = append(doc.Consultations, out)
		if doc.Photos != nil && out.HasPhoto {
			doc.Photos.Consultations = append(doc.Photos.Consultations, ConsultationPhoto{ConsultationID: c.ID, ConsultDate: c.ConsultDate, DoctorName: c.DoctorName})
		}
	}
	return nil
}

func (s *Service) addVaccinations(ctx context.Context, childID uuid.UUID, photos bool, doc *Document) error {
	list, err := s.vaccinations.List(ctx, childID)
	if err != nil {
		return err
	}
	for _, v := range list {
		doc.Vaccinations = append(doc.Vaccinations, Vaccination{
			ID: v.ID, Name: v.Name, Custom: v.CustomName != nil, DoseNumber: v.DoseNumber, AppliedOn: v.AppliedOn,
			Lot: v.Lot, Place: v.Place, Notes: v.Notes, CorrectedAt: v.CorrectedAt, CorrectedBy: v.CorrectedByName,
		})
	}
	if photos {
		card, err := s.vaccinations.ListPhotos(ctx, childID)
		if err != nil {
			return err
		}
		for _, p := range card {
			doc.Photos.Card = append(doc.Photos.Card, CardPhoto{ID: p.ID, CreatedAt: p.CreatedAt})
		}
	}
	return nil
}

// medicationOf is the record of one medication: counts of its doses by status (canceled ones left out of the total), its first
// and last dose and the last mark.
func medicationOf(m consultation.Medication) Medication {
	out := Medication{
		Name: m.Name, FrequencyHours: m.FrequencyHours, DurationDays: m.DurationDays, StartTime: m.StartTime, EndedAt: m.EndedAt,
		Extensions: []Extension{},
	}
	for _, e := range m.Extensions {
		out.Extensions = append(out.Extensions, Extension{CreatedAt: e.CreatedAt, AddedDoses: e.AddedDoses})
	}
	var sequence []byte
	for _, d := range m.Doses {
		switch d.Status {
		case consultation.DoseStatusCanceled:
			continue
		case consultation.DoseStatusTaken:
			out.Doses.Taken++
			sequence = append(sequence, SequenceTaken)
		case consultation.DoseStatusUnregistered:
			out.Doses.Unregistered++
			sequence = append(sequence, SequenceUnregistered)
		case consultation.DoseStatusDue:
			out.Doses.Due++
			sequence = append(sequence, SequenceDue)
		default:
			out.Doses.Pending++
			sequence = append(sequence, SequencePending)
		}
		out.Doses.Total++
		at := d.ScheduledAt
		if out.FirstDoseAt == nil {
			out.FirstDoseAt = &at
		}
		out.LastDoseAt = &at
		if d.TakenBy != nil && (out.LastMark == nil || d.TakenBy.At.After(out.LastMark.At)) {
			out.LastMark = &Mark{At: d.TakenBy.At, By: d.TakenBy.Name}
		}
	}
	out.Doses.Sequence = string(sequence)
	return out
}

// search turns the period into the history's criteria: everything, a range of days, or the history's own filters.
func (r Request) search() consultation.HistorySearch {
	switch r.PeriodKind {
	case PeriodRange:
		return consultation.HistorySearch{From: r.From, To: r.To}
	case PeriodFilters:
		f := r.Filters
		return consultation.HistorySearch{Q: f.Q, From: f.From, To: f.To, Doctor: f.Doctor, Medication: f.Medication, SymptomCodes: f.SymptomCodes, Kind: f.Kind}
	default:
		return consultation.HistorySearch{}
	}
}
