package childmerge

import (
	"errors"

	"github.com/google/uuid"
)

// Caps the preview warns about (the same ones the writes of each package enforce; the union itself does not check them).
const (
	LimitActiveRoutines   = 10  // supplement.MaxActivePerChild
	LimitCardPhotos       = 10  // vaccination.MaxPhotosPerChild
	LimitMeasurements     = 500 // growth.MaxPerChild
	LimitConsultationPics = 100 // consultation.MaxPhotosPerAccount
)

// MaxPairs is how many pairs one request can carry.
const MaxPairs = 10

// Choices: what a field takes when the two children differ.
const (
	ChoiceOwn    = "own"
	ChoiceFamily = "family"
)

// Errors a pair can end in.
var (
	// ErrNoFamily: the session is not an active Tutor or Caregiver of a family.
	ErrNoFamily = errors.New("no active family")
	// ErrMergeNotAllowed: the actor cannot do everything with the family's children, or the child is not theirs to merge.
	ErrMergeNotAllowed = errors.New("merge not allowed")
	// ErrNotFound: one of the children does not exist (or is not in the place the request says).
	ErrNotFound = errors.New("child not found")
	// ErrBirthDateConflict: the birth date the merged child would have is after a measurement or a vaccine it would hold.
	ErrBirthDateConflict = errors.New("birth date after a measurement or a vaccine")
)

// ChoicesMissingError names the field that differs and has no choice. It never carries a value.
type ChoicesMissingError struct{ Field string }

func (e *ChoicesMissingError) Error() string { return "a choice is missing for " + e.Field }

// PairInput is one pair of a request: the person's own child (source, goes away) and the family's (target, stays).
type PairInput struct {
	OwnChildID    uuid.UUID
	FamilyChildID uuid.UUID
	// Choices is field -> "own" | "family", for the fields that differ.
	Choices map[string]string
}

// MoveCounts is what a union moves (and what child_merges keeps): numbers only.
type MoveCounts struct {
	Consultations  int  `json:"consultations" example:"2"`
	Vaccines       int  `json:"vaccines" example:"9"`
	CardPhotos     int  `json:"cardPhotos" example:"0"`
	Measurements   int  `json:"measurements" example:"1"`
	Supplements    int  `json:"supplements" example:"0"`
	Activities     int  `json:"activities" example:"0"`
	Record         bool `json:"record" example:"true"`
	DevicesRemoved int  `json:"devicesRemoved" example:"1"`
} // @name ChildMergeMoves

// ChildCounts is what a child holds, as the pairing screen shows it.
type ChildCounts struct {
	Consultations int `json:"consultations" example:"2"`
	Vaccines      int `json:"vaccines" example:"9"`
	CardPhotos    int `json:"cardPhotos" example:"0"`
	Measurements  int `json:"measurements" example:"1"`
	Supplements   int `json:"supplements" example:"0"`
	Activities    int `json:"activities" example:"0"`
	ActiveDevices int `json:"activeDevices" example:"1"`
} // @name ChildMergeCounts

// PediatricianView is the pediatrician of a sheet, as it was written.
type PediatricianView struct {
	Name   *string `json:"name"`
	Phone  *string `json:"phone"`
	Office *string `json:"office"`
} // @name ChildMergePediatrician

// RecordView is a summary of a child's sheet (spec 073) for the pairing screen: the values that can differ and how many
// entries the lists have.
type RecordView struct {
	Exists       bool              `json:"exists"`
	BloodType    *string           `json:"bloodType"`
	Pediatrician *PediatricianView `json:"pediatrician"`
	GeneralNote  *string           `json:"generalNote"`
	Allergies    int               `json:"allergies"`
	Conditions   int               `json:"conditions"`
} // @name ChildMergeRecord

// ChildView is a child as the pairing screen shows it.
type ChildView struct {
	ID                 string      `json:"id"`
	Hidden             bool        `json:"hidden"`
	FirstName          string      `json:"firstName"`
	LastName           string      `json:"lastName"`
	BirthDate          string      `json:"birthDate" example:"2022-03-03"`
	Height             *float64    `json:"height"`
	Weight             *float64    `json:"weight"`
	GrowthReferenceSex *string     `json:"growthReferenceSex"`
	Record             RecordView  `json:"record"`
	Counts             ChildCounts `json:"counts"`
} // @name ChildMergeChild

// SuggestedPair is a pairing the app suggests by name; the server never applies it.
type SuggestedPair struct {
	OwnChildID    string `json:"ownChildId"`
	FamilyChildID string `json:"familyChildId"`
	Reason        string `json:"reason" enums:"same_name"`
} // @name ChildMergeSuggestedPair

// Options is GET /family/merge-options.
type Options struct {
	CanMerge             bool            `json:"canMerge"`
	FamilyOwnerFirstName string          `json:"familyOwnerFirstName"`
	OwnChildren          []ChildView     `json:"ownChildren"`
	FamilyChildren       []ChildView     `json:"familyChildren"`
	SuggestedPairs       []SuggestedPair `json:"suggestedPairs"`
} // @name ChildMergeOptions

// OverLimit is a cap the merged child would be over.
type OverLimit struct {
	Kind      string `json:"kind" enums:"supplements,activities,cardPhotos,measurements,consultationPhotos"`
	Resulting int    `json:"resulting"`
	Limit     int    `json:"limit"`
} // @name ChildMergeOverLimit

// TooLong is a list of the sheet that would pass its cap.
type TooLong struct {
	List      string `json:"list" enums:"allergies,conditions"`
	Resulting int    `json:"resulting"`
	Limit     int    `json:"limit"`
} // @name ChildMergeTooLong

// PairPreview is what one union would do (nothing is written).
type PairPreview struct {
	OwnChildID    string      `json:"ownChildId"`
	FamilyChildID string      `json:"familyChildId"`
	Differences   []string    `json:"differences"`
	Moves         MoveCounts  `json:"moves"`
	OverLimits    []OverLimit `json:"overLimits"`
	RecordTooLong *TooLong    `json:"recordTooLong"`
} // @name ChildMergePairPreview
