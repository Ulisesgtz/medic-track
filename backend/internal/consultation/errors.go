package consultation

import "errors"

// Domain errors returned by Service, mapped to HTTP status codes by Handler.
var (
	// ErrChildNotFound is returned when no child exists for a given id
	// (specs/004-detalle-consulta-hijo FR-001/FR-004).
	ErrChildNotFound = errors.New("child not found")

	// ErrConsultationNotFound is returned when no consultation exists for a
	// given id (FR-013).
	ErrConsultationNotFound = errors.New("consultation not found")

	// ErrDoseNotFound is returned when no dose exists for a given id, or it
	// doesn't belong to the given consultation (FR-011).
	ErrDoseNotFound = errors.New("dose not found")

	// ErrSymptomNotAvailable is returned when a consultation names a symptom
	// that isn't in the catalog or was retired from it (specs/012 FR-010).
	ErrSymptomNotAvailable = errors.New("symptom not available")

	// ErrMedicationNotFound is returned when no medication exists for a given id, or it doesn't belong to the given
	// consultation (specs/016).
	ErrMedicationNotFound = errors.New("medication not found")

	// ErrNothingToEnd is returned when a medication has no doses left ahead: there is no treatment to end.
	ErrNothingToEnd = errors.New("nothing to end")

	// ErrNothingToExtend is returned when a medication can't be extended (specs/020): it was ended, or it has no
	// unregistered dose left to cover — also what a second attempt for the same doses gets, so nothing is ever added twice.
	ErrNothingToExtend = errors.New("nothing to extend")

	// ErrDoseForbidden is returned when someone unmarks a dose they may not: only the person who marked it, or someone who
	// can do everything (the owner or a Tutor), unmarks it (specs/032).
	ErrDoseForbidden = errors.New("not allowed to unmark this dose")

	// ErrPlanLimit is what a *PlanLimitError matches with errors.Is: the account's plan doesn't include what the
	// parent asked for (specs/030-reglas-plan-gratis).
	ErrPlanLimit = errors.New("the free plan does not include this")

	// ErrEditConflict is returned when an edit was made on a version of the consultation that is no longer the saved one:
	// someone saved another edit after the form was opened (specs/051). Nothing is saved.
	ErrEditConflict = errors.New("the consultation changed since it was opened")

	// ErrMedicationHasMarks is returned when an edit takes out a medication with at least one marked dose (specs/051):
	// what was registered is never deleted. Nothing is saved.
	ErrMedicationHasMarks = errors.New("the medication has marked doses")

	// ErrPhotoLimit is returned when the account already keeps MaxPhotosPerAccount prescription photos: the consultation can
	// still be saved, without a photo.
	ErrPhotoLimit = errors.New("the account reached its limit of prescription photos")
)

// MaxPhotosPerAccount is how many consultations with a prescription photo one account can keep (every plan). Past it a
// consultation is saved without a photo, and everything already saved stays as it is.
const MaxPhotosPerAccount = 100

// What the free plan leaves out. Specs/030: a second consultation while one treatment is still active, and saving a
// consultation only as a record. Specs/031: searching and filtering the history. Their names are the `reason` the API sends.
const (
	PlanLimitActiveTreatment = "active_treatment"
	PlanLimitRecordOnly      = "record_only"
	PlanLimitHistorySearch   = "history_search"
)

// PlanLimitError says which rule of the free plan stopped a consultation from being saved.
type PlanLimitError struct {
	Reason string
}

func (e *PlanLimitError) Error() string { return ErrPlanLimit.Error() + ": " + e.Reason }

// Unwrap lets errors.Is(err, ErrPlanLimit) match, like account.FreemiumLimitError does for its sentinel.
func (e *PlanLimitError) Unwrap() error { return ErrPlanLimit }

// ValidationError describes a single field-level validation failure.
type ValidationError struct {
	Field   string
	Message string
}

// ValidationErrors is a collection of field-level validation failures,
// returned together so the client can show all of them at once.
type ValidationErrors []ValidationError

func (v ValidationErrors) Error() string {
	if len(v) == 0 {
		return "validation error"
	}
	return v[0].Field + ": " + v[0].Message
}

func (v ValidationErrors) HasErrors() bool {
	return len(v) > 0
}
