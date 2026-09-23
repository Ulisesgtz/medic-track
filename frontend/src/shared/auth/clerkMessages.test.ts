import { describe, it, expect } from 'vitest'
import { clerkNotice, hasClerkCode } from './clerkMessages'

describe('clerkNotice', () => {
  it('turns "already signed in" into an info notice with a way to the home', () => {
    const notice = clerkNotice({ code: 'session_exists' }, 'fallback')
    expect(notice.tone).toBe('info')
    expect(notice.message).toMatch(/sesión iniciada/)
    expect(notice.action).toEqual({ label: 'Ir a mi inicio', to: '/home' })
  })

  it.each([
    ['form_identifier_exists', /Ya existe una cuenta con este correo/],
    ['form_password_pwned', /filtraciones/],
    ['form_password_not_strong_enough', /reglas/],
    ['form_code_incorrect', /código no es correcto/],
    ['too_many_requests', /demasiados intentos/],
    ['captcha_invalid', /eres una persona/],
  ])('translates %s to Spanish as an error', (code, expected) => {
    const notice = clerkNotice({ code }, 'fallback')
    expect(notice.tone).toBe('error')
    expect(notice.message).toMatch(expected)
  })

  it('reads the specific code nested in a real Clerk API error, not its generic top-level one', () => {
    const realShape = { code: 'api_response_error', errors: [{ code: 'form_password_pwned' }] }

    expect(clerkNotice(realShape, 'fallback').message).toMatch(/filtraciones/)
    expect(clerkNotice({ code: 'api_response_error', errors: [{ code: 'session_exists' }] }, 'fallback').tone).toBe('info')
    expect(clerkNotice({ code: 'api_response_error', errors: [{ code: 'something_new' }] }, 'fallback').message).toBe('fallback')
  })

  it('hasClerkCode finds a code at either level', () => {
    expect(hasClerkCode({ code: 'api_response_error', errors: [{ code: 'form_identifier_not_found' }] }, 'form_identifier_not_found')).toBe(true)
    expect(hasClerkCode({ code: 'form_identifier_not_found' }, 'form_identifier_not_found')).toBe(true)
    expect(hasClerkCode({ code: 'api_response_error' }, 'form_identifier_not_found')).toBe(false)
    expect(hasClerkCode(null, 'x')).toBe(false)
  })

  it('reads a cancelled Google access as info, not as a failure', () => {
    expect(clerkNotice({ code: 'oauth_access_denied' }, 'fallback').tone).toBe('info')
  })

  it('never surfaces the (English) Clerk message: unknown codes use the caller fallback', () => {
    expect(clerkNotice({ code: 'something_new' }, 'No se pudo. Intenta de nuevo.')).toEqual({
      tone: 'error',
      message: 'No se pudo. Intenta de nuevo.',
    })
    expect(clerkNotice(undefined, 'fallback').message).toBe('fallback')
    expect(clerkNotice(null, 'fallback').message).toBe('fallback')
  })
})
