package consultation_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/consultation"
)

// The prescription photo is required until the account keeps MaxPhotosPerAccount of them; then a photo is refused and
// the consultation is saved without one. Nothing already saved is touched.

// fillPhotos inserts n consultations with a photo for the child, straight into the table (a hundred full saves would
// only slow the test down).
func fillPhotos(t *testing.T, pool *pgxpool.Pool, childID uuid.UUID, n int) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO consultations (child_id, doctor_name, consult_date, photo, notes)
		SELECT $1, 'Dr. Relleno', DATE '2026-01-15', $2::bytea, '' FROM generate_series(1, $3)
	`, childID, samplePhoto(), n)
	require.NoError(t, err)
}

func withoutPhoto() consultation.CreateConsultationInput {
	in := consultationInput()
	in.Photo = nil
	return in
}

func TestPhotoCap_UnderTheLimitThePhotoIsStillRequired(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	fillPhotos(t, pool, childID, consultation.MaxPhotosPerAccount-1)

	_, err := svc.CreateConsultation(context.Background(), childID, withoutPhoto())

	var verrs consultation.ValidationErrors
	require.ErrorAs(t, err, &verrs)
	require.Equal(t, "photoBase64", verrs[0].Field)
	require.Equal(t, consultation.MaxPhotosPerAccount-1, countConsultations(t, pool, childID), "nothing was saved")
}

func TestPhotoCap_TheLastPlaceTakesAPhoto(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	fillPhotos(t, pool, childID, consultation.MaxPhotosPerAccount-1)

	_, err := svc.CreateConsultation(context.Background(), childID, consultationInput())

	require.NoError(t, err)
}

func TestPhotoCap_AtTheLimitAPhotoIsRefusedAndOneWithoutItIsSaved(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	childID := createTestChild(t, pool)
	fillPhotos(t, pool, childID, consultation.MaxPhotosPerAccount)

	_, err := svc.CreateConsultation(context.Background(), childID, consultationInput())
	require.ErrorIs(t, err, consultation.ErrPhotoLimit)
	require.Equal(t, consultation.MaxPhotosPerAccount, countConsultations(t, pool, childID), "the refused one was not saved")

	saved, err := svc.CreateConsultation(context.Background(), childID, withoutPhoto())
	require.NoError(t, err)
	require.Empty(t, saved.Photo)

	// A consultation without a photo doesn't count toward the limit, and can be read back.
	got, err := svc.GetConsultation(context.Background(), saved.ID)
	require.NoError(t, err)
	require.Empty(t, got.Photo)
}

func TestPhotoCap_CountsEveryChildOfTheAccount(t *testing.T) {
	pool := testPool(t)
	svc := consultation.NewService(consultation.NewRepository(pool))
	children := createChildren(t, pool, "paid", 2)
	fillPhotos(t, pool, children[0], consultation.MaxPhotosPerAccount)

	_, err := svc.CreateConsultation(context.Background(), children[1], consultationInput())

	require.ErrorIs(t, err, consultation.ErrPhotoLimit)
}

func TestPhotoCap_HandlerAnswers422AndThenSavesWithoutPhoto(t *testing.T) {
	pool := testPool(t)
	childID := createTestChild(t, pool)
	fillPhotos(t, pool, childID, consultation.MaxPhotosPerAccount)
	router, _ := routerWithPool(t)
	path := "/children/" + childID.String() + "/consultations"
	body := map[string]any{
		"doctorName":  "Dra. López",
		"consultDate": "2026-01-15",
		"photoBase64": base64.StdEncoding.EncodeToString(testJPEG),
		"medications": []map[string]any{validMedicationPayload()},
	}

	rec := doPostPath(t, router, path, body)
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code)
	var resp map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "photo_limit_exceeded", resp["error"])
	require.Equal(t, "100", resp["limit"])

	delete(body, "photoBase64")
	rec = doPostPath(t, router, path, body)
	require.Equal(t, http.StatusCreated, rec.Code)
	var detail map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &detail))
	require.Equal(t, "", detail["photoBase64"])
}
