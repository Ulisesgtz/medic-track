package accountdeletion

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/appointment"
	"github.com/Ulisesgtz/medic-track/backend/internal/cabinet"
	"github.com/Ulisesgtz/medic-track/backend/internal/growth"
	"github.com/Ulisesgtz/medic-track/backend/internal/supplement"
	"github.com/Ulisesgtz/medic-track/backend/internal/vaccination"
)

// After an invited person is deleted, what they created in another family is still read by every screen — without their
// name (the readers join the author with LEFT JOIN, research R1).
func TestReaders_StillShowWhatADeletedPersonCreated(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	w := seedWorld(t, pool)
	purge(t, pool, w.A)

	routine, err := supplement.NewRepository(pool).Get(ctx, w.XRoutine, time.Now().Add(-24*time.Hour), time.Now())
	require.NoError(t, err)
	require.NotNil(t, routine)

	vaccines, err := vaccination.NewRepository(pool).List(ctx, w.CX)
	require.NoError(t, err)
	require.Len(t, vaccines, 1)

	measures, err := growth.NewRepository(pool).List(ctx, w.CX)
	require.NoError(t, err)
	require.Len(t, measures, 1)

	items, err := cabinet.NewRepository(pool).List(ctx, w.X)
	require.NoError(t, err)
	require.Len(t, items, 1)

	ap, err := appointment.NewRepository(pool).Get(ctx, w.XAppointment)
	require.NoError(t, err)
	require.NotNil(t, ap)
}
