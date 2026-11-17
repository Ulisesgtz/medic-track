package clienterror_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/clienterror"
)

type cleanCase struct {
	Name  string `json:"name"`
	Input string `json:"input"`
	Want  string `json:"want"`
}

// The table is shared with the phone (frontend shared/clientErrors/clean.test.ts): both sides must clean the same way.
func TestClean_SharedTable(t *testing.T) {
	raw, err := os.ReadFile("../../../specs/072-monitoreo-errores-frontend/contracts/clean-cases.json")
	require.NoError(t, err)
	var table struct {
		Cases []cleanCase `json:"cases"`
	}
	require.NoError(t, json.Unmarshal(raw, &table))
	require.NotEmpty(t, table.Cases)
	for _, c := range table.Cases {
		t.Run(c.Name, func(t *testing.T) {
			require.Equal(t, c.Want, clienterror.Clean(c.Input))
		})
	}
}

func TestClean_OwnCases(t *testing.T) {
	cases := map[string]string{
		"visit https://x.test/3e34a679-9b24-4c1d-8a5e-0123456789ab/9999 done": "visit [url] done",
		"id 3e34a679-9b24-4c1d-8a5e-0123456789ab 2026":                        "id [id] [n]",
		"a 'doses' b 'Ana López' c \"x\"":                                     "a 'doses' b [texto] c \"x\"",
		strings.Repeat("é", 250):                                              strings.Repeat("é", 199) + "…",
	}
	for in, want := range cases {
		require.Equal(t, want, clienterror.Clean(in))
	}
}
