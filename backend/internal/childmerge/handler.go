package childmerge

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/Ulisesgtz/medic-track/backend/internal/authmw"
	"github.com/Ulisesgtz/medic-track/backend/internal/childrecord"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
)

// maxRequestBodyBytes caps a request body: at most 10 pairs with their choices.
const maxRequestBodyBytes = 32 * 1024

// Handler serves /family/merge-options and /family/merges (specs/074-unir-hijo-duplicado, contracts/api.md). Every response is
// written through the *httpx.Responder. The names and ids of the children only travel in bodies: never in an address, never in
// error_logs. The errors that are an expected state (not allowed, not found, a record too long…) are not logged.
type Handler struct {
	repo      *Repository
	responder *httpx.Responder
}

// NewHandler creates a Handler.
func NewHandler(repo *Repository, responder *httpx.Responder) *Handler {
	return &Handler{repo: repo, responder: responder}
}

type pairRequest struct {
	OwnChildID    string            `json:"ownChildId" example:"a1b2c3d4-0000-0000-0000-000000000000"`
	FamilyChildID string            `json:"familyChildId" example:"b1b2c3d4-0000-0000-0000-000000000000"`
	Choices       map[string]string `json:"choices"`
} // @name ChildMergePair

type pairsRequest struct {
	Pairs []pairRequest `json:"pairs"`
} // @name ChildMergeRequest

type previewResponse struct {
	Pairs []PairPreview `json:"pairs"`
} // @name ChildMergePreviewResponse

// pairResult is what happened to one pair: merged, or failed with an error code (and, for the ones that name a field or a list,
// which — never a value).
type pairResult struct {
	OwnChildID    string      `json:"ownChildId"`
	FamilyChildID string      `json:"familyChildId"`
	Status        string      `json:"status" enums:"merged,failed"`
	Moves         *MoveCounts `json:"moves,omitempty"`
	Error         string      `json:"error,omitempty" enums:"merge_not_allowed,not_found,record_too_long,birth_date_conflict,choices_missing,internal_error"`
	Field         string      `json:"field,omitempty"`
	List          string      `json:"list,omitempty"`
	Resulting     int         `json:"resulting,omitempty"`
	Limit         int         `json:"limit,omitempty"`
} // @name ChildMergePairResult

type mergeResponse struct {
	Results []pairResult `json:"results"`
} // @name ChildMergeResponse

type errorBody struct {
	Error   string `json:"error" example:"pairs"`
	Message string `json:"message" example:"Between 1 and 10 different pairs are required"`
} // @name ChildMergeErrorResponse

func (h *Handler) actor(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	clerkID, ok := authmw.ClerkUserIDFromContext(r.Context())
	if !ok {
		h.responder.WriteJSONError(r.Context(), w, http.StatusUnauthorized, "unauthorized", "A valid session is required", nil)
		return uuid.Nil, false
	}
	id, err := h.repo.AccountByClerkUser(r.Context(), clerkID)
	if err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not read the account", nil)
		return uuid.Nil, false
	}
	if id == uuid.Nil {
		h.responder.WriteJSONUnlogged(w, http.StatusNotFound, errorBody{Error: "no_family", Message: "The session has no family"})
		return uuid.Nil, false
	}
	return id, true
}

// parsePairs reads and checks the pairs of a request: 1 to MaxPairs, well-formed ids, a child in at most one pair. Anything wrong
// is a 400 answered here and false is returned.
func (h *Handler) parsePairs(w http.ResponseWriter, r *http.Request, actor uuid.UUID) ([]PairInput, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	var req pairsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "invalid_request", "The request body is not valid", &actor)
		return nil, false
	}
	if len(req.Pairs) < 1 || len(req.Pairs) > MaxPairs {
		h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "pairs", "Between 1 and 10 different pairs are required", &actor)
		return nil, false
	}
	seen := map[uuid.UUID]bool{}
	out := make([]PairInput, 0, len(req.Pairs))
	for _, p := range req.Pairs {
		own, err1 := uuid.Parse(p.OwnChildID)
		fam, err2 := uuid.Parse(p.FamilyChildID)
		if err1 != nil || err2 != nil || own == fam || seen[own] || seen[fam] {
			h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "pairs", "Between 1 and 10 different pairs are required", &actor)
			return nil, false
		}
		seen[own], seen[fam] = true, true
		for field, choice := range p.Choices {
			if !validField(field) || (choice != ChoiceOwn && choice != ChoiceFamily) {
				h.responder.WriteJSONError(r.Context(), w, http.StatusBadRequest, "choices", "The choices are not valid", &actor)
				return nil, false
			}
		}
		out = append(out, PairInput{OwnChildID: own, FamilyChildID: fam, Choices: p.Choices})
	}
	return out, true
}

func validField(f string) bool {
	switch f {
	case FieldFirstName, FieldLastName, FieldBirthDate, FieldHeight, FieldWeight, FieldGrowthReferenceSex, FieldBloodType, FieldPediatrician, FieldGeneralNote:
		return true
	}
	return false
}

// GetOptions handles GET /family/merge-options.
//
//	@Summary		What the pairing screen shows
//	@Description	The person's own children (hidden ones too), the family's, whether the person can merge (Full over the family's
//	@Description	children) and the pairs the app suggests by name. The suggestion is never applied by the server.
//	@Tags			family
//	@Produce		json
//	@Success		200	{object}	ChildMergeOptions
//	@Failure		404	{object}	errorBody	"The session is not an active Tutor or Caregiver of a family"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorBody	"No valid Clerk session"
//	@Router			/family/merge-options [get]
func (h *Handler) GetOptions(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	opts, err := h.repo.Options(r.Context(), actor)
	switch {
	case errors.Is(err, ErrNoFamily):
		h.responder.WriteJSONUnlogged(w, http.StatusNotFound, errorBody{Error: "no_family", Message: "The session has no family"})
	case err != nil:
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not read the children", &actor)
	default:
		h.responder.WriteJSON(r.Context(), w, http.StatusOK, opts, &actor)
	}
}

