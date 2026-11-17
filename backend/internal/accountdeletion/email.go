package accountdeletion

import (
	"context"
	"errors"
	"fmt"
	"time"
	_ "time/tzdata" // the zone database inside the binary (distroless has none)

	"github.com/Ulisesgtz/medic-track/backend/internal/mailer"
)

// Notifier sends the three e-mails of a deletion (research R9). None carries a child's name or health data (FR-017).
type Notifier interface {
	Requested(ctx context.Context, to, firstName string, scheduledFor time.Time) error
	FamilyNotice(ctx context.Context, to, ownerFirstName string, scheduledFor time.Time) error
	Completed(ctx context.Context, to, firstName string) error
}

// Mailer is the Notifier of production: plain-text e-mails through internal/mailer, inside the shared daily quota.
type Mailer struct {
	sender mailer.Sender
	quota  *mailer.Quota
	from   string
	sleep  func(context.Context, time.Duration) error
}

// NewMailer builds the Notifier. quota may be nil (no daily count).
func NewMailer(sender mailer.Sender, quota *mailer.Quota, from string) *Mailer {
	return &Mailer{sender: sender, quota: quota, from: from, sleep: mailer.SleepContext}
}

var mexicoCity = func() *time.Location {
	if loc, err := time.LoadLocation("America/Mexico_City"); err == nil {
		return loc
	}
	return time.FixedZone("CST", -6*60*60)
}()

var monthNames = [...]string{"enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
	"noviembre", "diciembre"}

// LongDate is «12 de diciembre de 2026» in Mexico City time.
func LongDate(t time.Time) string {
	l := t.In(mexicoCity)
	return fmt.Sprintf("%d de %s de %d", l.Day(), monthNames[l.Month()-1], l.Year())
}

func greeting(firstName string) string {
	if firstName == "" {
		return "Hola:"
	}
	return "Hola " + mailer.Clean(firstName, 40) + ":"
}

// Requested is the e-mail to the person who asked to delete her account.
func (m *Mailer) Requested(ctx context.Context, to, firstName string, scheduledFor time.Time) error {
	date := LongDate(scheduledFor)
	return m.send(ctx, to, "Tu cuenta de PediTrack se borrará el "+date, greeting(firstName)+`

Recibimos tu solicitud para eliminar tu cuenta de PediTrack. El `+date+` se borrarán tu cuenta y todo lo que registraste.

Hasta esa fecha puedes entrar a la app para descargar tus datos o para cancelar la eliminación. Mientras tanto no podrás registrar ni marcar nada, y dejarás de recibir avisos.

Si no fuiste tú quien lo pidió, entra a la app, cancela la eliminación y cambia tu contraseña.

PediTrack
`)
}

// FamilyNotice is the e-mail to each person of the family of an owner who asked to delete her account (FR-014).
func (m *Mailer) FamilyNotice(ctx context.Context, to, ownerFirstName string, scheduledFor time.Time) error {
	date := LongDate(scheduledFor)
	who := "La dueña de tu familia en PediTrack"
	if ownerFirstName != "" {
		who = mailer.Clean(ownerFirstName, 40)
	}
	return m.send(ctx, to, "Una cuenta de tu familia en PediTrack se va a eliminar", `Hola:

`+who+` pidió eliminar su cuenta de PediTrack. El `+date+` dejarás de ver a los hijos de su familia en la app.

Hasta esa fecha puedes seguir viéndolos, marcar sus tomas y descargar sus datos desde la app.

Lo de tu propia cuenta no cambia.

PediTrack
`)
}

// Completed is the last e-mail, once everything was deleted.
func (m *Mailer) Completed(ctx context.Context, to, firstName string) error {
	return m.send(ctx, to, "Tu cuenta de PediTrack se eliminó", greeting(firstName)+`

Tu cuenta de PediTrack y todo lo que registraste se borraron. Las copias de seguridad cifradas que pudieran contenerlos se borran solas en un máximo de 6 meses.

Gracias por haber usado PediTrack.
`)
}

var errNoAddress = errors.New("no address")

func (m *Mailer) send(ctx context.Context, to, subject, text string) error {
	if m == nil || m.sender == nil {
		return nil
	}
	if to == "" {
		return errNoAddress
	}
	var ticket mailer.Ticket
	if m.quota != nil {
		t, err := m.quota.Reserve(ctx, mailer.ClassAccount)
		if err != nil {
			return fmt.Errorf("reserving a place of the day: %w", err)
		}
		ticket = t
	}
	err := mailer.SendWithRetries(ctx, m.sender, mailer.Message{From: m.from, To: to, Subject: subject, Text: text},
		[]time.Duration{5 * time.Second, 20 * time.Second}, 15*time.Second, m.sleep)
	if err != nil && m.quota != nil {
		m.quota.Refund(context.WithoutCancel(ctx), ticket)
	}
	return err
}
