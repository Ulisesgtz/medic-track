package supplement

import "errors"

// Domain errors, mapped to HTTP statuses by the Handler (contracts/routines.md).
var (
	// ErrRoutineNotFound: no such routine.
	ErrRoutineNotFound = errors.New("routine not found")
	// ErrDoseNotFound: no such dose in that routine.
	ErrDoseNotFound = errors.New("dose not found")
	// ErrRoutineLimit: the child already has the maximum of active routines.
	ErrRoutineLimit = errors.New("routine limit exceeded")
	// ErrRoutineEnded: an ended routine can't be edited, paused or resumed.
	ErrRoutineEnded = errors.New("routine ended")
	// ErrRoutineNotActive: the action needs an active routine.
	ErrRoutineNotActive = errors.New("routine not active")
	// ErrDoseForbidden: only who marked a dose (or someone who can do everything) takes the mark back.
	ErrDoseForbidden = errors.New("dose mark not yours")
	// ErrPlanRequired: the owner account is not on the paid plan (creating, editing and resuming are the paid plan's).
	ErrPlanRequired = errors.New("the plan is not paid")
)

// RoutineLimitError wraps ErrRoutineLimit with the actual limit.
type RoutineLimitError struct{ Limit int }

func (e *RoutineLimitError) Error() string { return ErrRoutineLimit.Error() }
func (e *RoutineLimitError) Unwrap() error { return ErrRoutineLimit }

// PlanLimitReason names which paid-plan rule refused an action (the 422 `reason`).
const PlanLimitSupplements = "supplements"

// PlanLimitError wraps ErrPlanRequired with the reason the client shows.
type PlanLimitError struct{ Reason string }

func (e *PlanLimitError) Error() string { return ErrPlanRequired.Error() }
func (e *PlanLimitError) Unwrap() error { return ErrPlanRequired }

// ValidationError describes one invalid field of a request.
type ValidationError struct {
	Field   string
	Message string
}

// ValidationErrors is a request's invalid fields, returned together.
type ValidationErrors []ValidationError

func (v ValidationErrors) Error() string {
	if len(v) == 0 {
		return "validation error"
	}
	return v[0].Field + ": " + v[0].Message
}

// HasErrors reports whether there is any.
func (v ValidationErrors) HasErrors() bool { return len(v) > 0 }

// ErrChildNotFound: no such child.
var ErrChildNotFound = errors.New("child not found")
