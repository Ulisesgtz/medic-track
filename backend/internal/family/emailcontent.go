package family

import (
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/Ulisesgtz/medic-track/backend/internal/mailer"
)

// The e-mail of an invitation (specs/040 contracts/email.md). It carries only what the invitation needs and Principio II allows:
// the first name of who invites, the role offered and what it lets the person do, when the link expires and the link itself —
// never anything of the children (names, ages, health, how many), nor the inviter's last name or e-mail. Neutral Spanish with no
// medical imperatives (Principio I). No images, no external styles, no tracking pixel; the only link is the invitation's.

const (
	maxInviterNameRunes = 40
	fallbackInviterName = "Alguien de tu familia"
)

// roleCan is what each role lets a person do. The sentences are those of ROLE_CAN in frontend/src/features/family/roles.ts: if
// the wording changes there, change it here too (emailcontent_test.go pins this text).
var roleCan = map[Role]string{
	RoleTutor:     "ver consultas, medicamentos y tomas, marcar tomas, agregar consultas e invitar a otras personas.",
	RoleCaregiver: "ver consultas, medicamentos y tomas, y marcar tomas.",
}

// roleName is the word of each role in the e-mail (those of ROLE_LABEL in the frontend).
var roleName = map[Role]string{RoleTutor: "Tutor", RoleCaregiver: "Cuidador"}

var monthNames = [...]string{"enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"}

// spanishDate is «13 de octubre de 2026» in Mexico City time, with fixed month names (no locale data needed).
func spanishDate(t time.Time) string {
	local := t.In(mailer.MexicoCity())
	return fmt.Sprintf("%d de %s de %d", local.Day(), monthNames[local.Month()-1], local.Year())
}

// inviteMail is what the message of an invitation is made of.
type inviteMail struct {
	From, To    string
	Origin      string // the frontend's origin: FRONTEND_ORIGIN
	Token       string // the secret of the link; it is in the message and nowhere else
	InviterName string // first name only
	Role        Role
	ExpiresAt   time.Time
	// IdempotencyKey is family-invitation-<id>-<number of the send of the day>: no token, no address.
	IdempotencyKey string
}

// invitationLink is the link of an invitation: the token is after the «#», which a browser never sends to a server.
func invitationLink(origin, token string) string {
	return strings.TrimRight(origin, "/") + "/familia/invitacion#" + token
}

// cleanInviterName makes the first name safe for an e-mail: no control characters or line breaks, nothing that looks like an
// address or a token, at most 40 characters; «Alguien de tu familia» when nothing is left.
func cleanInviterName(name string) string {
	name = mailer.Clean(name, maxInviterNameRunes)
	if strings.TrimSpace(name) == "" {
		return fallbackInviterName
	}
	return name
}

// buildInviteMessage makes the plain-text and minimal HTML versions of the invitation e-mail.
func buildInviteMessage(m inviteMail) mailer.Message {
	name := cleanInviterName(m.InviterName)
	role := roleName[m.Role]
	can := roleCan[m.Role]
	link := invitationLink(m.Origin, m.Token)
	expires := spanishDate(m.ExpiresAt)
	subject := name + " te invitó a PediTrack"

	text := strings.Join([]string{
		fmt.Sprintf("%s te invita a PediTrack como %s.", name, role),
		"",
		fmt.Sprintf("Como %s podrás %s", role, can),
		"",
		"Para aceptar, abre esta liga con la cuenta que usa este correo:",
		link,
		"",
		fmt.Sprintf("La liga vence el %s.", expires),
		"",
		"Si no esperabas esta invitación, puedes ignorar este mensaje: no pasa nada y nadie tendrá acceso.",
		"",
		"PediTrack",
	}, "\n")

	esc := html.EscapeString
	page := fmt.Sprintf(`<p>%s te invita a PediTrack como %s.</p>
<p>Como %s podrás %s</p>
<p>Para aceptar, abre la liga con la cuenta que usa este correo:</p>
<p><a href="%s">Aceptar invitación</a></p>
<p>Si el botón no se ve, copia esta liga en tu navegador:<br>%s</p>
<p>La liga vence el %s.</p>
<p>Si no esperabas esta invitación, puedes ignorar este mensaje: no pasa nada y nadie tendrá acceso.</p>
<p>PediTrack</p>`,
		esc(name), esc(role), esc(role), esc(can), esc(link), esc(link), esc(expires))

	return mailer.Message{
		From:           m.From,
		To:             m.To,
		Subject:        subject,
		Text:           text,
		HTML:           page,
		IdempotencyKey: m.IdempotencyKey,
	}
}
