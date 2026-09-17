package account

import (
	"context"
	"regexp"
	"strconv"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// namePattern allows letters (including accented characters and ñ), spaces,
// hyphens and apostrophes, for compound and hyphenated names. Digits and
// symbols such as < or @ are rejected.
var namePattern = regexp.MustCompile(`^[\p{L} '-]+$`)

// nameMaxLength is the maximum length for first/last name fields, for both
// the tutor and each child.
const nameMaxLength = 100

// CreateAccountInput is the input to Service.CreateAccount, mirroring the
// POST /accounts request body (contracts/post-accounts.md).
type CreateAccountInput struct {
	FirstName   string
	LastName    string
	Email       string
	CountryCode *string
	StateCode   *string
	Children    []CreateChildInput
}

// CreateChildInput is a single child entry within CreateAccountInput.
type CreateChildInput struct {
	FirstName string
	LastName  string
	BirthDate time.Time
	Height    *float64
	Weight    *float64
}

// Service implements the Account/Child business rules: field validation
// (FR-001, FR-002, FR-004, FR-005), and the freemium child limit (FR-007).
type Service struct {
	repo *Repository
}

// NewService creates an account Service backed by the given repository.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// CreateAccount validates input and persists a new Account (with its
// Children, if any and if allowed by the plan).
func (s *Service) CreateAccount(ctx context.Context, input CreateAccountInput) (*Account, error) {
	// FR-007: a brand-new account is always on the free plan, which allows
	// at most one child. This check runs server-side regardless of what the
	// client already validated (defense in depth, per research.md), and
	// BEFORE field-level validation so a caller bypassing the client's own
	// 1-child cap always gets the freemium-limit response rather than a
	// generic validation error about some unrelated field on the extra child.
	if len(input.Children) > 1 {
		return nil, ErrFreemiumChildLimitExceeded
	}

	if errs := validateCreateAccountInput(input); errs.HasErrors() {
		return nil, errs
	}

	exists, err := s.repo.EmailExists(ctx, input.Email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrEmailAlreadyExists
	}

	acc := &Account{
		FirstName:   input.FirstName,
		LastName:    input.LastName,
		Email:       input.Email,
		CountryCode: input.CountryCode,
		StateCode:   input.StateCode,
		Plan:        PlanFree,
	}
	for _, c := range input.Children {
		acc.Children = append(acc.Children, Child{
			FirstName: c.FirstName,
			LastName:  c.LastName,
			BirthDate: c.BirthDate,
			Height:    c.Height,
			Weight:    c.Weight,
		})
	}

	if err := s.repo.Create(ctx, acc); err != nil {
		return nil, err
	}
	return acc, nil
}

// GetAccount retrieves an account and its children by id, for the home page
// listing (specs/003-home-listado-hijos FR-001).
func (s *Service) GetAccount(ctx context.Context, id uuid.UUID) (*Account, error) {
	return s.repo.GetByID(ctx, id)
}

// AddChild adds a single child to an already-existing account, reusing the
// same field validation (validateChildFields) and freemium 1-child limit as
// CreateAccount (specs/003-home-listado-hijos FR-004).
func (s *Service) AddChild(ctx context.Context, accountID uuid.UUID, input CreateChildInput) (*Account, error) {
	acc, err := s.repo.GetByID(ctx, accountID)
	if err != nil {
		return nil, err
	}

	// Same precedence as CreateAccount's freemium check: run before
	// field-level validation, so exceeding the limit always produces the
	// freemium response rather than an unrelated validation error.
	if len(acc.Children) >= 1 {
		return nil, ErrFreemiumChildLimitExceeded
	}

	if errs := validateChildFields(input); len(errs) > 0 {
		return nil, ValidationErrors(errs)
	}

	child, err := s.repo.CreateChild(ctx, accountID, input)
	if err != nil {
		return nil, err
	}
	acc.Children = append(acc.Children, *child)
	return acc, nil
}

// validateChildFields validates a single child's fields (name format/length,
// birth date, height/weight), with field names unprefixed (e.g. "firstName",
// not "children[0].firstName"). validateCreateAccountInput wraps these with
// an index prefix for its multi-child case; AddChild uses them as-is since it
// only ever validates one child at a time.
func validateChildFields(c CreateChildInput) []ValidationError {
	var errs []ValidationError

	if c.FirstName == "" {
		errs = append(errs, ValidationError{Field: "firstName", Message: "first name is required"})
	} else if err := validateNameFormat(c.FirstName); err != "" {
		errs = append(errs, ValidationError{Field: "firstName", Message: err})
	}
	if c.LastName == "" {
		errs = append(errs, ValidationError{Field: "lastName", Message: "last name is required"})
	} else if err := validateNameFormat(c.LastName); err != "" {
		errs = append(errs, ValidationError{Field: "lastName", Message: err})
	}
	if c.BirthDate.IsZero() {
		errs = append(errs, ValidationError{Field: "birthDate", Message: "birth date is required"})
	} else if c.BirthDate.After(time.Now()) {
		// FR-005: birth date must not be in the future.
		errs = append(errs, ValidationError{Field: "birthDate", Message: "birth date cannot be in the future"})
	}
	if c.Height != nil && *c.Height <= 0 {
		errs = append(errs, ValidationError{Field: "height", Message: "height must be a positive number"})
	}
	if c.Weight != nil && *c.Weight <= 0 {
		errs = append(errs, ValidationError{Field: "weight", Message: "weight must be a positive number"})
	}

	return errs
}

func validateCreateAccountInput(input CreateAccountInput) ValidationErrors {
	var errs ValidationErrors

	if input.FirstName == "" {
		errs = append(errs, ValidationError{Field: "firstName", Message: "first name is required"})
	} else if err := validateNameFormat(input.FirstName); err != "" {
		errs = append(errs, ValidationError{Field: "firstName", Message: err})
	}
	if input.LastName == "" {
		errs = append(errs, ValidationError{Field: "lastName", Message: "last name is required"})
	} else if err := validateNameFormat(input.LastName); err != "" {
		errs = append(errs, ValidationError{Field: "lastName", Message: err})
	}
	if input.Email == "" {
		errs = append(errs, ValidationError{Field: "email", Message: "email is required"})
	} else if !emailPattern.MatchString(input.Email) {
		errs = append(errs, ValidationError{Field: "email", Message: "invalid email format"})
	}

	for i, c := range input.Children {
		for _, e := range validateChildFields(c) {
			errs = append(errs, ValidationError{Field: fieldIndex("children", i, e.Field), Message: e.Message})
		}
	}

	return errs
}

func fieldIndex(prefix string, i int, field string) string {
	return prefix + "[" + strconv.Itoa(i) + "]." + field
}

// validateNameFormat checks length and character-set rules shared by every
// first/last name field. Returns an empty string when the value is valid.
func validateNameFormat(name string) string {
	if utf8.RuneCountInString(name) > nameMaxLength {
		return "must be at most 100 characters"
	}
	if !namePattern.MatchString(name) {
		return "must contain only letters, spaces, hyphens or apostrophes"
	}
	return ""
}
