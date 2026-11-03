package consultation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
)

// Sharing a person's own consultations with the Tutors of their family (specs/058, research R5), and the reminders a Tutor
// asks for one of them (R7). Who can then see them is decided by access.OwnLevelSQL on every request.

// Why turning sharing on can be refused.
const (
	// SharingNoFamily: the person is in no family with anyone else to share with.
	SharingNoFamily = "no_family"
	// SharingPlan: the family is not on the paid plan.
	SharingPlan = "plan"
)

// SharingUnavailableError refuses turning sharing on; Reason is SharingNoFamily or SharingPlan.
type SharingUnavailableError struct{ Reason string }

func (e *SharingUnavailableError) Error() string { return "sharing is not available: " + e.Reason }

// ErrNotShared: «Tus avisos» of a consultation is only for someone who sees another person's own consultation.
var ErrNotShared = errors.New("not a consultation shared with this person")

// Sharing is the state of the switch: whether the person's own consultations are shared and since when (nil = never touched).
type Sharing struct {
	Shared    bool
	ChangedAt *time.Time
}

// familyOfSQL is the family a person ($1) belongs to with somebody else: the one they own (with an active member) or the one
// they are an active member of. At most one row (a person belongs to one family at a time).
const familyOfSQL = `
	SELECT $1::uuid AS fam WHERE EXISTS (SELECT 1 FROM family_members pm WHERE pm.family_account_id = $1 AND pm.status = 'active')
	UNION ALL
	SELECT pm.family_account_id FROM family_members pm WHERE pm.account_id = $1 AND pm.status = 'active'`

// SetSharing turns the switch on or off, in one transaction with the person's account row locked. Turning it on needs a
// family with someone else in it and on the paid plan (*SharingUnavailableError); turning it off always works.
func (r *Repository) SetSharing(ctx context.Context, accountID uuid.UUID, shared bool) (Sharing, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Sharing{}, fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback is a no-op after a successful commit

	var exists bool
	if err := tx.QueryRow(ctx, `SELECT true FROM accounts WHERE id = $1 FOR UPDATE`, accountID).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Sharing{}, ErrAccountNotFound
		}
		return Sharing{}, fmt.Errorf("locking the account: %w", err)
	}
	if shared {
		var plan string
		err := tx.QueryRow(ctx, `SELECT a.plan::text FROM (`+familyOfSQL+`) f JOIN accounts a ON a.id = f.fam LIMIT 1`, accountID).Scan(&plan)
		if errors.Is(err, pgx.ErrNoRows) {
			return Sharing{}, &SharingUnavailableError{Reason: SharingNoFamily}
		}
		if err != nil {
			return Sharing{}, fmt.Errorf("reading the family: %w", err)
		}
		if plan != planPaid {
			return Sharing{}, &SharingUnavailableError{Reason: SharingPlan}
		}
	}
	var at time.Time
	if err := tx.QueryRow(ctx, `
		INSERT INTO own_consultation_sharing (account_id, shared, changed_at) VALUES ($1, $2, now())
		ON CONFLICT (account_id) DO UPDATE SET shared = EXCLUDED.shared, changed_at = now()
		RETURNING changed_at`, accountID, shared).Scan(&at); err != nil {
		return Sharing{}, fmt.Errorf("saving the sharing: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Sharing{}, fmt.Errorf("committing the sharing: %w", err)
	}
	return Sharing{Shared: shared, ChangedAt: &at}, nil
}

