package account

import (
	"context"
	"errors"
)

// ErrEmailNotVerified is what VerifiedEmail returns when the session's primary address exists but Clerk hasn't verified it.
var ErrEmailNotVerified = errEmailNotVerified

// IsEmailNotVerified reports whether err is the "address not verified" refusal.
func IsEmailNotVerified(err error) bool { return errors.Is(err, errEmailNotVerified) }

// VerifiedEmail is the session's verified primary e-mail, read from Clerk. internal/family compares it with the address an
// invitation was sent to: only the person who proved to control that address can accept.
func VerifiedEmail(ctx context.Context, clerkUserID string) (string, error) {
	return clerkPrimaryEmail(ctx, clerkUserID)
}
