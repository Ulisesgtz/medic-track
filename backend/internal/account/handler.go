package account

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

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
	Email       string               `json:"email" example:"ana@example.com"`
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

// maxRequestBodyBytes caps the POST /accounts body to guard against
// oversized-payload abuse (backend-security-coder: payload size limits).
const maxRequestBodyBytes = 1 << 20 // 1 MiB

// CreateAccount handles POST /accounts (contracts/post-accounts.md).
//
//	@Summary		Create an account (tutor + optional children)
//	@Description	Creates a padre/tutor account, optionally with one or more children in the
//	@Description	same request. A brand-new account always starts on the free plan, which
//	@Description	allows at most 1 child (FR-007) — enforced server-side regardless of what
//	@Description	the client already validated. No login/password is accepted here (FR-009).
//	@Tags			accounts
//	@Accept			json
//	@Produce		json
//	@Param			payload	body		createAccountRequest	true	"Account (and optional children) to create"
//	@Success		201		{object}	accountResponse
//	@Failure		400		{object}	validationErrorResponseDoc	"Missing/invalid field, e.g. a malformed email or future birth date"
//	@Failure		409		{object}	emailConflictResponseDoc	"Email already in use"
//	@Failure		422		{object}	freemiumLimitResponseDoc	"Free plan already has 1 child; upgrade required"
//	@Failure		500		{object}	errorResponseDoc	"Unexpected server error"
//	@Router			/accounts [post]
func (h *Handler) CreateAccount(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	var req createAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "validation_error", "Malformed JSON body", nil)
		return
	}

	input := CreateAccountInput{
		FirstName:   req.FirstName,
		LastName:    req.LastName,
		Email:       req.Email,
		CountryCode: req.CountryCode,
		StateCode:   req.StateCode,
	}

	for i, c := range req.Children {
		var birthDate time.Time
		if c.BirthDate != "" {
			parsed, err := time.Parse("2006-01-02", c.BirthDate)
			if err != nil {
				h.writeValidationError(r.Context(), w, []ValidationError{{
					Field:   fieldIndex("children", i, "birthDate"),
					Message: "birth date must be an ISO-8601 date (YYYY-MM-DD)",
				}}, "One or more fields are invalid")
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
		h.writeCreateAccountError(r.Context(), w, err, len(input.Children))
		return
	}

	h.responder.WriteJSON(r.Context(), w, http.StatusCreated, toAccountResponse(acc), &acc.ID)
}

func (h *Handler) writeCreateAccountError(ctx context.Context, w http.ResponseWriter, err error, receivedChildren int) {
	var validationErrs ValidationErrors
	switch {
	case errors.As(err, &validationErrs):
		h.writeValidationError(ctx, w, validationErrs, "One or more fields are invalid")
	case errors.Is(err, ErrEmailAlreadyExists):
		// The conflicting account already exists, but its ID isn't looked up
		// by this flow (EmailExists only returns a bool) — logged without an
		// account_id rather than adding a lookup out of scope here.
		h.responder.WriteJSON(ctx, w, http.StatusConflict, map[string]string{
			"error":   "email_already_exists",
			"message": "Email is already in use",
		}, nil)
	case errors.Is(err, ErrFreemiumChildLimitExceeded):
		h.responder.WriteJSON(ctx, w, http.StatusUnprocessableEntity, map[string]any{
			"error":    "freemium_child_limit_exceeded",
			"message":  "The free plan includes only one child per account",
			"limit":    1,
			"received": receivedChildren,
		}, nil)
	case errors.Is(err, ErrInvalidNameFormat):
		// Defense-in-depth: the DB CHECK constraint on name format/length
		// rejected the row even though the service-layer check passed (e.g. a
		// bug or drift between the two). Surface it as a validation error
		// rather than an opaque 500, since it's really an input problem.
		h.writeValidationError(ctx, w, []ValidationError{
			{Field: "firstName", Message: "must contain only letters, spaces, hyphens or apostrophes, and be at most 100 characters"},
		}, "One or more fields are invalid")
	default:
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "internal_error", "Could not create account", nil)
	}
}

func (h *Handler) writeValidationError(ctx context.Context, w http.ResponseWriter, errs []ValidationError, message string) {
	details := make([]map[string]string, 0, len(errs))
	for _, e := range errs {
		details = append(details, map[string]string{"field": e.Field, "message": e.Message})
	}
	h.responder.WriteJSON(ctx, w, http.StatusBadRequest, map[string]any{
		"error":   "validation_error",
		"message": message,
		"details": details,
	}, nil)
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
