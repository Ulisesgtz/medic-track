import { describe, expect, it } from 'vitest'
import { anySending, emailLine, emailShort } from './emailStatus'

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
})
