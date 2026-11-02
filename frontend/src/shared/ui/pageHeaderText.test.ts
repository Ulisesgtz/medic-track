import { describe, expect, it } from 'vitest'
import { PAGE_HEADER, loadFailedTitle } from './pageHeaderText'

// Principio I: neutral words; an error never blames and never alarms.
const FORBIDDEN = /\bdebes\b|atras|falta|\btoca\b|%|felicid|excelente|alerta|urgente|olvid|culpa|fallaste/i

describe('the words of the page header', () => {
  it('never evaluate, alarm or blame', () => {
    for (const text of [...Object.values(PAGE_HEADER), loadFailedTitle('la cartilla')])
      expect(text.normalize('NFD').replace(/\p{M}/gu, ''), text).not.toMatch(FORBIDDEN)
  })

  it('an error says that what was registered is kept', () => {
    expect(PAGE_HEADER.errorBody).toMatch(/está guardado/)
    expect(loadFailedTitle('la cartilla')).toBe('No pudimos cargar la cartilla')
  })
})
