import type { NoticeTone } from '../ui/Notice'

export interface ClerkNotice {
  message: string
  tone: NoticeTone
  action?: { label: string; to: string }
}

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
  form_code_incorrect: { tone: 'error', message: 'El código no es correcto. Revisa tu correo e intenta de nuevo.' },
  verification_failed: { tone: 'error', message: 'El código no es correcto. Revisa tu correo e intenta de nuevo.' },
  verification_expired: { tone: 'error', message: 'El código venció. Vuelve a crear tu cuenta para recibir uno nuevo.' },
  too_many_requests: { tone: 'error', message: 'Hiciste demasiados intentos. Espera un momento e intenta de nuevo.' },
  rate_limit_exceeded: { tone: 'error', message: 'Hiciste demasiados intentos. Espera un momento e intenta de nuevo.' },
  captcha_invalid: { tone: 'error', message: 'No pudimos verificar que eres una persona. Intenta de nuevo.' },
  captcha_unavailable: { tone: 'error', message: 'No pudimos verificar que eres una persona. Intenta de nuevo.' },
  oauth_access_denied: {
    tone: 'info',
    message: 'Cancelaste el acceso con Google. Puedes intentarlo de nuevo cuando quieras.',
  },
}

/**
 * Spanish, friendly version of a Clerk error. Clerk's own `message`s are
 * English and meant for developers ("not to be shown to the user or parsed" —
 * ClerkError docs), so they are never shown: the stable `code` picks the text
 * and anything unknown falls back to the caller's Spanish `fallback`.
 */
export function clerkNotice(error: { code?: string } | null | undefined, fallback: string): ClerkNotice {
  return (error?.code ? BY_CODE[error.code] : undefined) ?? { tone: 'error', message: fallback }
}
