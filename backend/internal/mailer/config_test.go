package mailer

import (
	"testing"

	"github.com/stretchr/testify/require"
)

var mailEnv = []string{"RESEND_API_KEY", "MAIL_FROM", "ERROR_DIGEST_FROM", "MAIL_DRIVER", "MAIL_DAILY_CAP", "MAIL_INVITATION_CAP",
	"MAIL_WARN_AT", "INVITATION_EMAIL_PER_INVITATION_PER_DAY", "INVITATION_EMAIL_PER_FAMILY_PER_DAY"}

func clearMailEnv(t *testing.T) {
	t.Helper()
	for _, k := range mailEnv {
		t.Setenv(k, "")
	}
}

func TestConfigDefaults(t *testing.T) {
	clearMailEnv(t)
	cfg := ConfigFromEnv()
	require.Equal(t, Config{From: DefaultFrom, DailyCap: 100, InvitationCap: 95, WarnAt: 80, PerInvitationPerDay: 3, PerFamilyPerDay: 10}, cfg)
	require.False(t, cfg.Available())
}

func TestConfigReadsTheEnvironment(t *testing.T) {
	clearMailEnv(t)
	t.Setenv("RESEND_API_KEY", "  re_secret  ")
	t.Setenv("MAIL_FROM", " PediTrack <hola@pedi-track.com> ")
	t.Setenv("MAIL_DAILY_CAP", "50")
	t.Setenv("MAIL_INVITATION_CAP", "45")
	t.Setenv("MAIL_WARN_AT", "40")
	t.Setenv("INVITATION_EMAIL_PER_INVITATION_PER_DAY", "2")
	t.Setenv("INVITATION_EMAIL_PER_FAMILY_PER_DAY", "5")
	cfg := ConfigFromEnv()
	require.Equal(t, "re_secret", cfg.APIKey)
	require.Equal(t, "PediTrack <hola@pedi-track.com>", cfg.From)
	require.Equal(t, []int{50, 45, 40, 2, 5}, []int{cfg.DailyCap, cfg.InvitationCap, cfg.WarnAt, cfg.PerInvitationPerDay, cfg.PerFamilyPerDay})
	require.True(t, cfg.Available())
}

func TestConfigFallsBackToTheDigestSender(t *testing.T) {
	clearMailEnv(t)
	t.Setenv("ERROR_DIGEST_FROM", "Digest <d@pedi-track.com>")
	require.Equal(t, "Digest <d@pedi-track.com>", ConfigFromEnv().From)
}

func TestConfigInvalidValuesGoBackToTheDefaults(t *testing.T) {
	clearMailEnv(t)
	t.Setenv("MAIL_DAILY_CAP", "abc")
	t.Setenv("MAIL_WARN_AT", "0")
	t.Setenv("INVITATION_EMAIL_PER_INVITATION_PER_DAY", "-1")
	t.Setenv("INVITATION_EMAIL_PER_FAMILY_PER_DAY", "")
	cfg := ConfigFromEnv()
	require.Equal(t, []int{100, 95, 80, 3, 10}, []int{cfg.DailyCap, cfg.InvitationCap, cfg.WarnAt, cfg.PerInvitationPerDay, cfg.PerFamilyPerDay})
}

func TestConfigIncoherentCapsGoBackTogether(t *testing.T) {
	clearMailEnv(t)
	t.Setenv("MAIL_INVITATION_CAP", "120") // above the daily cap
	t.Setenv("INVITATION_EMAIL_PER_FAMILY_PER_DAY", "7")
	cfg := ConfigFromEnv()
	require.Equal(t, []int{100, 95, 80}, []int{cfg.DailyCap, cfg.InvitationCap, cfg.WarnAt})
	require.Equal(t, 7, cfg.PerFamilyPerDay, "the limits per day are checked on their own")
}

func TestConfigDiscardDriver(t *testing.T) {
	clearMailEnv(t)
	t.Setenv("MAIL_DRIVER", "discard")
	require.True(t, ConfigFromEnv().Available())
	t.Setenv("MAIL_DRIVER", "carrier-pigeon")
	cfg := ConfigFromEnv()
	require.Empty(t, cfg.Driver)
	require.False(t, cfg.Available())
}
