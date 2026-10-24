package vaccination_test

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/vaccination"
)

func newPhotoService(t *testing.T) (*vaccination.Service, family, *pgxpool.Pool) {
	t.Helper()
	pool := testPool(t)
	return vaccination.NewService(vaccination.NewRepository(pool)), newFamily(t, pool), pool
}

func TestPhotos_AddedListedWithoutTheImageOpenedByIdAndDeletedForGood(t *testing.T) {
	svc, f, _ := newPhotoService(t)
	ctx := context.Background()

	meta, err := svc.AddPhoto(ctx, f.childID, f.accountID, b64(jpegHead))

	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, meta.ID)
	require.Equal(t, "Ana", meta.CreatedByName)
	list, err := svc.ListPhotos(ctx, f.childID)
	require.NoError(t, err)
	require.Len(t, list, 1)
	require.Equal(t, meta.ID, list[0].ID)
	got, err := svc.GetPhoto(ctx, f.childID, meta.ID)
	require.NoError(t, err)
	require.Equal(t, jpegHead, got)

	require.NoError(t, svc.DeletePhoto(ctx, f.childID, meta.ID))
	empty, err := svc.ListPhotos(ctx, f.childID)
	require.NoError(t, err)
	require.NotNil(t, empty)
	require.Empty(t, empty)
	_, err = svc.GetPhoto(ctx, f.childID, meta.ID)
	require.ErrorIs(t, err, vaccination.ErrPhotoNotFound)
	require.ErrorIs(t, svc.DeletePhoto(ctx, f.childID, meta.ID), vaccination.ErrPhotoNotFound)
}

func TestPhotos_ThePhotosAreListedInTheOrderTheyWereSaved(t *testing.T) {
	svc, f, _ := newPhotoService(t)
	ctx := context.Background()
	first, err := svc.AddPhoto(ctx, f.childID, f.accountID, b64(jpegHead))
	require.NoError(t, err)
	second, err := svc.AddPhoto(ctx, f.childID, f.accountID, b64(jpegHead))
	require.NoError(t, err)

	list, err := svc.ListPhotos(ctx, f.childID)

	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{first.ID, second.ID}, []uuid.UUID{list[0].ID, list[1].ID})
}

func TestPhotos_TheTenthFitsTheEleventhIsRefusedAndDeletingOneMakesRoom(t *testing.T) {
	svc, f, _ := newPhotoService(t)
	ctx := context.Background()
	var ids []uuid.UUID
	for i := 0; i < vaccination.MaxPhotosPerChild; i++ {
		m, err := svc.AddPhoto(ctx, f.childID, f.accountID, b64(jpegHead))
		require.NoError(t, err, "photo %d", i+1)
		ids = append(ids, m.ID)
	}

	_, over := svc.AddPhoto(ctx, f.childID, f.accountID, b64(jpegHead))
	require.ErrorIs(t, over, vaccination.ErrPhotoLimit)

	require.NoError(t, svc.DeletePhoto(ctx, f.childID, ids[0]))
	_, again := svc.AddPhoto(ctx, f.childID, f.accountID, b64(jpegHead))
	require.NoError(t, again)
}

func TestPhotos_TheLimitIsPerChildAndTheSameForEveryPlan(t *testing.T) {
	pool := testPool(t)
	svc := vaccination.NewService(vaccination.NewRepository(pool))
	f := newFamily(t, pool)
	ctx := context.Background()
	other := f.addChild(t, pool)
	for i := 0; i < vaccination.MaxPhotosPerChild; i++ {
		_, err := svc.AddPhoto(ctx, f.childID, f.accountID, b64(jpegHead))
		require.NoError(t, err)
	}

	_, sibling := svc.AddPhoto(ctx, other, f.accountID, b64(jpegHead))
	require.NoError(t, sibling, "another child of the same account has its own ten")

	_, err := pool.Exec(ctx, `UPDATE accounts SET plan = 'free' WHERE id = $1`, f.accountID)
	require.NoError(t, err)
	_, free := svc.AddPhoto(ctx, f.childID, f.accountID, b64(jpegHead))
	require.ErrorIs(t, free, vaccination.ErrPhotoLimit, "a free account has the same ten, not fewer")
	_, freeSibling := svc.AddPhoto(ctx, other, f.accountID, b64(jpegHead))
	require.NoError(t, freeSibling, "and is not blocked from adding")
}

// Two uploads of the same child at the same time must not both take the last place, and with a small pool they must not wait for
// each other forever (the lesson of specs/045: a transaction holds one connection and uses only that one).
func TestPhotos_ManyUploadsAtOnceTakeExactlyTheFreePlacesAndNeverHang(t *testing.T) {
	pool := testPool(t)
	svc := vaccination.NewService(vaccination.NewRepository(pool))
	f := newFamily(t, pool)
	ctx := context.Background()
	for i := 0; i < vaccination.MaxPhotosPerChild-1; i++ {
		_, err := svc.AddPhoto(ctx, f.childID, f.accountID, b64(jpegHead))
		require.NoError(t, err)
	}

	const parallel = 6
	results := make([]error, parallel)
	var wg sync.WaitGroup
	for i := 0; i < parallel; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, results[i] = svc.AddPhoto(ctx, f.childID, f.accountID, b64(jpegHead))
		}(i)
	}
	wg.Wait()

	ok, limited := 0, 0
	for _, err := range results {
		switch err {
		case nil:
			ok++
		default:
			require.ErrorIs(t, err, vaccination.ErrPhotoLimit)
			limited++
		}
	}
	require.Equal(t, 1, ok, "exactly one took the last place")
	require.Equal(t, parallel-1, limited)
	list, err := svc.ListPhotos(ctx, f.childID)
	require.NoError(t, err)
	require.Len(t, list, vaccination.MaxPhotosPerChild)
}

func TestPhotos_APhotoOfAnotherChildIsNotFoundAndAnUnknownChildIsRefused(t *testing.T) {
	svc, f, pool := newPhotoService(t)
	stranger := newFamily(t, pool)
	ctx := context.Background()
	meta, err := svc.AddPhoto(ctx, f.childID, f.accountID, b64(jpegHead))
	require.NoError(t, err)

	_, get := svc.GetPhoto(ctx, stranger.childID, meta.ID)
	del := svc.DeletePhoto(ctx, stranger.childID, meta.ID)
	_, add := svc.AddPhoto(ctx, uuid.New(), f.accountID, b64(jpegHead))
	_, invalid := svc.AddPhoto(ctx, f.childID, f.accountID, "not-a-photo")

	require.ErrorIs(t, get, vaccination.ErrPhotoNotFound)
	require.ErrorIs(t, del, vaccination.ErrPhotoNotFound)
	require.ErrorIs(t, add, vaccination.ErrChildNotFound)
	var verrs vaccination.ValidationErrors
	require.ErrorAs(t, invalid, &verrs)
	list, err := svc.ListPhotos(ctx, f.childID)
	require.NoError(t, err)
	require.Len(t, list, 1, "nothing changed")
}

func TestPhotos_FailuresOfTheDatabaseAreReturned(t *testing.T) {
	testPool(t)
	repo := vaccination.NewRepository(closedPool(t))
	ctx := context.Background()

	_, err := repo.AddPhoto(ctx, uuid.New(), uuid.New(), jpegHead)
	require.Error(t, err)
	_, err = repo.ListPhotos(ctx, uuid.New())
	require.Error(t, err)
	_, err = repo.GetPhoto(ctx, uuid.New(), uuid.New())
	require.Error(t, err)
	require.Error(t, repo.DeletePhoto(ctx, uuid.New(), uuid.New()))
}
