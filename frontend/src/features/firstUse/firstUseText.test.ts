import { describe, expect, it } from 'vitest'
import { DENIED_PHONE, DENIED_WEB, FIRST_USE, SAFARI_ART_LABEL, SAFARI_STEPS, consultationDone, farewell, stepsSubtitle } from './firstUseText'

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '')

// The list of features/home/homeText.test.ts (Principio I): the guide never advises, evaluates, praises or says what is late.
const FORBIDDEN = /\bdebes\b|atras|falta|\btoca\b|\btocan\b|%|felicid|bien hecho|excelente|\bcuidado\b|alerta|no tomada|pendiente|urgente|olvid/i
// The guide never speaks of plans, limits or prices (FR-025) nor gives health advice (FR-026).
const PLAN = /\bplan\b|\bplanes\b|gratis|gratuit|\bpago\b|\bpagar\b|precio|MX\$|premium|limite|\blimite\b/i
const HEALTH = /recomend|diagn[oó]st|\bdebe(s)?\b|conviene|sugerimos|importante/i

const sentences: string[] = [
  ...Object.values(FIRST_USE).flat(),
  stepsSubtitle(3),
  stepsSubtitle(2),
  stepsSubtitle(1),
  farewell(3),
  farewell(2),
  farewell(1),
  consultationDone('la Dra. López'),
]
// The instructions of the other devices' menus name the thing to tap, so «Toca» is theirs alone (research R11).
const instructions: string[] = [...SAFARI_STEPS, ...DENIED_PHONE, ...DENIED_WEB, SAFARI_ART_LABEL]

describe('the words of the first-use guide (Principio I, FR-025, FR-026)', () => {
  it('never advise, evaluate, praise or say what is late or missing', () => {
    for (const text of sentences) expect(fold(text), text).not.toMatch(FORBIDDEN)
  })

  it('never speak of plans, limits or prices', () => {
    for (const text of [...sentences, ...instructions]) expect(fold(text), text).not.toMatch(PLAN)
  })

  it('never give health advice', () => {
    for (const text of [...sentences, ...instructions]) expect(fold(text), text).not.toMatch(HEALTH)
  })

  it('the instructions of the menus use their own list, without «toca» forbidden but with the rest', () => {
    const own = /\bdebes\b|atras|falta|%|felicid|bien hecho|excelente|alerta|pendiente|urgente|olvid/i
    for (const text of instructions) expect(fold(text), text).not.toMatch(own)
  })
})

describe('the sentences with a number', () => {
  it('the subtitle follows the count of steps', () => {
    expect(stepsSubtitle(3)).toBe('Tres pasos, en el orden que quieras.')
    expect(stepsSubtitle(2)).toBe('Dos pasos, en el orden que quieras.')
    expect(stepsSubtitle(1)).toBe('Un paso, en el orden que quieras.')
  })

  it('the farewell follows the count of steps', () => {
    expect(farewell(3)).toBe('Los tres pasos están hechos. Esta guía ya no se mostrará.')
    expect(farewell(2)).toBe('Los dos pasos están hechos. Esta guía ya no se mostrará.')
    expect(farewell(1)).toBe('El paso está hecho. Esta guía ya no se mostrará.')
  })

  it('the consultation keeps the doctor as it was saved', () => {
    expect(consultationDone('Dra. López')).toBe('Registraste la consulta con Dra. López.')
  })
})
