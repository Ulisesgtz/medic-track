package dataexport

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Specs/074: the children a person hid still go in the download of their data (hiding is presentation, nothing is deleted).
func TestCollect_AHiddenChildStillGoesInTheDownload(t *testing.T) {
	pool := testPool(t)
	f := seedFamily(t, pool)
	hidden := uuid.New()
	_, err := pool.Exec(context.Background(), `INSERT INTO children (id, account_id, first_name, last_name, birth_date, hidden_at)
		VALUES ($1, $2, 'Oculto', 'Export', '2021-01-01', now())`, hidden, f.Tutor)
	require.NoError(t, err)

	e, err := Collect(context.Background(), pool, Own(f.Tutor), exportNow)
	require.NoError(t, err)
	rows := table(t, e, "hijos").Rows
	require.Len(t, rows, 1)
	require.Equal(t, hidden.String(), *column(t, table(t, e, "hijos"), 0, "id"))
}
