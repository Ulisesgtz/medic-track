package clienterror

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The tail the server's cap adds and the version are what the weekly summary reads: the message gives way, never them.
func TestRowMessage_TheTailAlwaysFitsInTheWorstCase(t *testing.T) {
	r := Report{
		Kind: "rejection", Route: "/consultations/:consultationId", Browser: "samsung", OS: "windows", Installed: true,
		Version: strings.Repeat("a", 20), Count: 1000, Message: strings.Repeat("é", 300),
	}
	tail := " (+2147483647 más desde la última)"

	row := r.rowMessage(Clean(r.Message), tail)
	require.LessOrEqual(t, len([]rune(row)), maxRowMessage)
	require.True(t, strings.HasSuffix(row, " · v"+r.Version+" · repetido 10 o más veces"+tail))
	require.Contains(t, row, " · samsung/windows · instalada")
	require.True(t, strings.HasPrefix(row, "rejection · é"))
	require.Contains(t, row, "…")
}

func TestRowMessage_ShortMessageIsKeptWhole(t *testing.T) {
	r := Report{Kind: "error", Browser: "chrome", OS: "linux", Version: "abc", Count: 1}
	require.Equal(t, "error · boom · chrome/linux · vabc (+3 más desde la última)", r.rowMessage("boom", " (+3 más desde la última)"))
}
