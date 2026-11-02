import { describe, expect, it } from 'vitest'
import {
  CHILD,
  activitiesDone,
  addRoutine,
  childSubtitle,
  doneLine,
  dosesToday,
  emptyRoutines,
  loadFailedDay,
  nameAtTime,
  summaryDoses,
  markLabel,
  nextActivity,
  phones,
  planRoutines,
  toMarkChip,
  treatmentEnds,
  treatmentName,
  unregisteredChip,
} from './childDetailText'

// Principio I: the child's detail counts what was registered; it never says what is due, late or missing, never praises nor scolds.
const FORBIDDEN = /\bdebes\b|atras|falta|\btoca\b|\btocan\b|%|felicid|bien hecho|excelente|\bcuidado\b|alerta|no tomada|pendiente|urgente|olvid/i

describe('the words of the child detail (Principio I)', () => {
  const sentences = [
    ...Object.values(CHILD),
    childSubtitle('2021-03-14'),
    dosesToday(7),
    toMarkChip(2),
    unregisteredChip(1),
    activitiesDone(2, 5),
    nextActivity('Lavarse las manos', '14:00'),
    doneLine('Lavarse las manos', '13:22'),
    markLabel('Amoxicilina', '08:00'),
    loadFailedDay('Mateo'),
    treatmentName('Amoxicilina', 1),
    treatmentEnds('2026-11-04T20:00:00Z'),
    phones(2),
    summaryDoses(7, 2, 3),
    summaryDoses(7, 0, 5),
    nameAtTime('Vitamina D', '08:00'),
    emptyRoutines('supplement'),
    emptyRoutines('activity'),
    addRoutine('supplement'),
    addRoutine('activity'),
    planRoutines('supplement'),
    planRoutines('activity'),
  ]

  it('never advises, evaluates, praises or says what is late or missing', () => {
    for (const text of sentences) expect(text.normalize('NFD').replace(/\p{M}/gu, ''), text).not.toMatch(FORBIDDEN)
  })
})

describe('the counts', () => {
  it('says one or many', () => {
    expect(dosesToday(1)).toBe('1 toma hoy')
    expect(dosesToday(7)).toBe('7 tomas hoy')
    expect(activitiesDone(0, 1)).toBe('0 de 1 hecha')
    expect(activitiesDone(2, 5)).toBe('2 de 5 hechas')
    expect(phones(1)).toBe('1 teléfono')
    expect(treatmentName('Amoxicilina', 0)).toBe('Amoxicilina')
    expect(treatmentName('Amoxicilina', 1)).toBe('Amoxicilina +1')
    expect(childSubtitle('2021-03-14')).toMatch(/· nació el 14 mar 2021$/)
  })
})
