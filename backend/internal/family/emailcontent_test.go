package family

import (
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// specs/040 contracts/email.md: what the invitation e-mail says, and what it must never say.

func sampleMail() inviteMail {
	return inviteMail{
		From: "PediTrack <alertas@pedi-track.com>", To: "invitada@example.com",
		Origin: "https://dev.pedi-track.com", Token: "tok_ABC-123_xyz",
		InviterName: "Ana", Role: RoleCaregiver,
		ExpiresAt:      time.Date(2026, time.October, 13, 18, 0, 0, 0, time.UTC),
		IdempotencyKey: "family-invitation-1-1",
	}
}

func TestInviteMessageSaysWhatItShould(t *testing.T) {
	m := buildInviteMessage(sampleMail())
	require.Equal(t, "Ana te invitó a PediTrack", m.Subject)
	require.Equal(t, "invitada@example.com", m.To)
	require.Equal(t, "family-invitation-1-1", m.IdempotencyKey)

	require.Contains(t, m.Text, "Ana te invita a PediTrack como Cuidador.")
	require.Contains(t, m.Text, "Como Cuidador podrás ver consultas, medicamentos y tomas, y marcar tomas.")
	require.Contains(t, m.Text, "La liga vence el 13 de octubre de 2026.")
	require.Contains(t, m.Text, "Si no esperabas esta invitación, puedes ignorar este mensaje")

	// The HTML is the design's: the name and the role are highlighted apart, so the sentences are not in one piece.
	require.Contains(t, m.HTML, ">Ana</span> te invita a PediTrack como <span")
	require.Contains(t, m.HTML, ">Cuidador</span>.</h1>")
	require.Contains(t, m.HTML, "Como <strong")
	require.Contains(t, m.HTML, ">Cuidador</strong> podrás ver consultas, medicamentos y tomas, y marcar tomas.</p>")
	require.Contains(t, m.HTML, ">13 de octubre de 2026</strong>.")
	require.Contains(t, m.HTML, "Si no esperabas esta invitación, puedes ignorar este mensaje: no pasa nada y nadie tendrá acceso.")
	require.Contains(t, m.HTML, "Te invitaron a ver y marcar las tomas de la familia en PediTrack.", "the preheader")
	require.Contains(t, m.HTML, "<title>Ana te invitó a PediTrack</title>")
	require.Contains(t, m.HTML, "@media (prefers-color-scheme: dark)", "the dark-mode variant")
	require.NotContains(t, m.HTML, "{{", "every marker of the template was filled")
}

func TestInviteMessageForATutor(t *testing.T) {
	in := sampleMail()
	in.Role = RoleTutor
	m := buildInviteMessage(in)
	require.Contains(t, m.Text, "como Tutor.")
	require.Contains(t, m.Text, "agregar consultas e invitar a otras personas.")
}

func TestTheOnlyLinksAreTheInvitationsOwnAndThereIsOneImage(t *testing.T) {
	in := sampleMail()
	link := "https://dev.pedi-track.com/familia/invitacion#tok_ABC-123_xyz"
	logo := "https://dev.pedi-track.com/icon-192.png"
	// xmlns attributes are namespaces, not addresses anybody visits.
	namespaces := regexp.MustCompile(`xmlns(:\w+)?="[^"]*"`)
	urls := regexp.MustCompile(`https?://[^\s"<]+`)
	for _, origin := range []string{"https://dev.pedi-track.com", "https://dev.pedi-track.com/"} {
		in.Origin = origin
		m := buildInviteMessage(in)
		require.Contains(t, m.Text, link+"\n")
		require.Contains(t, m.HTML, `href="`+link+`"`)
		require.Contains(t, m.HTML, ">Aceptar invitación</a>")

		for _, found := range urls.FindAllString(m.Text, -1) {
			require.Equal(t, link, found, "no URL but the invitation's link in the text")
		}
		for _, found := range urls.FindAllString(namespaces.ReplaceAllString(m.HTML, ""), -1) {
			require.Contains(t, []string{link, logo}, found, "no URL but the link and the app's icon in the HTML")
		}
		require.Equal(t, 1, strings.Count(m.HTML, "<img "), "the icon is the only image")
		require.Contains(t, m.HTML, `<img src="`+logo+`"`)
		require.Equal(t, 2, strings.Count(m.HTML, `href="`), "the button and the copyable link, nothing else")
		for _, forbidden := range []string{"<script", "<link", "<iframe", "@import", "<form"} {
			require.NotContains(t, strings.ToLower(m.HTML), forbidden)
		}
	}
}

func TestTheExpiryDateIsMexicoCityTime(t *testing.T) {
	in := sampleMail()
	in.ExpiresAt = time.Date(2026, time.October, 13, 2, 0, 0, 0, time.UTC) // 20:00 of the 12th in Mexico City
	require.Contains(t, buildInviteMessage(in).Text, "La liga vence el 12 de octubre de 2026.")
	in.ExpiresAt = time.Date(2027, time.January, 1, 7, 0, 0, 0, time.UTC)
	require.Contains(t, buildInviteMessage(in).Text, "La liga vence el 1 de enero de 2027.")
}

func TestTheInvitersNameIsCleanedCutAndEscaped(t *testing.T) {
	cases := map[string]struct{ want, notIn string }{
		"  Ana\r\nBcc: x@y.com ":      {want: "Ana Bcc: [correo]", notIn: "\n"},
		"<script>alert(1)</script>":   {want: "&lt;script&gt;alert(1)&lt;/script&gt;"},
		"ana@example.com":             {want: "[correo]"},
		strings.Repeat("Mariana", 20): {want: "…"},
		"   ":                         {want: fallbackInviterName},
		"":                            {want: fallbackInviterName},
		"María José":                  {want: "María José"},
	}
	for name, c := range cases {
		in := sampleMail()
		in.InviterName = name
		m := buildInviteMessage(in)
		require.Contains(t, m.Subject+m.Text+m.HTML, c.want, "name %q", name)
		require.NotContains(t, m.Subject, "\n")
		require.NotContains(t, m.Subject, "\r")
		require.NotContains(t, m.HTML, "<script>")
		require.NotContains(t, m.HTML, "{{")
		if c.notIn != "" {
			require.NotContains(t, m.Subject, c.notIn)
		}
	}
	long := sampleMail()
	long.InviterName = strings.Repeat("Mariana", 20)
	require.LessOrEqual(t, len([]rune(strings.TrimSuffix(strings.TrimSuffix(buildInviteMessage(long).Subject, " te invitó a PediTrack"), "…")))+1, maxInviterNameRunes)
}

// Principio II: the e-mail never carries the children, nor the inviter's last name or e-mail.
func TestTheMessageHasNothingOfTheChildrenNorTheInvitersSurnameOrEmail(t *testing.T) {
	secrets := []string{"Mateo", "Sofía", "2019-04-12", "Gutiérrez", "ana.gutierrez@example.com", "hijos", "hijo "}
	in := sampleMail() // the inviter's account is "Ana Gutiérrez": only "Ana" is ever passed in
	m := buildInviteMessage(in)
	all := m.Subject + m.Text + m.HTML + m.From + m.To
	for _, secret := range secrets {
		require.NotContains(t, all, secret)
	}
}

func TestInvitationLinkTrimsTheOriginsSlash(t *testing.T) {
	require.Equal(t, "https://x.test/familia/invitacion#t", invitationLink("https://x.test///", "t"))
}
