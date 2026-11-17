package errordigest

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type fakeBackups struct {
	any             bool
	backup, chk     *time.Time
	failAny, failOK error
}

func (f fakeBackups) HasAny(context.Context) (bool, error) { return f.any, f.failAny }
func (f fakeBackups) LastOK(_ context.Context, kind string) (*time.Time, error) {
	if f.failOK != nil {
		return nil, f.failOK
	}
	if kind == "check" {
		return f.chk, nil
	}
	return f.backup, nil
}

func TestBackupsLine(t *testing.T) {
	now := time.Date(2026, 11, 16, 14, 0, 0, 0, time.UTC) // Monday 08:00 in Mexico City
	backup := time.Date(2026, 11, 16, 9, 0, 0, 0, time.UTC)
	check := time.Date(2026, 11, 16, 9, 6, 0, 0, time.UTC)
	ctx := context.Background()

	require.Equal(t, "Respaldos: último el 16 nov a las 03:00 · comprobación el 16 nov a las 03:06",
		readBackups(ctx, fakeBackups{any: true, backup: &backup, chk: &check}, now).Line())
	require.Equal(t, "Respaldos: último el 16 nov a las 03:00 · sin comprobación todavía",
		readBackups(ctx, fakeBackups{any: true, backup: &backup}, now).Line())
	old := now.Add(-49 * time.Hour)
	require.Equal(t, "Respaldos: ninguno en los últimos 2 días", readBackups(ctx, fakeBackups{any: true, backup: &old}, now).Line())
	require.Equal(t, "Respaldos: ninguno en los últimos 2 días", readBackups(ctx, fakeBackups{any: true}, now).Line())
	require.Equal(t, "Respaldos: sin registros", readBackups(ctx, fakeBackups{}, now).Line())
	require.Equal(t, "Respaldos: no se pudo leer su registro", readBackups(ctx, fakeBackups{failAny: errors.New("x")}, now).Line())
	require.Equal(t, "Respaldos: no se pudo leer su registro", readBackups(ctx, fakeBackups{any: true, failOK: errors.New("x")}, now).Line())
}

func TestRender_BackupsLineOnlyWithAStatus(t *testing.T) {
	d := Digest{Since: time.Date(2026, 11, 9, 14, 0, 0, 0, time.UTC), Until: time.Date(2026, 11, 16, 14, 0, 0, 0, time.UTC)}
	_, text := Render(d, "DEV")
	require.NotContains(t, text, "Respaldos")
	d.Backups = &Backups{}
	_, text = Render(d, "DEV")
	require.Contains(t, text, "- Respaldos: sin registros\n")
	require.True(t, strings.Index(text, "Respaldos") < strings.Index(text, "No hubo errores"))
}
