package accountdeletion

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	clerk "github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/user"
)

// ClerkAPI deletes and looks up users in Clerk's Backend API (the key set with clerk.SetKey in cmd/api).
type ClerkAPI struct{}

func notFound(err error) bool {
	var apiErr *clerk.APIErrorResponse
	return errors.As(err, &apiErr) && apiErr.HTTPStatusCode == http.StatusNotFound
}

// Delete deletes a user; one that no longer exists counts as done. The error never carries Clerk's text.
func (ClerkAPI) Delete(ctx context.Context, clerkUserID string) error {
	if _, err := user.Delete(ctx, clerkUserID); err != nil && !notFound(err) {
		return fmt.Errorf("the sign-in provider refused or did not answer")
	}
	return nil
}

// Exists says whether a user still exists (reconcile-deleted).
func (ClerkAPI) Exists(ctx context.Context, clerkUserID string) (bool, error) {
	_, err := user.Get(ctx, clerkUserID)
	switch {
	case err == nil:
		return true, nil
	case notFound(err):
		return false, nil
	default:
		return false, fmt.Errorf("the sign-in provider refused or did not answer")
	}
}
