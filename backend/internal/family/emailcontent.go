package family

import (
	_ "embed"
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/Ulisesgtz/medic-track/backend/internal/mailer"
)

// The e-mail of an invitation (specs/040 contracts/email.md). It carries only what the invitation needs and Principio II allows:
// the first name of who invites, the role offered and what it lets the person do, when the link expires and the link itself —
// never anything of the children (names, ages, health, how many), nor the inviter's last name or e-mail. Neutral Spanish with no
// medical imperatives (Principio I). The HTML is the design of Claude Design (invitation_email.html, specs/040 contracts/email.md):
// tables and inline styles for the mail clients, a dark-mode variant, no scripts, no external styles, no tracking pixel. Its only
// image is the app's icon (the one the frontend already serves), and the only links are the invitation's.

// inviteHTMLTemplate is the e-mail's HTML with the markers {{NOMBRE}}, {{ROL}}, {{LO_QUE_PUEDE_HACER}}, {{LIGA}}, {{FECHA}} and
// {{LOGO_URL}}. buildInviteMessage fills them with escaped values in one pass, so a value is never read as a marker.
//
//go:embed invitation_email.html
var inviteHTMLTemplate string

// logoPath is the app's icon, served by the frontend (frontend/public/icon-192.png) at its own origin.
const logoPath = "/icon-192.png"

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
	page := strings.NewReplacer(
		"{{NOMBRE}}", esc(name),
		"{{ROL}}", esc(role),
		"{{LO_QUE_PUEDE_HACER}}", esc(can),
		"{{LIGA}}", esc(link),
		"{{FECHA}}", esc(expires),
		"{{LOGO_URL}}", esc(strings.TrimRight(m.Origin, "/")+logoPath),
	).Replace(inviteHTMLTemplate)

	return mailer.Message{
		From:           m.From,
		To:             m.To,
		Subject:        subject,
		Text:           text,
		HTML:           page,
		IdempotencyKey: m.IdempotencyKey,
	}
}
