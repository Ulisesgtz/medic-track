package payments

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

var sigNow = time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)

func sign(secret, manifest string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(manifest))
	return hex.EncodeToString(mac.Sum(nil))
}

func header(ts, v1 string) string { return "ts=" + ts + ",v1=" + v1 }

func TestVerifySignature_AValidOneInMillisecondsAndInSeconds(t *testing.T) {
	ms := fmt.Sprint(sigNow.UnixMilli())
	require.NoError(t, VerifySignature("secret", header(ms, sign("secret", "id:12345;request-id:req-1;ts:"+ms+";")), "req-1", "12345", sigNow))

	sec := fmt.Sprint(sigNow.Unix())
	require.NoError(t, VerifySignature("secret", header(sec, sign("secret", "id:12345;request-id:req-1;ts:"+sec+";")), "req-1", "12345", sigNow))
}

func TestVerifySignature_AnAlphanumericIdIsReadInLowerCase(t *testing.T) {
	ms := fmt.Sprint(sigNow.UnixMilli())
	good := header(ms, sign("secret", "id:abc123;request-id:r;ts:"+ms+";"))

	require.NoError(t, VerifySignature("secret", good, "r", "ABC123", sigNow))
	// An id with other characters is kept as it came.
	other := header(ms, sign("secret", "id:AB-12;request-id:r;ts:"+ms+";"))
	require.NoError(t, VerifySignature("secret", other, "r", "AB-12", sigNow))
}

func TestVerifySignature_APartWithoutValueIsLeftOut(t *testing.T) {
	ms := fmt.Sprint(sigNow.UnixMilli())
	noID := header(ms, sign("secret", "request-id:r;ts:"+ms+";"))
	require.NoError(t, VerifySignature("secret", noID, "r", "", sigNow))
	noRequest := header(ms, sign("secret", "id:1;ts:"+ms+";"))
	require.NoError(t, VerifySignature("secret", noRequest, "", "1", sigNow))
}

func TestVerifySignature_EverythingElseIsTheSameError(t *testing.T) {
	ms := fmt.Sprint(sigNow.UnixMilli())
	good := sign("secret", "id:1;request-id:r;ts:"+ms+";")
	old := fmt.Sprint(sigNow.Add(-6 * time.Minute).UnixMilli())
	future := fmt.Sprint(sigNow.Add(6 * time.Minute).UnixMilli())

	cases := map[string]struct{ header, requestID, dataID, secret string }{
		"altered v1":         {header(ms, good[:len(good)-1]+"0"), "r", "1", "secret"},
		"another secret":     {header(ms, good), "r", "1", "other"},
		"empty secret":       {header(ms, good), "r", "1", ""},
		"another id":         {header(ms, good), "r", "2", "secret"},
		"another request id": {header(ms, good), "x", "1", "secret"},
		"too old":            {header(old, sign("secret", "id:1;request-id:r;ts:"+old+";")), "r", "1", "secret"},
		"in the future":      {header(future, sign("secret", "id:1;request-id:r;ts:"+future+";")), "r", "1", "secret"},
		"ts not a number":    {header("abc", good), "r", "1", "secret"},
		"ts zero":            {header("0", good), "r", "1", "secret"},
		"no ts":              {"v1=" + good, "r", "1", "secret"},
		"no v1":              {"ts=" + ms, "r", "1", "secret"},
		"empty header":       {"", "r", "1", "secret"},
		"garbage header":     {"nonsense", "r", "1", "secret"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			require.ErrorIs(t, VerifySignature(c.secret, c.header, c.requestID, c.dataID, sigNow), ErrBadSignature)
		})
	}
}

func TestVerifySignature_TheErrorSaysNothingAboutTheSecretOrTheMessage(t *testing.T) {
	err := VerifySignature("super-secret", "ts=1,v1=zz", "req", "1", sigNow)

	require.EqualError(t, err, "invalid signature")
}
