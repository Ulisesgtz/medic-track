package clienterror_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestReport_EndpointAndMessage(t *testing.T) {
	r := valid()
	require.Equal(t, "client:/consultations/:consultationId", r.Endpoint())
	require.Equal(t, "render · Cannot read properties of undefined (reading 'doses') · safari/ios · instalada · v3e34a6799b24 · repetido 2–9 veces", r.RowMessage())

	r.Count, r.Installed = 1, false
	require.Equal(t, "render · Cannot read properties of undefined (reading 'doses') · safari/ios · v3e34a6799b24", r.RowMessage())

	r.Count = 10
	require.True(t, strings.HasSuffix(r.RowMessage(), " · repetido 10 o más veces"))
	r.Count = 1000
	require.True(t, strings.HasSuffix(r.RowMessage(), " · repetido 10 o más veces"))
}

func TestReport_MessageIsCleanedAndNeverOver300(t *testing.T) {
	r := valid()
	r.Message = "fail for ana@example.com " + strings.Repeat("x", 290)
	got := r.RowMessage()
	require.NotContains(t, got, "ana@example.com")
	require.Contains(t, got, "[correo]")
	require.LessOrEqual(t, len([]rune(got)), 300)
}

func TestReport_TheTailAndTheVersionAlwaysFitInTheWorstCase(t *testing.T) {
	r := valid()
	r.Kind, r.Browser, r.OS, r.Installed = "rejection", "samsung", "windows", true
	r.Version = strings.Repeat("a", 20)
	r.Count = 1000
	r.Message = strings.Repeat("é", 300)

	got := r.RowMessage()
	require.LessOrEqual(t, len([]rune(got)), 300)
	require.True(t, strings.HasSuffix(got, " · v"+r.Version+" · repetido 10 o más veces"))
	require.Contains(t, got, "…")

}
