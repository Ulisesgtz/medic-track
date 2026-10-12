package mailer

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/require"
)

func TestCleanMessage_LeavesANormalMessageAlone(t *testing.T) {
	for _, m := range []string{
		"Account not found",
		"reminder tick failed: could not read the due doses",
		"/children/{childId}/consultations/{consultationId}/medications/{medicationId}/extend",
		"Dosis: 3 × 5 ml",
	} {
		require.Equal(t, m, cleanMessage(m))
	}
}

func TestCleanMessage_RemovesLineBreaksAndControlCharacters(t *testing.T) {
	require.Equal(t, "first second third", cleanMessage("first\r\nsecond\tthird"))
	require.Equal(t, "a b", cleanMessage("a\x00\x07 b"))
	require.Equal(t, "spaced out", cleanMessage("  spaced   \n\n  out  "))
}

func TestCleanMessage_CutsAtOneHundredAndSixtyCharactersEndingInAnEllipsis(t *testing.T) {
	long := strings.Repeat("palabra ", 60)

	got := cleanMessage(long)

	require.Equal(t, 160, utf8.RuneCountInString(got))
	require.True(t, strings.HasSuffix(got, "…"))

	exact := strings.Repeat("abcdefg ", 19) + "abcdefgh" // 160 characters, and none of them a token
	require.Equal(t, exact, cleanMessage(exact), "exactly 160 is not cut")
	// Multi-byte characters count as one each, and the cut never splits one.
	accents := strings.Repeat("ñ", 200)
	cut := cleanMessage(accents)
	require.Equal(t, 160, utf8.RuneCountInString(cut))
	require.True(t, utf8.ValidString(cut))
}

func TestCleanMessage_ReplacesEmailsUUIDsAndTokensBeforeCutting(t *testing.T) {
	require.Equal(t, "[correo] not found", cleanMessage("ana.lopez+test@example.com not found"))
	require.Equal(t, "child [id] not found", cleanMessage("child 6f0c6a0e-1d2b-4c3a-9e8f-0123456789ab not found"))
	require.Equal(t, "child [id] not found", cleanMessage("child 6F0C6A0E-1D2B-4C3A-9E8F-0123456789AB not found"), "upper case too")
	require.Equal(t, "bad token [token] rejected", cleanMessage("bad token "+strings.Repeat("aB3_-", 10)+" rejected"))
	require.Equal(t, "/children/[id]/overview", cleanMessage("/children/6f0c6a0e-1d2b-4c3a-9e8f-0123456789ab/overview"))

	// An address sitting at the cut is replaced whole, not left half-written.
	padded := strings.Repeat("x ", 75) + "someone@example.com"
	got := cleanMessage(padded)
	require.NotContains(t, got, "@")
	require.NotContains(t, got, "someone")
}

func TestCleanMessage_ATokenHasDigitsALongWordDoesNot(t *testing.T) {
	word := "internationalizationlocalizationconfiguration" // 45 letters, no digits: a word, not a secret
	require.Equal(t, "failed to load "+word, cleanMessage("failed to load "+word))
	// 32 hexadecimal characters (a hash without dashes) do have digits.
	require.Equal(t, "hash [token]", cleanMessage("hash 9f86d081884c7d659a2feaa0c55ad015"))
}

// cleanMessage is Clean at the length the digest uses for the messages of error_logs.
func cleanMessage(s string) string { return Clean(s, 160) }
