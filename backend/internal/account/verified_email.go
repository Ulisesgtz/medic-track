package account

import (
	"context"
	"errors"
)

// IsEmailNotVerified reports whether err (from VerifiedEmail) is the "address not verified" refusal: the session's primary
// address exists but Clerk hasn't verified it.
func IsEmailNotVerified(err error) bool { return errors.Is(err, errEmailNotVerified) }

// VerifiedEmail is the session's verified primary e-mail, read from Clerk. internal/family compares it with the address an
// invitation was sent to: only the person who proved to control that address can accept.
func VerifiedEmail(ctx context.Context, clerkUserID string) (string, error) {
	return clerkPrimaryEmail(ctx, clerkUserID)
}
