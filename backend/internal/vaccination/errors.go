package vaccination

import (
	"errors"
	"strings"

	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

var (
	// ErrNotFound is a dose or a photo that doesn't exist or belongs to another child.
	ErrNotFound = errors.New("not found")
	// ErrChildNotFound is a child that doesn't exist.
	ErrChildNotFound = errors.New("child not found")
	// ErrDuplicate is a dose that matches one already recorded (same vaccine, dose number and date); the parent can confirm it.
	ErrDuplicate = errors.New("the dose is already recorded")
	// ErrPhotoLimit is a child that already keeps MaxPhotosPerChild photos of the card.
	ErrPhotoLimit = errors.New("the child reached its limit of vaccination card photos")
)

// ValidationErrors are the invalid fields of an input, with fixed messages that never repeat what was written.
type ValidationErrors []httpx.FieldError

func (v ValidationErrors) Error() string {
	fields := make([]string, 0, len(v))
	for _, e := range v {
		fields = append(fields, e.Field)
	}
	return "invalid fields: " + strings.Join(fields, ", ")
}
