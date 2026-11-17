// specs/072, contracts/ui-error-screen.md: every sentence of the error screen. Calm, no blame, nothing about anybody's health
// (Principio I), and the word «error» is never written to the person.

/** Who is looking at the screen: a signed-in parent, a child's own phone (/hijo…) or somebody with no session. */
export type ErrorContext = 'person' | 'child' | 'visitor'

/** `base` = the screen broke; `again` = it broke again right after «Volver a cargar»; `offline` = there is no connection. */
export type ErrorState = 'base' | 'again' | 'offline'

export const ERROR_TITLE = 'Algo no cargó bien'
export const OFFLINE_TITLE = 'Parece que no hay conexión'
export const SENT_NOTE = 'El aviso del problema se envía solo.'
export const RELOAD_LABEL = 'Volver a cargar'

export const EXITS: Record<ErrorContext, { label: string; to: string }> = {
  person: { label: 'Ir al inicio', to: '/home' },
  child: { label: 'Ir a Hoy', to: '/hijo/hoy' },
  visitor: { label: 'Ir a iniciar sesión', to: '/login' },
}

const SAVED: Record<ErrorContext, string> = {
  person: 'Lo que ya guardaste sigue en tu cuenta.',
  child: 'Lo que ya marcaste sigue guardado.',
  visitor: 'Si ya tenías una cuenta, tus registros siguen ahí.',
}

export interface ScreenContent {
  title: string
  text: string
  note: string | null
  /** Which of the two buttons is the solid one. */
  solid: 'reload' | 'exit'
}

export function screenContent(state: ErrorState, context: ErrorContext): ScreenContent {
  if (state === 'offline') {
    return {
      title: OFFLINE_TITLE,
      text: `${SAVED[context]} Cuando vuelva la señal, vuelve a cargar la pantalla.`,
      note: null,
      solid: 'reload',
    }
  }
  if (state === 'again') {
    return {
      title: ERROR_TITLE,
      text: 'Sigue sin cargar. Intenta más tarde o regresa al inicio.',
      note: SAVED[context],
      solid: 'exit',
    }
  }
  return {
    title: ERROR_TITLE,
    text: `${SAVED[context]} Vuelve a cargar la pantalla para seguir.`,
    note: context === 'child' ? null : SENT_NOTE,
    solid: 'reload',
  }
}
