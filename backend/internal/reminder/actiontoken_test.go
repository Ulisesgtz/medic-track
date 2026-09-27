package reminder_test

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Ulisesgtz/medic-track/backend/internal/reminder"
)

func TestActionToken_RoundTrip(t *testing.T) {
	dose, device := uuid.New(), uuid.New()
	now := time.Now()
	token := reminder.SignActionToken("secret", dose, device, now.Add(time.Hour))

	gotDose, gotDevice, err := reminder.VerifyActionToken("secret", token, now)
	require.NoError(t, err)
	require.Equal(t, dose, gotDose)
	require.Equal(t, device, gotDevice)
}

func TestActionToken_Rejections(t *testing.T) {
	dose, device := uuid.New(), uuid.New()
	now := time.Now()
	valid := reminder.SignActionToken("secret", dose, device, now.Add(time.Hour))
	body, sig, _ := strings.Cut(valid, ".")
	cases := map[string]struct{ secret, token string }{
		"other secret":      {"other", valid},
		"no secret":         {"", valid},
		"no dot":            {"secret", "abc"},
		"bad signature b64": {"secret", body + ".!!!"},
		"tampered body":     {"secret", base64.RawURLEncoding.EncodeToString([]byte(dose.String()+"."+uuid.NewString()+".9999999999")) + "." + sig},
		"expired":           {"secret", reminder.SignActionToken("secret", dose, device, now.Add(-time.Second))},
		"empty":             {"secret", ""},
	}
	for name, c := range cases {
		_, _, err := reminder.VerifyActionToken(c.secret, c.token, now)
		require.ErrorIs(t, err, reminder.ErrInvalidActionToken, name)
	}
}

// A validly signed token whose content is malformed (only possible with the secret) is still refused.
func TestActionToken_MalformedContentWithAValidSignature(t *testing.T) {
	now := time.Now()
	for _, raw := range []string{"only.two", "not-a-uuid." + uuid.NewString() + ".9999999999", uuid.NewString() + ".x.9999999999", uuid.NewString() + "." + uuid.NewString() + ".soon"} {
		token := reminder.SignRawForTests("secret", raw)
		_, _, err := reminder.VerifyActionToken("secret", token, now)
		require.ErrorIs(t, err, reminder.ErrInvalidActionToken, raw)
	}
	_, _, err := reminder.VerifyActionToken("secret", "%%%."+strings.Repeat("a", 43), now)
	require.ErrorIs(t, err, reminder.ErrInvalidActionToken)
}
