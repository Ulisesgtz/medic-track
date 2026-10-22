package vaccination_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/access"
	"github.com/Ulisesgtz/medic-track/backend/internal/httpx"
	"github.com/Ulisesgtz/medic-track/backend/internal/vaccination"
)

func TestHandler_SavesListsOpensAndDeletesAPhoto(t *testing.T) {
	e := newEnv(t)
	base := "/children/" + e.f.childID.String() + "/vaccine-card-photos"

	created := e.do(t, http.MethodPost, base, map[string]any{"photoBase64": b64(jpegHead)})
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	meta := decode(t, created)
	require.Equal(t, "Ana", meta["createdByName"])
	require.NotContains(t, created.Body.String(), "photoBase64", "the upload's answer has no image")
	id := meta["id"].(string)

	list := e.do(t, http.MethodGet, base, nil)
	require.Equal(t, http.StatusOK, list.Code)
	body := decode(t, list)
	require.Len(t, body["photos"], 1)
	require.EqualValues(t, 10, body["limit"])
	require.NotContains(t, list.Body.String(), "photoBase64", "the list never carries images")
	require.NotContains(t, list.Body.String(), "@")

	one := e.do(t, http.MethodGet, base+"/"+id, nil)
	require.Equal(t, http.StatusOK, one.Code)
	require.Equal(t, b64(jpegHead), decode(t, one)["photoBase64"])

	require.Equal(t, http.StatusNoContent, e.do(t, http.MethodDelete, base+"/"+id, nil).Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodGet, base+"/"+id, nil).Code)
}

func TestHandler_AnEmptyCardHasNoPhotosNotNull(t *testing.T) {
	e := newEnv(t)

	rec := e.do(t, http.MethodGet, "/children/"+e.f.childID.String()+"/vaccine-card-photos", nil)

	require.JSONEq(t, `{"photos":[],"limit":10}`, rec.Body.String())
}

func TestHandler_ARefusedPhotoIsA400WithAFixedMessage(t *testing.T) {
	e := newEnv(t)
	base := "/children/" + e.f.childID.String() + "/vaccine-card-photos"

	notImage := e.do(t, http.MethodPost, base, map[string]any{"photoBase64": b64([]byte("una nota secreta de salud"))})
	empty := e.do(t, http.MethodPost, base, map[string]any{})
	malformed := e.do(t, http.MethodPost, base, "{not json")

	require.Equal(t, http.StatusBadRequest, notImage.Code)
	require.Equal(t, "validation_error", decode(t, notImage)["error"])
	require.NotContains(t, notImage.Body.String(), "secreta")
	require.Equal(t, http.StatusBadRequest, empty.Code)
	require.Equal(t, http.StatusBadRequest, malformed.Code)
}

func TestHandler_TheEleventhPhotoIs422WithItsReasonAndLimit(t *testing.T) {
	e := newEnv(t)
	base := "/children/" + e.f.childID.String() + "/vaccine-card-photos"
	for i := 0; i < vaccination.MaxPhotosPerChild; i++ {
		require.Equal(t, http.StatusCreated, e.do(t, http.MethodPost, base, map[string]any{"photoBase64": b64(jpegHead)}).Code)
	}

	over := e.do(t, http.MethodPost, base, map[string]any{"photoBase64": b64(jpegHead)})

	require.Equal(t, http.StatusUnprocessableEntity, over.Code)
	body := decode(t, over)
	require.Equal(t, "photo_limit_exceeded", body["error"])
	require.Equal(t, "vaccine_card", body["reason"])
	require.Equal(t, "10", body["limit"])
}

func TestHandler_APhotoOfAnotherChildOrAnUnknownOneIsNotFound(t *testing.T) {
	e := newEnv(t)
	created := decode(t, e.do(t, http.MethodPost, "/children/"+e.f.childID.String()+"/vaccine-card-photos", map[string]any{"photoBase64": b64(jpegHead)}))
	id := created["id"].(string)
	otherBase := "/children/" + e.other.String() + "/vaccine-card-photos"

	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodGet, otherBase+"/"+id, nil).Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodDelete, otherBase+"/"+id, nil).Code)
	missing := e.do(t, http.MethodGet, otherBase+"/"+uuid.NewString(), nil)
	require.Equal(t, "photo_not_found", decode(t, missing)["error"])
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodGet, otherBase+"/not-a-uuid", nil).Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodDelete, otherBase+"/not-a-uuid", nil).Code)
	require.Equal(t, http.StatusNotFound, e.do(t, http.MethodGet, "/children/not-a-uuid/vaccine-card-photos", nil).Code)
	unknownChild := e.do(t, http.MethodPost, "/children/"+uuid.NewString()+"/vaccine-card-photos", map[string]any{"photoBase64": b64(jpegHead)})
	require.Equal(t, http.StatusNotFound, unknownChild.Code)
	require.Equal(t, "child_not_found", decode(t, unknownChild)["error"])
}

func TestHandler_NoPhotoContentReachesErrorLogs(t *testing.T) {
	e := newEnv(t)
	base := "/children/" + e.f.childID.String() + "/vaccine-card-photos"
	content := b64(append(append([]byte{}, jpegHead...), []byte("CONTENIDO-PRIVADO-DE-LA-FOTO")...))

	e.do(t, http.MethodPost, base, map[string]any{"photoBase64": b64([]byte("no es imagen CONTENIDO-PRIVADO"))})
	for i := 0; i < vaccination.MaxPhotosPerChild; i++ {
		e.do(t, http.MethodPost, base, map[string]any{"photoBase64": content})
	}
	e.do(t, http.MethodPost, base, map[string]any{"photoBase64": content})

	require.NotEmpty(t, e.log.all())
	for _, entry := range e.log.all() {
		require.NotContains(t, entry.Message+entry.Endpoint, "CONTENIDO-PRIVADO")
		require.NotContains(t, entry.Message, content)
	}
}

func TestHandler_PhotoFailuresOfTheDatabaseAreFixedMessages(t *testing.T) {
	testPool(t)
	h := vaccination.NewHandler(vaccination.NewService(vaccination.NewRepository(closedPool(t))), httpx.NewResponder(&capture{}))
	actor := uuid.New()
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(access.WithAccess(req.Context(), access.Access{Level: access.Full, ActorAccountID: actor})))
		})
	})
	registerPhotoRoutes(r, h)
	child := "/children/" + uuid.NewString() + "/vaccine-card-photos"

	for name, req := range map[string]*http.Request{
		"list":   httptest.NewRequest(http.MethodGet, child, nil),
		"add":    httptest.NewRequest(http.MethodPost, child, strings.NewReader(`{"photoBase64":"`+b64(jpegHead)+`"}`)),
		"get":    httptest.NewRequest(http.MethodGet, child+"/"+uuid.NewString(), nil),
		"delete": httptest.NewRequest(http.MethodDelete, child+"/"+uuid.NewString(), nil),
	} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusInternalServerError, rec.Code, name)
	}
}

func TestHandler_AnUploadWithNoSessionActorIs500(t *testing.T) {
	pool := testPool(t)
	f := newFamily(t, pool)
	h := vaccination.NewHandler(vaccination.NewService(vaccination.NewRepository(pool)), httpx.NewResponder(&capture{}))
	r := chi.NewRouter()
	registerPhotoRoutes(r, h)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/children/"+f.childID.String()+"/vaccine-card-photos", strings.NewReader(`{"photoBase64":"`+b64(jpegHead)+`"}`)))

	require.Equal(t, http.StatusInternalServerError, rec.Code)
}
