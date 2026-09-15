package account

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// Handler exposes the account HTTP endpoints.
type Handler struct {
	service *Service
}

// NewHandler creates an account Handler backed by the given service.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

type createChildRequest struct {
	FirstName string   `json:"firstName"`
	LastName  string   `json:"lastName"`
	BirthDate string   `json:"birthDate"`
	Height    *float64 `json:"height"`
	Weight    *float64 `json:"weight"`
}

type createAccountRequest struct {
	FirstName   string               `json:"firstName"`
	LastName    string               `json:"lastName"`
	Email       string               `json:"email"`
	CountryCode *string              `json:"countryCode"`
	StateCode   *string              `json:"stateCode"`
	Children    []createChildRequest `json:"children"`
}

type childResponse struct {
	ID        string   `json:"id"`
	FirstName string   `json:"firstName"`
	LastName  string   `json:"lastName"`
	BirthDate string   `json:"birthDate"`
	Height    *float64 `json:"height"`
	Weight    *float64 `json:"weight"`
}

type accountResponse struct {
	ID          string          `json:"id"`
	FirstName   string          `json:"firstName"`
	LastName    string          `json:"lastName"`
	Email       string          `json:"email"`
	CountryCode *string         `json:"countryCode"`
	StateCode   *string         `json:"stateCode"`
	Plan        string          `json:"plan"`
	Children    []childResponse `json:"children"`
}

// maxRequestBodyBytes caps the POST /accounts body to guard against
// oversized-payload abuse (backend-security-coder: payload size limits).
const maxRequestBodyBytes = 1 << 20 // 1 MiB

// CreateAccount handles POST /accounts (contracts/post-accounts.md).
func (h *Handler) CreateAccount(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)

	var req createAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "validation_error", "Malformed JSON body")
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
				writeValidationError(w, []ValidationError{{
					Field:   fieldIndex("children", i, "birthDate"),
					Message: "birth date must be an ISO-8601 date (YYYY-MM-DD)",
				}})
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
		h.writeCreateAccountError(w, err, len(input.Children))
		return
	}

	writeJSON(w, http.StatusCreated, toAccountResponse(acc))
}

func (h *Handler) writeCreateAccountError(w http.ResponseWriter, err error, receivedChildren int) {
	var validationErrs ValidationErrors
	switch {
	case errors.As(err, &validationErrs):
		writeValidationError(w, validationErrs)
	case errors.Is(err, ErrEmailAlreadyExists):
		writeJSON(w, http.StatusConflict, map[string]string{
			"error":   "email_already_exists",
			"message": "Email is already in use",
		})
	case errors.Is(err, ErrFreemiumChildLimitExceeded):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":    "freemium_child_limit_exceeded",
			"message":  "The free plan includes only one child per account",
			"limit":    1,
			"received": receivedChildren,
		})
	default:
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "Could not create account")
	}
}

func writeValidationError(w http.ResponseWriter, errs []ValidationError) {
	details := make([]map[string]string, 0, len(errs))
	for _, e := range errs {
		details = append(details, map[string]string{"field": e.Field, "message": e.Message})
	}
	writeJSON(w, http.StatusBadRequest, map[string]any{
		"error":   "validation_error",
		"details": details,
	})
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

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"error": code, "message": message})
}
