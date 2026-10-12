import { describe, expect, it } from 'vitest'
import { anySending, emailLine, emailShort, liveEmailStatus } from './emailStatus'
import type { CreatedInvitation, FamilyInvitation } from './types'

describe('emailStatus', () => {
  it('words each state for the card without blaming anybody', () => {
    expect(emailLine('sending', 'a@b.com')).toBe('Enviamos la invitación a a@b.com · enviándose…')
    expect(emailLine('sent', 'a@b.com')).toBe('Enviamos la invitación a a@b.com · enviada ✓')
    expect(emailLine('failed', 'a@b.com')).toBe('No se pudo enviar el correo a a@b.com. Copia la liga y mándala tú.')
  })

  it('says nothing when no e-mail was asked or the answer predates e-mail', () => {
    expect(emailLine('none', 'a@b.com')).toBeNull()
    expect(emailLine(undefined, 'a@b.com')).toBeNull()
    expect(emailShort('none')).toBeNull()
    expect(emailShort(undefined)).toBeNull()
  })

  it('has a short wording for the list', () => {
    expect(emailShort('sending')).toBe('Correo: enviándose…')
    expect(emailShort('sent')).toBe('Correo enviado')
    expect(emailShort('failed')).toBe('Correo no enviado')
  })

  it('knows when something is still going out', () => {
    expect(anySending(undefined)).toBe(false)
    expect(anySending([])).toBe(false)
    expect(anySending([{ emailStatus: 'sent' }, { emailStatus: 'failed' }, {}])).toBe(false)
    expect(anySending([{ emailStatus: 'sent' }, { emailStatus: 'sending' }])).toBe(true)
  })

  it('takes the list state only when it is not older than the answer of this send', () => {
    const created = { id: 'i1', emailStatus: 'sending', emailStatusAt: '2026-10-12T14:00:10Z' } as CreatedInvitation
    const row = (emailStatus: FamilyInvitation['emailStatus'], emailStatusAt: string | null) => [{ id: 'i1', emailStatus, emailStatusAt }] as FamilyInvitation[]
    // the cached list still has the previous send («enviada» from a minute ago): not this send's
    expect(liveEmailStatus(row('sent', '2026-10-12T14:00:00Z'), created)).toBeUndefined()
    expect(liveEmailStatus(row('sending', '2026-10-12T14:00:10Z'), created)).toBe('sending')
    expect(liveEmailStatus(row('sent', '2026-10-12T14:00:12Z'), created)).toBe('sent')
    // the same instant written in another offset
    expect(liveEmailStatus(row('sent', '2026-10-12T08:00:12-06:00'), created)).toBe('sent')
    expect(liveEmailStatus([], created)).toBeUndefined()
    expect(liveEmailStatus(row('none', null), created)).toBeUndefined()
    expect(liveEmailStatus(row('sent', '2026-10-12T14:00:12Z'), { ...created, emailStatusAt: null })).toBeUndefined()
  })
})
