package childdevice_test

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/childdevice"
)

func TestNewToken_IsRandomUrlSafeAnd32Bytes(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		token, hash, err := childdevice.NewToken()
		require.NoError(t, err)
		require.Len(t, token, 43, "32 bytes in unpadded base64url")
		require.NotContains(t, token, "=")
		require.NotContains(t, token, "+")
		require.NotContains(t, token, "/")
		require.Len(t, hash, 32)
		require.False(t, seen[token], "a token repeated")
		seen[token] = true
	}
}

func TestHash_IsDeterministicAndParseTokenAgrees(t *testing.T) {
	token, hash, err := childdevice.NewToken()
	require.NoError(t, err)
	require.True(t, bytes.Equal(hash, childdevice.Hash(token)))
	parsed, ok := childdevice.ParseToken(token)
	require.True(t, ok)
	require.True(t, bytes.Equal(hash, parsed))
}

func TestParseToken_RejectsAnythingThatIsNotOneWeMade(t *testing.T) {
	for _, bad := range []string{"", "abc", "not base64 !!", "AAAA", string(make([]byte, 43)), "x/y+z=="} {
		_, ok := childdevice.ParseToken(bad)
		require.False(t, ok, bad)
	}
	long, _, err := childdevice.NewToken()
	require.NoError(t, err)
	_, ok := childdevice.ParseToken(long + "A")
	require.False(t, ok, "a longer secret is not ours")
}
