import type { CreatedInvitation, EmailStatus, FamilyInvitation } from './types'

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

/**
 * The live e-mail state of the invitation whose card is open, taken from the family list — but only if the list already knows
 * about THIS send. After a resend the cached list still holds the previous send's state («enviada») until the next read; showing
 * it would tell the person the new e-mail went out. A state is the list's own only when it is not older than the one the create
 * or resend answer gave; otherwise the answer's own state is used (undefined here).
 */
export function liveEmailStatus(list: FamilyInvitation[], created: CreatedInvitation): EmailStatus | undefined {
  const live = list.find((i) => i.id === created.id)
  if (!live?.emailStatusAt || !created.emailStatusAt) return undefined
  return Date.parse(live.emailStatusAt) >= Date.parse(created.emailStatusAt) ? live.emailStatus : undefined
}
