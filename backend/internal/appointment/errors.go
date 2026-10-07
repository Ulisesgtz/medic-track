package appointment

import "errors"

// Domain errors, mapped to HTTP statuses by the Handler (parte2/plan.md).
var (
	// ErrNotFound: no such appointment.
	ErrNotFound = errors.New("appointment not found")
	// ErrConsultationNotFound: no such consultation.
	ErrConsultationNotFound = errors.New("consultation not found")
	// ErrChildNotFound: no such child.
	ErrChildNotFound = errors.New("child not found")
	// ErrExists: the consultation already has a scheduled appointment (cancel it or mark it first).
	ErrExists = errors.New("the consultation already has a scheduled appointment")
	// ErrClosed: a done or canceled appointment can't be edited or have its status changed that way.
	ErrClosed = errors.New("the appointment is closed")
	// ErrNotScheduled: «Tus avisos» only exists while the appointment is scheduled.
	ErrNotScheduled = errors.New("the appointment is not scheduled")
	// ErrPlanRequired: the owner account is not on the paid plan (creating and editing are the paid plan's).
	ErrPlanRequired = errors.New("the plan is not paid")
)

// PlanLimitAppointments is the 422 `reason` of the paid plan's appointments.
const PlanLimitAppointments = "appointments"

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
