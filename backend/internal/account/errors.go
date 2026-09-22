package account

import "errors"

// Domain errors returned by AccountService, mapped to HTTP status codes by Handler.
var (
	// ErrEmailAlreadyExists is returned when the requested email is already
	// in use by another account (FR-002).
	ErrEmailAlreadyExists = errors.New("email is already in use")

	// ErrFreemiumChildLimitExceeded is returned when a free-plan account
	// attempts to persist more than one child (FR-007).
	ErrFreemiumChildLimitExceeded = errors.New("the free plan includes only one child per account")

	// ErrInvalidNameFormat is returned when the database's name format/length
	// CHECK constraint rejects a row that passed service-layer validation —
	// defense in depth against drift between the two (FR-001a).
	ErrInvalidNameFormat = errors.New("name contains invalid characters or exceeds the maximum length")

	// ErrAccountNotFound is returned when no account exists for a given id —
	// e.g. an accountId saved in the browser that no longer corresponds to
	// any account server-side (specs/003-home-listado-hijos FR-002).
	ErrAccountNotFound = errors.New("account not found")

	// ErrAccountAccessDenied is returned when the authenticated session is
	// valid but does not own the account (or the account's child/consultation)
	// a request is trying to read or modify (specs/008-autenticacion-cuenta FR-005/FR-006).
	ErrAccountAccessDenied = errors.New("account does not belong to the current session")

	// ErrNoAccountForSession is returned by GetAccountByClerkUserID when the
	// session's Clerk user has no linked Account and no unlinked Account
	// matches its verified email either — the expected state right after a
	// brand-new Clerk sign-up, before POST /accounts has run
	// (specs/008-autenticacion-cuenta, contracts/get-accounts-me.md).
	ErrNoAccountForSession = errors.New("no account is linked to this session")

	// ErrAccountAlreadyLinked is returned by CreateAccount when the session
	// already has an Account linked (e.g. a retried POST /accounts after a
	// 201 that never reached the client) — the handler treats this as
	// success, not failure (contracts/post-accounts.md, idempotencia).
	ErrAccountAlreadyLinked = errors.New("session is already linked to an account")
)

// FreemiumLimitError wraps ErrFreemiumChildLimitExceeded with the actual
// limit/received counts, so a caller that needs those numbers (e.g.
// handler.go's 422 response body) doesn't have to hardcode or re-derive
// them. errors.Is(err, ErrFreemiumChildLimitExceeded) still matches via
// Unwrap.
type FreemiumLimitError struct {
	Limit    int
	Received int
}

func (e *FreemiumLimitError) Error() string { return ErrFreemiumChildLimitExceeded.Error() }
func (e *FreemiumLimitError) Unwrap() error { return ErrFreemiumChildLimitExceeded }

// ValidationError describes a single field-level validation failure.
type ValidationError struct {
	Field   string
	Message string
}

// ValidationErrors is a collection of field-level validation failures,
// returned together so the client can show all of them at once (FR-001, FR-004, FR-005).
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