// SetOwnReminders turns on or off the reminders of another person's own consultation for `accountID` (a Tutor it is shared
// with). ErrNotShared for a child's consultation or for its own person (they are always reminded).
func (r *Repository) SetOwnReminders(ctx context.Context, consultationID, accountID uuid.UUID, on bool) error {
	var owner uuid.UUID
	var own bool
	err := r.pool.QueryRow(ctx, `SELECT account_id, child_id IS NULL FROM consultations WHERE id = $1`, consultationID).Scan(&owner, &own)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrConsultationNotFound
	}
	if err != nil {
		return fmt.Errorf("reading the consultation: %w", err)
	}
	if !own || owner == accountID {
		return ErrNotShared
	}
	if on {
		_, err = r.pool.Exec(ctx, `
			INSERT INTO own_consultation_reminder_optins (consultation_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			consultationID, accountID)
	} else {
		_, err = r.pool.Exec(ctx, `DELETE FROM own_consultation_reminder_optins WHERE consultation_id = $1 AND account_id = $2`, consultationID, accountID)
	}
	if err != nil {
		return fmt.Errorf("saving the reminders: %w", err)
	}
	return nil
}

// OwnReminders says whether `accountID` asked for the reminders of the consultation (false for anyone else's, or a child's).
func (r *Repository) OwnReminders(ctx context.Context, consultationID, accountID uuid.UUID) (bool, error) {
	var on bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM own_consultation_reminder_optins WHERE consultation_id = $1 AND account_id = $2)`,
		consultationID, accountID).Scan(&on)
	if err != nil {
		return false, fmt.Errorf("reading the reminders: %w", err)
	}
	return on, nil
}

// SetSharing turns the person's sharing on or off.
func (s *Service) SetSharing(ctx context.Context, accountID uuid.UUID, shared bool) (Sharing, error) {
	return s.repo.SetSharing(ctx, accountID, shared)
}

// OwnReminders is Repository.OwnReminders.
func (s *Service) OwnReminders(ctx context.Context, consultationID, accountID uuid.UUID) (bool, error) {
	return s.repo.OwnReminders(ctx, consultationID, accountID)
}

// SetOwnReminders is Repository.SetOwnReminders.
func (s *Service) SetOwnReminders(ctx context.Context, consultationID, accountID uuid.UUID, on bool) error {
	return s.repo.SetOwnReminders(ctx, consultationID, accountID, on)
}

type sharingRequest struct {
	Shared *bool `json:"shared" example:"true"`
} // @name ConsultationSharingRequest

type sharingResponse struct {
	Shared    bool    `json:"shared" example:"true"`
	ChangedAt *string `json:"changedAt" example:"2026-11-02T15:20:00Z"`
} // @name ConsultationSharingResponse

type sharingUnavailableDoc struct {
	Error   string `json:"error" example:"sharing_unavailable"`
	Message string `json:"message" example:"There is nobody in your family to share with"`
	// Reason is "no_family" (nobody to share with) or "plan" (the family is not on the paid plan).
	Reason string `json:"reason" example:"no_family"`
} // @name SharingUnavailableResponse

// SetSharing handles PUT /accounts/{accountId}/consultation-sharing (specs/058).
//
//	@Summary		Share one's own consultations with the Tutors of one's family, or stop
//	@Description	Only the person themself. On: the owner and the active Tutors of their family see and mark their own
//	@Description	consultations (never a Caregiver, a Child-role member or a child's phone); it needs a family with somebody else and
//	@Description	on the paid plan (422 sharing_unavailable, reason no_family or plan). Off: always, and at once.
//	@Tags			consultations
//	@Accept			json
//	@Produce		json
//	@Param			accountId	path		string			true	"Account UUID of the person"
//	@Param			payload		body		sharingRequest	true	"On or off"
//	@Success		200			{object}	sharingResponse
//	@Failure		400			{object}	validationErrorResponseDoc	"shared is missing"
//	@Failure		404			{object}	accountNotFoundResponseDoc	"No account exists for this id"
//	@Failure		422			{object}	sharingUnavailableDoc		"Nobody to share with, or the family is not on the paid plan"
//	@Security		ClerkSession
//	@Failure		401			{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403			{object}	sessionErrorResponseDoc	"The session is not this person"
//	@Router			/accounts/{accountId}/consultation-sharing [put]
func (h *Handler) SetSharing(w http.ResponseWriter, r *http.Request) {
	accountID, ok := h.accountParam(w, r)
	if !ok {
		return
	}
	var req sharingRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&req); err != nil || req.Shared == nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(ValidationErrors{{Field: "shared", Message: "is required"}}, "One or more fields are invalid"), nil)
		return
	}
	got, err := h.service.SetSharing(r.Context(), accountID, *req.Shared)
	var unavailable *SharingUnavailableError
	switch {
	case errors.As(err, &unavailable):
		message := "There is nobody in your family to share with"
		if unavailable.Reason == SharingPlan {
			message = "Sharing your consultations needs the family's paid plan"
		}
		h.responder.WriteJSON(r.Context(), w, http.StatusUnprocessableEntity, map[string]string{"error": "sharing_unavailable", "message": message, "reason": unavailable.Reason}, nil)
	case errors.Is(err, ErrAccountNotFound):
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, accountNotFoundBody(), nil)
	case err != nil:
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not save the sharing", nil)
	default:
		at := got.ChangedAt.UTC().Format(time.RFC3339)
		h.responder.WriteJSON(r.Context(), w, http.StatusOK, sharingResponse{Shared: got.Shared, ChangedAt: &at}, nil)
	}
}

