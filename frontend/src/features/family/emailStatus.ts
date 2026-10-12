import type { EmailStatus } from './types'

/**
 * What the screen says about the e-mail of an invitation (specs/040). Neutral and never blaming: when it did not go out, the
 * link can always be copied. `none` (no e-mail is configured, or an answer from before this existed) says nothing about e-mail,
 * so the screen is the same as before.
 */
export function emailLine(status: EmailStatus | undefined, email: string): string | null {
  switch (status) {
    case 'sending':
      return `Enviamos la invitación a ${email} · enviándose…`
    case 'sent':
      return `Enviamos la invitación a ${email} · enviada ✓`
    case 'failed':
      return `No se pudo enviar el correo a ${email}. Copia la liga y mándala tú.`
    default:
      return null
  }
}

/** The short version for each pending invitation in the list. */
export function emailShort(status: EmailStatus | undefined): string | null {
  switch (status) {
    case 'sending':
      return 'Correo: enviándose…'
    case 'sent':
      return 'Correo enviado'
    case 'failed':
      return 'Correo no enviado'
    default:
      return null
  }
}

/** True while any invitation's e-mail is still going out: the list asks again every few seconds until none is. */
export function anySending(invitations: { emailStatus?: EmailStatus }[] | undefined): boolean {
  return (invitations ?? []).some((i) => i.emailStatus === 'sending')
}