// Preview handles POST /family/merges/preview.
//
//	@Summary		What a union would do
//	@Description	Per pair: the fields that differ, what moves, the limits it would pass and whether the sheet's lists would be too
//	@Description	long. Writes nothing. The ids travel in the body, never in the address.
//	@Tags			family
//	@Accept			json
//	@Produce		json
//	@Param			payload	body		pairsRequest	true	"The pairs to preview"
//	@Success		200		{object}	previewResponse
//	@Failure		400		{object}	errorBody	"pairs: empty, more than 10, repeated or malformed"
//	@Failure		403		{object}	errorBody	"merge_not_allowed: the person cannot do everything with the family's children"
//	@Failure		404		{object}	errorBody	"no_family, or not_found: a child that is not where the request says"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorBody	"No valid Clerk session"
//	@Router			/family/merges/preview [post]
func (h *Handler) Preview(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	pairs, ok := h.parsePairs(w, r, actor)
	if !ok {
		return
	}
	out, err := h.repo.Preview(r.Context(), actor, pairs)
	switch {
	case errors.Is(err, ErrNoFamily):
		h.responder.WriteJSONUnlogged(w, http.StatusNotFound, errorBody{Error: "no_family", Message: "The session has no family"})
	case errors.Is(err, ErrMergeNotAllowed):
		h.responder.WriteJSONUnlogged(w, http.StatusForbidden, errorBody{Error: "merge_not_allowed", Message: "This union is not allowed for the session"})
	case errors.Is(err, ErrNotFound):
		h.responder.WriteJSONUnlogged(w, http.StatusNotFound, errorBody{Error: "not_found", Message: "A child was not found"})
	case err != nil:
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not prepare the preview", &actor)
	default:
		h.responder.WriteJSON(r.Context(), w, http.StatusOK, previewResponse{Pairs: out}, &actor)
	}
}

// Merge handles POST /family/merges.
//
//	@Summary		Join the person's own children with the family's
//	@Description	Each pair in its own transaction, in the order received: all or nothing per pair. Everything that hung from the
//	@Description	person's child (consultations with their doses, marks and authors, symptoms, appointments, supplements and
//	@Description	activities, vaccines, card photos, measurements, the record sheet) moves to the family's child; the person's child
//	@Description	is deleted and the union is recorded with numbers only. It cannot be undone. A pair that fails says why and leaves
//	@Description	nothing changed; the others are not affected. An unexpected failure answers 500 with the results of the pairs
//	@Description	that were done. The ids and the choices travel in the body only.
//	@Tags			family
//	@Accept			json
//	@Produce		json
//	@Param			payload	body		pairsRequest	true	"The pairs and, per pair, what to keep of each field that differs"
//	@Success		200		{object}	mergeResponse
//	@Failure		400		{object}	errorBody	"pairs or choices: malformed"
//	@Failure		404		{object}	errorBody	"no_family"
//	@Failure		500		{object}	mergeResponse	"An unexpected failure; the results say which pairs were done"
//	@Security		ClerkSession
//	@Failure		401	{object}	errorBody	"No valid Clerk session"
//	@Router			/family/merges [post]
func (h *Handler) Merge(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.actor(w, r)
	if !ok {
		return
	}
	pairs, ok := h.parsePairs(w, r, actor)
	if !ok {
		return
	}
	if err := h.repo.RequireFamily(r.Context(), actor); err != nil {
		if errors.Is(err, ErrNoFamily) {
			h.responder.WriteJSONUnlogged(w, http.StatusNotFound, errorBody{Error: "no_family", Message: "The session has no family"})
			return
		}
		h.responder.WriteJSONError(r.Context(), w, http.StatusInternalServerError, "internal_error", "Could not read the family", &actor)
		return
	}
	results := make([]pairResult, 0, len(pairs))
	internal := false
	for _, p := range pairs {
		res := pairResult{OwnChildID: p.OwnChildID.String(), FamilyChildID: p.FamilyChildID.String()}
		moves, err := h.repo.Merge(r.Context(), actor, p)
		if err == nil {
			res.Status, res.Moves = "merged", moves
		} else {
			res.Status = "failed"
			internal = h.describe(&res, err) || internal
		}
		results = append(results, res)
	}
	if internal {
		h.responder.WriteJSON(r.Context(), w, http.StatusInternalServerError, map[string]any{
			"error": "internal_error", "message": "Some unions could not be done", "results": results,
		}, &actor)
		return
	}
	h.responder.WriteJSON(r.Context(), w, http.StatusOK, mergeResponse{Results: results}, &actor)
}

// describe fills the error of a failed pair. It returns true for an unexpected failure.
func (h *Handler) describe(res *pairResult, err error) bool {
	var missing *ChoicesMissingError
	var tooLong *childrecord.RecordTooLongError
	switch {
	case errors.Is(err, ErrMergeNotAllowed), errors.Is(err, ErrNoFamily):
		res.Error = "merge_not_allowed"
	case errors.Is(err, ErrNotFound):
		res.Error = "not_found"
	case errors.Is(err, ErrBirthDateConflict):
		res.Error = "birth_date_conflict"
	case errors.As(err, &missing):
		res.Error, res.Field = "choices_missing", missing.Field
	case errors.As(err, &tooLong):
		res.Error, res.List, res.Resulting, res.Limit = "record_too_long", tooLong.List, tooLong.Resulting, childrecord.MaxEntries
	default:
		res.Error = "internal_error"
		return true
	}
	return false
}
