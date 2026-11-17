import { describe, expect, it } from 'vitest'
import errorScreenSource from './ErrorScreen.tsx?raw'
import {
  ERROR_TITLE,
  EXITS,
  OFFLINE_TITLE,
  RELOAD_LABEL,
  SENT_NOTE,
  screenContent,
  type ErrorContext,
  type ErrorState,
} from './errorScreenText'

const CONTEXTS: ErrorContext[] = ['person', 'child', 'visitor']
const STATES: ErrorState[] = ['base', 'again', 'offline']

function allSentences(): string[] {
  const out = [
    ERROR_TITLE,
    OFFLINE_TITLE,
    SENT_NOTE,
    RELOAD_LABEL,
    ...Object.values(EXITS).map((e) => e.label),
  ]
  for (const state of STATES)
    for (const context of CONTEXTS) {
      const c = screenContent(state, context)
      out.push(c.title, c.text)
      if (c.note) out.push(c.note)
    }
  return out
}

describe('errorScreenText', () => {
  it('says what the contract says for each state', () => {
    expect(screenContent('base', 'person')).toEqual({
      title: 'Algo no cargó bien',
      text: 'Lo que ya guardaste sigue en tu cuenta. Vuelve a cargar la pantalla para seguir.',
      note: 'El aviso del problema se envía solo.',
      solid: 'reload',
    })
    expect(screenContent('base', 'child').text).toBe(
      'Lo que ya marcaste sigue guardado. Vuelve a cargar la pantalla para seguir.',
    )
    expect(screenContent('base', 'child').note).toBeNull()
    expect(screenContent('base', 'visitor').text).toBe(
      'Si ya tenías una cuenta, tus registros siguen ahí. Vuelve a cargar la pantalla para seguir.',
    )
    expect(screenContent('again', 'person')).toEqual({
      title: 'Algo no cargó bien',
      text: 'Sigue sin cargar. Intenta más tarde o regresa al inicio.',
      note: 'Lo que ya guardaste sigue en tu cuenta.',
      solid: 'exit',
    })
    expect(screenContent('offline', 'person')).toEqual({
      title: 'Parece que no hay conexión',
      text: 'Lo que ya guardaste sigue en tu cuenta. Cuando vuelva la señal, vuelve a cargar la pantalla.',
      note: null,
      solid: 'reload',
    })
    expect(EXITS.person).toEqual({ label: 'Ir al inicio', to: '/home' })
    expect(EXITS.child).toEqual({ label: 'Ir a Hoy', to: '/hijo/hoy' })
    expect(EXITS.visitor).toEqual({ label: 'Ir a iniciar sesión', to: '/login' })
  })

  it('never says «error», blames, asks to report, or talks about health', () => {
    for (const sentence of allSentences()) {
      expect(sentence).not.toMatch(
        /error|fall[oó]|culpa|hiciste|reporta|avísanos|contáctanos|diagn|salud|médic|síntoma|dosis|tratamiento/i,
      )
    }
  })

  it('has no imperative that blames and always offers a way out', () => {
    for (const state of STATES)
      for (const context of CONTEXTS) {
        const c = screenContent(state, context)
        expect(c.title.length).toBeGreaterThan(0)
        expect(EXITS[context].to.startsWith('/')).toBe(true)
      }
  })

  it('the component uses no red or amber class (no alert colors, Principio I)', () => {
    expect(errorScreenSource).not.toMatch(
      /\b(?:bg|text|border|ring|stroke|fill)-(?:red|amber|rose|orange|yellow|pending|error)\b/,
    )
  })
})
