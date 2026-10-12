package errordigest

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func setEnv(t *testing.T, values map[string]string) {
	t.Helper()
	for _, name := range []string{"RESEND_API_KEY", "ERROR_DIGEST_TO", "ERROR_DIGEST_FROM", "ERROR_DIGEST_WEEKDAY", "ERROR_DIGEST_HOUR", "APP_ENV_LABEL"} {
		t.Setenv(name, values[name])
	}
}

func TestConfigFromEnv_Defaults(t *testing.T) {
	setEnv(t, nil)

	got := ConfigFromEnv()

	require.Equal(t, Config{To: DefaultTo, From: DefaultFrom, Weekday: 1, Hour: 8}, got)
	require.False(t, got.Available(), "without the key there is no digest")
}

func TestConfigFromEnv_ReadsEveryVariableAndTrimsThem(t *testing.T) {
	setEnv(t, map[string]string{
		"RESEND_API_KEY":       "  re_secret  ",
		"ERROR_DIGEST_TO":      " ops@example.com ",
		"ERROR_DIGEST_FROM":    " Alerts <a@example.com> ",
		"ERROR_DIGEST_WEEKDAY": " 5 ",
		"ERROR_DIGEST_HOUR":    "0",
		"APP_ENV_LABEL":        " DEV ",
	})

	got := ConfigFromEnv()

	require.Equal(t, Config{APIKey: "re_secret", To: "ops@example.com", From: "Alerts <a@example.com>", Weekday: 5, Hour: 0, EnvLabel: "DEV"}, got)
	require.True(t, got.Available())
}

func TestConfigFromEnv_InvalidWeekdayAndHourGoBackToTheirDefaults(t *testing.T) {
	for _, tc := range []struct{ weekday, hour string }{{"0", "24"}, {"8", "-1"}, {"monday", "eight"}, {"", ""}} {
		setEnv(t, map[string]string{"ERROR_DIGEST_WEEKDAY": tc.weekday, "ERROR_DIGEST_HOUR": tc.hour})
		got := ConfigFromEnv()
		require.Equal(t, DefaultWeekday, got.Weekday, tc.weekday)
		require.Equal(t, DefaultHour, got.Hour, tc.hour)
	}
	setEnv(t, map[string]string{"ERROR_DIGEST_WEEKDAY": "7", "ERROR_DIGEST_HOUR": "23"})
	got := ConfigFromEnv()
	require.Equal(t, 7, got.Weekday)
	require.Equal(t, 23, got.Hour)
}

func TestConfig_AvailableNeedsKeyRecipientAndSender(t *testing.T) {
	full := Config{APIKey: "k", To: "a@b.c", From: "x@y.z"}
	require.True(t, full.Available())
	require.False(t, Config{To: "a@b.c", From: "x@y.z"}.Available())
	require.False(t, Config{APIKey: "k", From: "x@y.z"}.Available())
	require.False(t, Config{APIKey: "k", To: "a@b.c"}.Available())
}

func TestConfig_UnavailableReasonNamesTheVariableAndNeverAValue(t *testing.T) {
	noKey := Config{To: "secret-to@example.com", From: "secret-from@example.com"}
	require.Equal(t, "error digest unavailable: RESEND_API_KEY is not set", noKey.UnavailableReason())

	noRecipient := Config{APIKey: "re_super_secret", From: "secret-from@example.com"}
	reason := noRecipient.UnavailableReason()
	require.Contains(t, reason, "ERROR_DIGEST_TO")
	require.False(t, strings.Contains(reason, "re_super_secret") || strings.Contains(reason, "secret-from"), "no value in the sentence")
}
