package payments

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"
)

// SignatureTolerance is how far from the server's clock a notice's timestamp may be.
const SignatureTolerance = 5 * time.Minute

// ErrBadSignature is returned for every kind of invalid signature: the caller learns nothing about which part failed.
var ErrBadSignature = errors.New("invalid signature")

// VerifySignature validates Mercado Pago's `x-signature` header (contracts/webhook.md): `ts=<number>,v1=<hex>`; the signed message
// is `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (the data id in lower case when it is alphanumeric; a part whose value is
// missing from the notice is left out), HMAC-SHA256 in hex with the application's secret, compared in constant time. The
// timestamp must be within SignatureTolerance of `now`. Nothing about the header, the secret or the message is returned.
func VerifySignature(secret, header, requestID, dataID string, now time.Time) error {
	if secret == "" {
		return ErrBadSignature
	}
	var ts, v1 string
	for _, part := range strings.Split(header, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch key {
		case "ts":
			ts = value
		case "v1":
			v1 = value
		}
	}
	if ts == "" || v1 == "" {
		return ErrBadSignature
	}
	// The timestamp is in milliseconds (the examples of the provider) or in seconds: both are read.
	n, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || n <= 0 {
		return ErrBadSignature
	}
	var sent time.Time
	if n > 1e11 {
		sent = time.UnixMilli(n)
	} else {
		sent = time.Unix(n, 0)
	}
	if d := now.Sub(sent); d > SignatureTolerance || d < -SignatureTolerance {
		return ErrBadSignature
	}

	var manifest strings.Builder
	if dataID != "" {
		if isAlphanumeric(dataID) {
			dataID = strings.ToLower(dataID)
		}
		manifest.WriteString("id:" + dataID + ";")
	}
	if requestID != "" {
		manifest.WriteString("request-id:" + requestID + ";")
	}
	manifest.WriteString("ts:" + ts + ";")

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(manifest.String()))
	want := hex.EncodeToString(mac.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(want), []byte(strings.ToLower(v1))) != 1 {
		return ErrBadSignature
	}
	return nil
}

func isAlphanumeric(s string) bool {
	for _, r := range s {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z') {
			return false
		}
	}
	return s != ""
}
