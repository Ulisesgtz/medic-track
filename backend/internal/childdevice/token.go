// Package childdevice is the access of a child's own phone (specs/047-dispositivo-del-hijo): the parent makes a one-use link for ONE
// child, the phone redeems it for a credential of its own, and from then on it sees and marks only that child's doses, supplements
// and activities. There is no e-mail, password or account for the minor. The credential travels in `Authorization: Device …`
// (never `Bearer`), so it can't be confused with a Clerk session: every parent route answers 401 to it by construction.
package childdevice

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
)

// tokenBytes is the size of both secrets (the link's token and the credential): 256 random bits.
const tokenBytes = 32

// NewToken makes a secret (the token of a link or a credential): 32 random bytes, URL-safe, and its SHA-256. Only the hash is
// stored; the secret is returned once and never logged. The link's token travels in the fragment of the link and, to redeem it,
// in a request body — never in an address.
func NewToken() (token string, hash []byte, err error) {
	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("generating a device secret: %w", err)
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	return token, Hash(token), nil
}

// Hash is the SHA-256 of a secret, what the database keeps.
func Hash(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// ParseToken is the hash of a secret that has the shape of one (base64url of 32 bytes). Anything else is not a secret this service
// ever made, so it is answered as unknown without touching the database.
func ParseToken(s string) ([]byte, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil || len(raw) != tokenBytes {
		return nil, false
	}
	return Hash(s), true
}
