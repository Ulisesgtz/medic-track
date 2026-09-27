package reminder

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// actionTokenLifetime: the "Tomada" button of a reminder works for a day (research.md R7).
const actionTokenLifetime = 24 * time.Hour

// SignActionToken returns the token the "Tomada" action of a reminder sends back: it names one
// dose and the device that received it, expires, and is signed with the server's secret, so it
// can mark that dose and nothing else — and only while that device is still on.
func SignActionToken(secret string, doseID, deviceID uuid.UUID, expires time.Time) string {
	body := doseID.String() + "." + deviceID.String() + "." + strconv.FormatInt(expires.Unix(), 10)
	encoded := base64.RawURLEncoding.EncodeToString([]byte(body))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac(secret, encoded))
}

// VerifyActionToken checks the signature and the expiry and returns the dose and device it names.
// Every failure is ErrInvalidActionToken.
func VerifyActionToken(secret, token string, now time.Time) (doseID, deviceID uuid.UUID, err error) {
	encoded, sig, ok := strings.Cut(token, ".")
	if !ok || secret == "" {
		return uuid.Nil, uuid.Nil, ErrInvalidActionToken
	}
	gotMAC, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil || !hmac.Equal(gotMAC, mac(secret, encoded)) {
		return uuid.Nil, uuid.Nil, ErrInvalidActionToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return uuid.Nil, uuid.Nil, ErrInvalidActionToken
	}
	parts := strings.Split(string(raw), ".")
	if len(parts) != 3 {
		return uuid.Nil, uuid.Nil, ErrInvalidActionToken
	}
	expiresUnix, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || !now.Before(time.Unix(expiresUnix, 0)) {
		return uuid.Nil, uuid.Nil, ErrInvalidActionToken
	}
	doseID, errDose := uuid.Parse(parts[0])
	deviceID, errDevice := uuid.Parse(parts[1])
	if errDose != nil || errDevice != nil {
		return uuid.Nil, uuid.Nil, ErrInvalidActionToken
	}
	return doseID, deviceID, nil
}

func mac(secret, message string) []byte {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(message))
	return h.Sum(nil)
}
