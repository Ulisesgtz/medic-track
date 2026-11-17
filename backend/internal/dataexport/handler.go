package dataexport

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/deletionstate"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// FamilyOwnerResolver finds, for a Clerk user, the owner of the family they are an active member of when that owner asked
// to delete her account (POST /family/children-export, FR-004). ok is false otherwise.
type FamilyOwnerResolver func(ctx context.Context, clerkUserID string) (ownerID uuid.UUID, ok bool, err error)

// NewFamilyOwnerResolver is the FamilyOwnerResolver of production: the owner of the family the Clerk user is an active
// member of as a Tutor or Caregiver (FR-004: not an integrated child), only while that owner's deletion is pending.
func NewFamilyOwnerResolver(pool *pgxpool.Pool) FamilyOwnerResolver {
	return func(ctx context.Context, clerkUserID string) (uuid.UUID, bool, error) {
		var owner uuid.UUID
		err := pool.QueryRow(ctx, `SELECT m.family_account_id FROM family_members m JOIN accounts a ON a.id = m.account_id
			WHERE a.clerk_user_id = $1 AND m.status = 'active' AND m.role IN ('tutor', 'caregiver') AND `+deletionstate.PendingAccountSQL("m.family_account_id"),
			clerkUserID).Scan(&owner)
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, false, nil
		}
		if err != nil {
			return uuid.Nil, false, fmt.Errorf("reading the family: %w", err)
		}
		return owner, true, nil
	}
}

// Handler serves the data export. Everything goes through the Responder: errors before the file as JSON, the file with
// Responder.Stream. Nothing of the file is ever in an address, a message or error_logs.
type Handler struct {
	responder   *httpx.Responder
	pool        *pgxpool.Pool
	familyOwner FamilyOwnerResolver
	now         func() time.Time
}

// NewHandler creates the Handler. familyOwner may be nil until the family export is wired.
func NewHandler(responder *httpx.Responder, pool *pgxpool.Pool, familyOwner FamilyOwnerResolver) *Handler {
	return &Handler{responder: responder, pool: pool, familyOwner: familyOwner, now: time.Now}
}

// SetNow fixes the clock (tests).
func (h *Handler) SetNow(now func() time.Time) { h.now = now }

type errorDoc struct {
	Error   string `json:"error" example:"export_failed"`
	Message string `json:"message" example:"The data could not be read"`
} // @name DataExportError

// ExportOwn handles POST /accounts/{accountId}/data-export (specs/070, contracts/api.md).
//
//	@Summary		Download all my data
//	@Description	A ZIP with everything the account recorded — its children, consultations (of the children and its own), medications
//	@Description	and every dose with its state, appointments, vaccinations and the card's photos, growth measurements, supplements and
//	@Description	activities with their doses, the medicine cabinet — as LEEME.txt, datos.json, one CSV per kind (UTF-8 with BOM) and
//	@Description	the photos. Any plan, also while the account's deletion is pending. Built on every request, never stored. If it breaks
//	@Description	half way the connection is cut, so a short file never looks complete.
//	@Tags			account
//	@Produce		application/zip
//	@Param			accountId	path	string	true	"Account UUID"
//	@Success		200			{file}	file
//	@Failure		404			{object}	errorDoc	"No account exists for this id"
//	@Failure		500			{object}	errorDoc	"The data could not be read"
//	@Security		ClerkSession
//	@Failure		401			{object}	errorDoc	"No valid Clerk session"
//	@Failure		403			{object}	errorDoc	"The account is not the session's"
//	@Router			/accounts/{accountId}/data-export [post]
func (h *Handler) ExportOwn(w http.ResponseWriter, r *http.Request) {
	accountID, err := uuid.Parse(chi.URLParam(r, "accountId"))
	if err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusNotFound, "account_not_found", "No account exists for this id", nil)
		return
	}
	h.send(w, r, Own(accountID), accountID)
}

// ExportFamilyChildren handles POST /family/children-export (specs/070, FR-004).
//
//	@Summary		Download the data of the family's children (while the owner's deletion is pending)
//	@Description	The same ZIP as /accounts/{accountId}/data-export, limited to the children of the family's owner — never her own
//	@Description	consultations, routines or medicine cabinet. Only for an active member of a family whose owner asked to delete her
//	@Description	account; anyone else gets 404.
//	@Tags			account
//	@Produce		application/zip
//	@Success		200	{file}	file
//	@Failure		404	{object}	errorDoc	"Not a member of a family whose owner asked to delete her account"
//	@Failure		500	{object}	errorDoc	"The data could not be read"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorDoc	"No valid Clerk session"
//	@Router			/family/children-export [post]
func (h *Handler) ExportFamilyChildren(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	clerkUserID, ok := authmw.ClerkUserIDFromContext(ctx)
	if !ok || h.familyOwner == nil {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "not_found", "Nothing to download", nil)
		return
	}
	ownerID, ok, err := h.familyOwner(ctx, clerkUserID)
	if err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "export_failed", "The data could not be read", nil)
		return
	}
	if !ok {
		h.responder.WriteJSONError(ctx, w, http.StatusNotFound, "not_found", "Nothing to download", nil)
		return
	}
	h.send(w, r, FamilyChildren(ownerID), ownerID)
}

func (h *Handler) send(w http.ResponseWriter, r *http.Request, scope Scope, accountID uuid.UUID) {
	ctx := r.Context()
	now := h.now()
	export, err := Collect(ctx, h.pool, scope, now)
	if err != nil {
		h.responder.WriteJSONError(ctx, w, http.StatusInternalServerError, "export_failed", "The data could not be read", &accountID)
		return
	}
	filename := "peditrack-datos-" + now.In(mexicoCity).Format("2006-01-02") + ".zip"
	h.responder.Stream(ctx, w, "application/zip", filename, &accountID, func(out io.Writer) error {
		return Write(ctx, out, export, h.photo(scope.AccountID))
	})
}

// photo reads one photo of the scope's account (the account is part of the query: a photo of another account is never read).
func (h *Handler) photo(accountID uuid.UUID) PhotoSource {
	return func(ctx context.Context, p Photo) ([]byte, error) {
		var sql string
		switch p.Kind {
		case "recetas":
			sql = `SELECT photo FROM consultations WHERE id = $1 AND account_id = $2`
		case "cartilla":
			sql = `SELECT photo FROM vaccine_card_photos WHERE id = $1 AND account_id = $2`
		case "botiquin":
			sql = `SELECT photo FROM medicine_cabinet_items WHERE id = $1 AND account_id = $2`
		default:
			return nil, fmt.Errorf("unknown photo kind")
		}
		var b []byte
		err := h.pool.QueryRow(ctx, sql, p.ID, accountID).Scan(&b)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPhotoGone
		}
		return b, err
	}
}