type ownRemindersRequest struct {
	On *bool `json:"on" example:"true"`
} // @name OwnRemindersRequest

type ownRemindersResponse struct {
	On bool `json:"on" example:"true"`
} // @name OwnRemindersResponse

// SetOwnReminders handles PUT /consultations/{consultationId}/my-reminders (specs/058).
//
//	@Summary		A Tutor's reminders of a person's own consultation shared with them
//	@Description	Off until the Tutor turns them on; they only come while the consultation is still shared with them. 400 not_shared
//	@Description	for a child's consultation or for the person themself (they are always reminded of their own).
//	@Tags			consultations
//	@Accept			json
//	@Produce		json
//	@Param			consultationId	path		string				true	"Consultation UUID"
//	@Param			payload			body		ownRemindersRequest	true	"On or off"
//	@Success		200				{object}	ownRemindersResponse
//	@Failure		400				{object}	validationErrorResponseDoc	"on is missing, or not_shared"
//	@Failure		404				{object}	consultationNotFoundResponseDoc	"No consultation exists for this id"
//	@Security		ClerkSession
//	@Failure		401				{object}	sessionErrorResponseDoc	"No valid Clerk session"
//	@Failure		403				{object}	sessionErrorResponseDoc	"The session cannot see this consultation"
//	@Router			/consultations/{consultationId}/my-reminders [put]
func (h *Handler) SetOwnReminders(w http.ResponseWriter, r *http.Request) {
	consultationID, err := uuid.Parse(chi.URLParam(r, "consultationId"))
	if err != nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, consultationNotFoundBody(), nil)
		return
	}
	var req ownRemindersRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&req); err != nil || req.On == nil {
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(ValidationErrors{{Field: "on", Message: "is required"}}, "One or more fields are invalid"), nil)
		return
	}
	who, ok := access.FromContext(r.Context())
	if !ok || who.ActorAccountID == uuid.Nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not save the reminders", nil)
		return
	}
	err = h.service.SetOwnReminders(r.Context(), consultationID, who.ActorAccountID, *req.On)
	switch {
	case errors.Is(err, ErrNotShared):
		h.responder.WriteJSON(r.Context(), w, http.StatusBadRequest, validationErrorBody(ValidationErrors{{Field: "consultationId", Message: "not_shared"}}, "One or more fields are invalid"), nil)
	case errors.Is(err, ErrConsultationNotFound):
		h.responder.WriteJSON(r.Context(), w, http.StatusNotFound, consultationNotFoundBody(), nil)
	case err != nil:
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not save the reminders", nil)
	default:
		h.responder.WriteJSON(r.Context(), w, http.StatusOK, ownRemindersResponse{On: *req.On}, nil)
	}
}
