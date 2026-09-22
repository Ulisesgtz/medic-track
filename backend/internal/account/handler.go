package account

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	clerkuser "github.com/clerk/clerk-sdk-go/v2/user"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// Handler exposes the account HTTP endpoints.
type Handler struct {
	service   *Service
	responder *httpx.Responder
}

// NewHandler creates an account Handler backed by the given service.
func NewHandler(service *Service, responder *httpx.Responder) *Handler {
	return &Handler{service: service, responder: responder}
}

type createChildRequest struct {
	FirstName string   `json:"firstName" example:"Luis"`
	LastName  string   `json:"lastName" example:"Gómez"`
	BirthDate string   `json:"birthDate" example:"2020-01-15"`
	Height    *float64 `json:"height" example:"95.5"`
	Weight    *float64 `json:"weight" example:"14.2"`
}

type createAccountRequest struct {
	FirstName   string               `json:"firstName" example:"Ana"`
	LastName    string               `json:"lastName" example:"Gómez"`
	CountryCode *string              `json:"countryCode" example:"MX"`
	StateCode   *string              `json:"stateCode" example:"MX-JAL"`
	Children    []createChildRequest `json:"children"`
}

type childResponse struct {
	ID        string   `json:"id" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	FirstName string   `json:"firstName" example:"Luis"`
	LastName  string   `json:"lastName" example:"Gómez"`
	BirthDate string   `json:"birthDate" example:"2020-01-15"`
	Height    *float64 `json:"height" example:"95.5"`
	Weight    *float64 `json:"weight" example:"14.2"`
}

type accountResponse struct {
	ID          string          `json:"id" example:"e5f6a7b8-0000-0000-0000-000000000000"`
	FirstName   string          `json:"firstName" example:"Ana"`
	LastName    string          `json:"lastName" example:"Gómez"`
	Email       string          `json:"email" example:"ana@example.com"`
	CountryCode *string         `json:"countryCode" example:"MX"`
	StateCode   *string         `json:"stateCode" example:"MX-JAL"`
	Plan        string          `json:"plan" example:"free"`
	Children    []childResponse `json:"children"`
}

// fieldErrorDoc documents one entry of validationErrorResponse.Details.
type fieldErrorDoc struct {
	Field   string `json:"field" example:"email"`
	Message string `json:"message" example:"invalid email format"`
} // @name FieldError

// validationErrorResponseDoc documents the 400 body shape (contracts/post-accounts.md).
type validationErrorResponseDoc struct {
	Error   string          `json:"error" example:"validation_error"`
	Message string          `json:"message" example:"One or more fields are invalid"`
	Details []fieldErrorDoc `json:"details"`
} // @name ValidationErrorResponse

// emailConflictResponseDoc documents the 409 body shape.
type emailConflictResponseDoc struct {
	Error   string `json:"error" example:"email_already_exists"`
	Message string `json:"message" example:"Email is already in use"`
} // @name EmailConflictResponse

// errorResponseDoc documents the generic {error, message} shape used by
// internal/httpx.WriteJSONError (e.g. the 500 internal_error case).
type errorResponseDoc struct {
	Error   string `json:"error" example:"internal_error"`
	Message string `json:"message" example:"Could not create account"`
} // @name ErrorResponse

// freemiumLimitResponseDoc documents the 422 body shape (FR-007).
type freemiumLimitResponseDoc struct {
	Error    string `json:"error" example:"freemium_child_limit_exceeded"`
	Message  string `json:"message" example:"The free plan includes only one child per account"`
	Limit    int    `json:"limit" example:"1"`
	Received int    `json:"received" example:"2"`
} // @name FreemiumLimitResponse

// accountNotFoundResponseDoc documents the 404 body shape
// (specs/003-home-listado-hijos/contracts/get-account.md).
type accountNotFoundResponseDoc struct {
	Error   string `json:"error" example:"account_not_found"`
	Message string `json:"message" example:"Account not found"`
} // @name AccountNotFoundResponse

// maxRequestBodyBytes caps the POST /accounts body to guard against
// oversized-payload abuse (backend-security-coder: payload size limits).
const maxRequestBodyBytes = 1 << 20 // 1 MiB

// CreateAccount handles POST /accounts (contracts/post-accounts.md).
//
//	@Summary		Create an account (tutor + optional children)
//	@Description	Creates a padre/tutor account, optionally with one or more children in the
//	@Description	same request, for the tutor who already completed sign-up with Clerk (correo+
//	@Description	contraseña or Google) — the caller's verified Clerk session is required, and its
//	@Description	email is what gets stored, never a client-supplied one (specs/008-autenticacion-cuenta).
//	@Description	A brand-new account always starts on the free plan, which allows at most 1 child
//	@Description	(FR-007) — enforced server-side regardless of what the client already validated.
//	@Description	Idempotent: if the session already has an account linked, returns it with 200
//	@Description	instead of creating a duplicate.
//	@Tags			accounts
//	@Accept			json
//	@Produce		json
//	@Security		ClerkSession
//	@Param			payload	body		createAccountRequest	true	"Account (and optional children) to create"
//	@Success		200		{object}	accountResponse	"The session already had an account linked"
//	@Success		201		{object}	accountResponse
//	@Failure		400		{object}	validationErrorResponseDoc	"Missing/invalid field, e.g. a future birth date"
//	@Failure		401		{object}	errorResponseDoc	"No valid Clerk session"
//	@Failure		409		{object}	emailConflictResponseDoc	"Email already in use"
//	@Failure		422		{object}	freemiumLimitResponseDoc	"Free plan already has 1 child; upgrade required"
//	@Failure		500		{object}	errorResponseDoc	"Unexpected server error"
//	@Router			/accounts [post]
func (h *Handler) CreateAccount(w http.ResponseWriter, r *http.Request) {
	clerkUserID, ok := authmw.ClerkUserIDFromContext(r.Context())
	if !ok {
		h.responder.WriteJSONError(r.Context(), w, http.StatusUnauthorized, "unauthorized", "A valid session is required", nil)
		return
	}

	email, err := clerkPrimaryEmail(r.Context(), clerkUserID)
	if err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not resolve the session's email", nil)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	var req createAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}

	input := CreateAccountInput{
		FirstName:   req.FirstName,
		LastName:    req.LastName,
		Email:       email,
		ClerkUserID: clerkUserID,
		CountryCode: req.CountryCode,
		StateCode:   req.StateCode,
	}

	for i, c := range req.Children {
		var birthDate time.Time
		if c.BirthDate != "" {
			parsed, err := time.Parse("2006-01-02", c.BirthDate)
			if err != nil {
				// Called directly (not via a shared helper) so
				// Responder.record's runtime.Caller attributes this entry to
				// this exact line, distinct from the other validation-error
				// call sites below — see backend/CLAUDE.md's warning about
				// indirection between a handler and Responder.
				h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody([]ValidationError{{
					Field:   fieldIndex("children", i, "birthDate"),
					Message: "birth date must be an ISO-8601 date (YYYY-MM-DD)",
				}}, "One or more fields are invalid"), nil)
				return
			}
			birthDate = parsed
		}
		input.Children = append(input.Children, CreateChildInput{
			FirstName: c.FirstName,
			LastName:  c.LastName,
			BirthDate: birthDate,
			Height:    c.Height,
			Weight:    c.Weight,
		})
	}

	acc, err := h.service.CreateAccount(r.Context(), input)
	if err != nil {
		if errors.Is(err, ErrAccountAlreadyLinked) {
			// A retried request for a session that already created its account
			// (e.g. a 201 that never reached the client) — idempotent success,
			// not an error (contracts/post-accounts.md).
			h.responder.WriteJSON(r.Context(), w, http.StatusOK, toAccountResponse(acc), &acc.ID)
			return
		}
		h.writeCreateAccountError(r.Context(), w, err, len(input.Children))
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusCreated, toAccountResponse(acc), &acc.ID)
}

// clerkPrimaryEmail resolves the verified primary email for a Clerk user id
// via the Backend API — the session token's own claims don't expose a
// typed email field in this SDK version, and this is otherwise the
// documented way to read a user's verified profile (research.md, punto 2).
func clerkPrimaryEmail(ctx context.Context, clerkUserID string) (string, error) {
	clerkUser, err := clerkuser.Get(ctx, clerkUserID)
	if err != nil {
		return "", fmt.Errorf("fetching clerk user: %w", err)
	}
	if clerkUser.PrimaryEmailAddressID != nil {
		for _, e := range clerkUser.EmailAddresses {
			if e.ID == *clerkUser.PrimaryEmailAddressID {
				return e.EmailAddress, nil
			}
		}
	}
	return "", fmt.Errorf("clerk user %s has no primary email address", clerkUserID)
}

// writeCreateAccountError dispatches on the error kind and, for each kind,
// calls h.responder directly from its own case branch (never through a
// shared sub-helper) so Responder.record's runtime.Caller attributes every
// error to the distinct line that actually decided it, not to one shared
// call site — see backend/CLAUDE.md's warning about indirection between a
// handler and Responder.
func (h *Handler) writeCreateAccountError(ctx context.Context, w http.ResponseWriter, err error, receivedChildren int) {
	var validationErrs ValidationErrors
	switch {
	case errors.As(err, &validationErrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationErrorBody(validationErrs, "One or more fields are invalid"), nil)
	case errors.Is(err, ErrEmailAlreadyExists):
		// The conflicting account already exists, but its ID isn't looked up
		// by this flow (EmailExists only returns a bool) — logged without an
		// account_id rather than adding a lookup out of scope here.
		h.responder.WriteJSON(ctx, w, http.StatusConflict, map[string]string{
			"error":   "email_already_exists",
			"message": "Email is already in use",
		}, nil)
	case errors.Is(err, ErrFreemiumChildLimitExceeded):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, freemiumLimitBody(freePlanChildLimit, receivedChildren), nil)
	case errors.Is(err, ErrInvalidNameFormat):
		// Defense-in-depth: the DB CHECK constraint on name format/length
		// rejected the row even though the service-layer check passed (e.g. a
		// bug or drift between the two). Surface it as a validation error
		// rather than an opaque 500, since it's really an input problem.
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationErrorBody([]ValidationError{
			{Field: "firstName", Message: "must contain only letters, spaces, hyphens or apostrophes, and be at most 100 characters"},
		}, "One or more fields are invalid"), nil)
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not create account", nil)
	}
}

// accountNotFoundForSessionResponseDoc documents the 404 body shape of
// GET /accounts/me (contracts/get-accounts-me.md).
type accountNotFoundForSessionResponseDoc struct {
	Error   string `json:"error" example:"account_not_found_for_session"`
	Message string `json:"message" example:"No PediTrack account is linked to this session yet"`
} // @name AccountNotFoundForSessionResponse

// GetMe handles GET /accounts/me (contracts/get-accounts-me.md).
//
//	@Summary		Get the authenticated tutor's own account
//	@Description	Resolves the account linked to the caller's verified Clerk session — the
//	@Description	replacement for a client-supplied accountId (specs/008-autenticacion-cuenta). A 404
//	@Description	is the expected state right after a brand-new Clerk sign-up, before POST /accounts
//	@Description	has run.
//	@Tags			accounts
//	@Produce		json
//	@Security		ClerkSession
//	@Success		200	{object}	accountResponse
//	@Failure		404	{object}	accountNotFoundForSessionResponseDoc	"No account is linked to this session yet"
//	@Router			/accounts/me [get]
func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	clerkUserID, ok := authmw.ClerkUserIDFromContext(r.Context())
	if !ok {
		// RequireSession already rejects a request with no valid session
		// before it reaches here — this only guards against this handler
		// ever being wired without that middleware.
		h.responder.WriteJSONError(r.Context(), w, http.StatusUnauthorized, "unauthorized", "A valid session is required", nil)
		return
	}

	acc, err := h.service.GetAccountByClerkUserID(r.Context(), clerkUserID)
	if err != nil {
		if errors.Is(err, ErrAccountNotFound) {
			h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, map[string]string{
				"error":   "account_not_found_for_session",
				"message": "No PediTrack account is linked to this session yet",
			}, nil)
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not fetch account", nil)
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toAccountResponse(acc), &acc.ID)
}

// GetAccount handles GET /accounts/{accountId}
// (specs/003-home-listado-hijos/contracts/get-account.md).
//
//	@Summary		Get an account and its children
//	@Description	Retrieves an account (tutor + children) by id, to populate the home page's
//	@Description	children listing (FR-001). No authentication — the account id acts as a
//	@Description	de facto access token, a deliberate continuation of the posture already
//	@Description	accepted in specs/001/002 (see plan.md's privacy note).
//	@Tags			accounts
//	@Produce		json
//	@Param			accountId	path		string	true	"Account UUID"
//	@Success		200			{object}	accountResponse
//	@Failure		404			{object}	accountNotFoundResponseDoc	"No account exists for this id"
//	@Router			/accounts/{accountId} [get]
func (h *Handler) GetAccount(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "accountId"))
	if err != nil {
		// An id that isn't even a well-formed UUID is treated the same as
		// "no account" (FR-002's edge case: a stale/corrupt saved id).
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, accountNotFoundBody(), nil)
		return
	}

	acc, err := h.service.GetAccount(r.Context(), id)
	if err != nil {
		if errors.Is(err, ErrAccountNotFound) {
			h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, accountNotFoundBody(), nil)
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not fetch account", nil)
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusOK, toAccountResponse(acc), &acc.ID)
}

// AddChild handles POST /accounts/{accountId}/children
// (specs/003-home-listado-hijos/contracts/post-account-children.md).
//
//	@Summary		Add a child to an existing account
//	@Description	Adds a single child to an account already created, from the home page's
//	@Description	"Agregar hijo" modal (FR-004). Applies the same field validation and
//	@Description	freemium 1-child limit as POST /accounts.
//	@Tags			accounts
//	@Accept			json
//	@Produce		json
//	@Param			accountId	path		string				true	"Account UUID"
//	@Param			payload		body		createChildRequest	true	"Child to add"
//	@Success		201			{object}	accountResponse
//	@Failure		400			{object}	validationErrorResponseDoc	"Missing/invalid field"
//	@Failure		404			{object}	accountNotFoundResponseDoc	"No account exists for this id"
//	@Failure		422			{object}	freemiumLimitResponseDoc	"Free plan already has 1 child; upgrade required"
//	@Router			/accounts/{accountId}/children [post]
func (h *Handler) AddChild(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	id, err := uuid.Parse(chi.URLParam(r, "accountId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, accountNotFoundBody(), nil)
		return
	}

	var req createChildRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", &id)
		return
	}

	var birthDate time.Time
	if req.BirthDate != "" {
		parsed, err := time.Parse("2006-01-02", req.BirthDate)
		if err != nil {
			h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody([]ValidationError{{
				Field:   "birthDate",
				Message: "birth date must be an ISO-8601 date (YYYY-MM-DD)",
			}}, "One or more fields are invalid"), &id)
			return
		}
		birthDate = parsed
	}

	input := CreateChildInput{
		FirstName: req.FirstName,
		LastName:  req.LastName,
		BirthDate: birthDate,
		Height:    req.Height,
		Weight:    req.Weight,
	}

	acc, err := h.service.AddChild(r.Context(), id, input)
	if err != nil {
		h.writeAddChildError(r.Context(), w, err, id)
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusCreated, toAccountResponse(acc), &acc.ID)
}

// writeAddChildError mirrors writeCreateAccountError's pattern of calling
// h.responder directly from each case branch, for distinct error_logs
// attribution per backend/CLAUDE.md.
func (h *Handler) writeAddChildError(ctx context.Context, w http.ResponseWriter, err error, accountID uuid.UUID) {
	var validationErrs ValidationErrors
	var limitErr *FreemiumLimitError
	switch {
	case errors.As(err, &validationErrs):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationErrorBody(validationErrs, "One or more fields are invalid"), &accountID)
	case errors.Is(err, ErrAccountNotFound):
		h.responder.WriteJSON(ctx, w, http.StatusNotFound, accountNotFoundBody(), nil)
	case errors.As(err, &limitErr):
		// Limit/Received come from the repository's actual row count at the
		// time of the atomic check (AddChildIfUnderLimit), not a hardcoded
		// guess — stays correct even if the freemium limit ever changes.
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, freemiumLimitBody(limitErr.Limit, limitErr.Received), &accountID)
	case errors.Is(err, ErrInvalidNameFormat):
		h.responder.WriteJSON(ctx, w, http.StatusBadRequest, validationErrorBody([]ValidationError{
			{Field: "firstName", Message: "must contain only letters, spaces, hyphens or apostrophes, and be at most 100 characters"},
		}, "One or more fields are invalid"), &accountID)
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not add child", &accountID)
	}
}

func accountNotFoundBody() map[string]string {
	return map[string]string{"error": "account_not_found", "message": "Account not found"}
}

// freemiumLimitBody builds the 422 response body shape (FR-007). Pure data
// shaping only, same rationale as validationErrorBody — shared by both
// writeCreateAccountError and writeAddChildError so the two 422 bodies can't
// drift from each other.
func freemiumLimitBody(limit, received int) map[string]any {
	return map[string]any{
		"error":    "freemium_child_limit_exceeded",
		"message":  "The free plan includes only one child per account",
		"limit":    limit,
		"received": received,
	}
}

// validationErrorBody builds the 400 response body shape. Pure data
// shaping only — deliberately does NOT call the responder itself, so every
// call site above invokes h.responder.WriteJSON directly and gets its own
// distinct, correctly-attributed error_logs entry (see writeCreateAccountError).
func validationErrorBody(errs []ValidationError, message string) map[string]any {
	details := make([]map[string]string, 0, len(errs))
	for _, e := range errs {
		details = append(details, map[string]string{"field": e.Field, "message": e.Message})
	}
	return map[string]any{
		"error":   "validation_error",
		"message": message,
		"details": details,
	}
}

func toAccountResponse(acc *Account) accountResponse {
	children := make([]childResponse, 0, len(acc.Children))
	for _, c := range acc.Children {
		children = append(children, childResponse{
			ID:        c.ID.String(),
			FirstName: c.FirstName,
			LastName:  c.LastName,
			BirthDate: c.BirthDate.Format("2006-01-02"),
			Height:    c.Height,
			Weight:    c.Weight,
		})
	}
	return accountResponse{
		ID:          acc.ID.String(),
		FirstName:   acc.FirstName,
		LastName:    acc.LastName,
		Email:       acc.Email,
		CountryCode: acc.CountryCode,
		StateCode:   acc.StateCode,
		Plan:        string(acc.Plan),
		Children:    children,
	}
}
