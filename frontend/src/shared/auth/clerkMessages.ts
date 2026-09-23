import type { NoticeTone } from '../ui/Notice'

export interface ClerkNotice {
  message: string
  tone: NoticeTone
  action?: { label: string; to: string }
}

// One message for "wrong password" and "no such email": the login never says which of the two it was
// (FR-009), so it can't be used to find out which emails have an account.
export const INVALID_CREDENTIALS_MESSAGE = 'El correo o la contraseña no son correctos. Revísalos e intenta de nuevo.'

const PASSWORD_RULES_MESSAGE = 'La contraseña no cumple con las reglas. Revísalas e intenta de nuevo.'

const BY_CODE: Record<string, ClerkNotice> = {
  session_exists: {
    tone: 'info',
    message: 'Ya tienes una sesión iniciada en este navegador. Ve a tu inicio, o cierra sesión para usar otra cuenta.',
    action: { label: 'Ir a mi inicio', to: '/home' },
  },
  form_identifier_exists: {
    tone: 'error',
    message: 'Ya existe una cuenta con este correo. Inicia sesión o usa otro correo.',
  },
  form_password_pwned: {
    tone: 'error',
    message: 'Esa contraseña apareció en filtraciones de datos y no es segura. Elige una diferente.',
  },
  form_password_length_too_short: { tone: 'error', message: PASSWORD_RULES_MESSAGE },
  form_password_not_strong_enough: { tone: 'error', message: PASSWORD_RULES_MESSAGE },
  form_password_validation_failed: { tone: 'error', message: PASSWORD_RULES_MESSAGE },
  form_param_format_invalid: { tone: 'error', message: 'Revisa que el correo y la contraseña tengan el formato correcto.' },
  form_password_incorrect: { tone: 'error', message: INVALID_CREDENTIALS_MESSAGE },
  form_identifier_not_found: { tone: 'error', message: INVALID_CREDENTIALS_MESSAGE },
  strategy_for_user_invalid: { tone: 'error', message: INVALID_CREDENTIALS_MESSAGE },
  user_locked: {
    tone: 'error',
    message: 'Tu cuenta está bloqueada temporalmente por demasiados intentos. Espera unos minutos e intenta de nuevo.',
  },
  form_code_incorrect: { tone: 'error', message: 'El código no es correcto. Revisa tu correo e intenta de nuevo.' },
  verification_failed: { tone: 'error', message: 'El código no es correcto. Revisa tu correo e intenta de nuevo.' },
  verification_expired: { tone: 'error', message: 'El código venció. Solicita uno nuevo.' },
  too_many_requests: { tone: 'error', message: 'Hiciste demasiados intentos. Espera un momento e intenta de nuevo.' },
  rate_limit_exceeded: { tone: 'error', message: 'Hiciste demasiados intentos. Espera un momento e intenta de nuevo.' },
  captcha_invalid: { tone: 'error', message: 'No pudimos verificar que eres una persona. Intenta de nuevo.' },
  captcha_unavailable: { tone: 'error', message: 'No pudimos verificar que eres una persona. Intenta de nuevo.' },
  oauth_access_denied: {
    tone: 'info',
    message: 'Cancelaste el acceso con Google. Puedes intentarlo de nuevo cuando quieras.',
  },
}

/** The shape of what Clerk returns as `error`: a generic top-level code plus the specific ones inside `errors`. */
export interface ClerkErrorLike {
  code?: string
  errors?: { code?: string }[]
}

/**
 * Every code an error carries, most specific first. A real Clerk API failure
 * arrives as `{ code: 'api_response_error', errors: [{ code: 'form_password_pwned' }] }`:
 * the top-level code says nothing, the useful one is inside `errors`.
 */
function codesOf(error: ClerkErrorLike | null | undefined): string[] {
  const inner = (error?.errors ?? []).map((e) => e.code)
  return [...inner, error?.code].filter((code): code is string => Boolean(code))
}

/** Whether the Clerk error carries the given code (top-level or nested). */
export function hasClerkCode(error: ClerkErrorLike | null | undefined, code: string): boolean {
  return codesOf(error).includes(code)
}

/**
 * Spanish, friendly version of a Clerk error. Clerk's own `message`s are
 * English and meant for developers ("not to be shown to the user or parsed" —
 * ClerkError docs), so they are never shown: the stable `code` picks the text
 * and anything unknown falls back to the caller's Spanish `fallback`.
 */
export function clerkNotice(error: ClerkErrorLike | null | undefined, fallback: string): ClerkNotice {
  for (const code of codesOf(error)) {
    if (BY_CODE[code]) return BY_CODE[code]
  }
  return { tone: 'error', message: fallback }
}
