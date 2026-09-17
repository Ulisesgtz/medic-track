package consultation

import (
	"context"
	"strconv"
	"time"

	"github.com/google/uuid"
)

// maxPhotoBytes caps the decoded prescription photo size (research.md).
const maxPhotoBytes = 8 * 1024 * 1024 // 8 MiB

// CreateMedicationInput is a single medication entry within
// CreateConsultationInput.
type CreateMedicationInput struct {
	Name           string
	FrequencyHours int
	DurationDays   int
	StartTime      *string // "HH:MM", nil means no doses are generated (FR-010)
}

// CreateConsultationInput is the input to Service.CreateConsultation,
// mirroring the POST /children/{childId}/consultations request body
// (contracts/post-consultations.md).
type CreateConsultationInput struct {
	DoctorName  string
	ConsultDate time.Time
	Photo       []byte
	Symptoms    string
	Medications []CreateMedicationInput
}

// Service implements the Consultation/Medication/Dose business rules: field
// validation and dose-schedule generation (FR-004 through FR-016).
type Service struct {
	repo *Repository
}

// NewService creates a consultation Service backed by the given repository.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// ListConsultations lists a child's consultations (FR-001).
func (s *Service) ListConsultations(ctx context.Context, childID uuid.UUID) ([]Consultation, error) {
	return s.repo.GetByChild(ctx, childID)
}

// CreateConsultation validates input and persists a new Consultation with
// its Medications and generated Doses (FR-004 through FR-010).
func (s *Service) CreateConsultation(ctx context.Context, childID uuid.UUID, input CreateConsultationInput) (*Consultation, error) {
	if errs := validateCreateConsultationInput(input); errs.HasErrors() {
		return nil, errs
	}

	c := &Consultation{
		DoctorName:  input.DoctorName,
		ConsultDate: input.ConsultDate,
		Photo:       input.Photo,
		Symptoms:    input.Symptoms,
	}
	for _, m := range input.Medications {
		c.Medications = append(c.Medications, Medication{
			Name:           m.Name,
			FrequencyHours: m.FrequencyHours,
			DurationDays:   m.DurationDays,
			StartTime:      m.StartTime,
		})
	}

	if err := s.repo.Create(ctx, childID, c); err != nil {
		return nil, err
	}
	return c, nil
}

// GetConsultation retrieves a consultation's full detail (FR-013).
func (s *Service) GetConsultation(ctx context.Context, id uuid.UUID) (*Consultation, error) {
	return s.repo.GetByID(ctx, id)
}

// MarkDose sets a dose's taken status, with no restriction based on its
// scheduled date or the treatment's duration (FR-011, FR-016).
func (s *Service) MarkDose(ctx context.Context, doseID uuid.UUID, taken bool) (*Dose, error) {
	return s.repo.UpdateDoseStatus(ctx, doseID, taken)
}

func validateCreateConsultationInput(input CreateConsultationInput) ValidationErrors {
	var errs ValidationErrors

	if input.DoctorName == "" {
		errs = append(errs, ValidationError{Field: "doctorName", Message: "doctor name is required"})
	}
	if input.ConsultDate.IsZero() {
		errs = append(errs, ValidationError{Field: "consultDate", Message: "consult date is required"})
	} else if input.ConsultDate.After(time.Now()) {
		errs = append(errs, ValidationError{Field: "consultDate", Message: "consult date cannot be in the future"})
	}
	if len(input.Photo) == 0 {
		errs = append(errs, ValidationError{Field: "photoBase64", Message: "prescription photo is required"})
	} else if len(input.Photo) > maxPhotoBytes {
		errs = append(errs, ValidationError{Field: "photoBase64", Message: "photo exceeds the 8MB size limit"})
	}
	if len(input.Medications) == 0 {
		// FR-015: a consultation with no medications is invalid.
		errs = append(errs, ValidationError{Field: "medications", Message: "at least one medication is required"})
	}

	for i, m := range input.Medications {
		prefix := "medications"
		if m.Name == "" {
			errs = append(errs, ValidationError{Field: fieldIndex(prefix, i, "name"), Message: "medication name is required"})
		}
		if m.FrequencyHours <= 0 {
			errs = append(errs, ValidationError{Field: fieldIndex(prefix, i, "frequencyHours"), Message: "must be a positive integer"})
		}
		if m.DurationDays <= 0 {
			errs = append(errs, ValidationError{Field: fieldIndex(prefix, i, "durationDays"), Message: "must be a positive integer"})
		}
	}

	return errs
}

func fieldIndex(prefix string, i int, field string) string {
	return prefix + "[" + strconv.Itoa(i) + "]." + field
}
