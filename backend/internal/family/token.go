package family

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
)

// NewToken makes the secret of an invitation's link: 32 random bytes, URL-safe, and its SHA-256. Only the hash is stored;
// the token is returned once and travels in the fragment of the link (never in an address the servers see) and in a request
// body. It is never logged.
func NewToken() (token string, hash []byte, err error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("generating the invitation token: %w", err)
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	return token, HashToken(token), nil
}

// HashToken is the SHA-256 of a token, what the database keeps.
func HashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
