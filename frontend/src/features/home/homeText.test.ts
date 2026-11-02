import { describe, expect, it } from 'vitest'
import {
  HOME,
  activitiesDone,
  caregiverOf,
  cardLabel,
  doneLine,
  dosesToday,
  familyMembers,
  familyOf,
  greeting,
  loadFailed,
  markLabel,
  markedAt,
  medicationsValue,
  nameAtTime,
  nextLine,
  ofTotal,
  sharedSubtitle,
  toMarkChip,
  unregisteredLine,
} from './homeText'

// Principio I: the home counts what was registered; it never says what is due, late or missing, never praises nor scolds.
const FORBIDDEN = /\bdebes\b|atras|falta|\btoca\b|\btocan\b|%|felicid|bien hecho|excelente|\bcuidado\b|alerta|no tomada|pendiente|urgente|olvid/i

describe('the words of the home (Principio I)', () => {
  const sentences = [
    ...Object.values(HOME),
    greeting('Ana'),
    sharedSubtitle('Familia Morales'),
    nextLine('Vitamina D', '14:00'),
    nameAtTime('Amoxicilina', '16:00'),
    doneLine('Caminar 30 min', '13:22'),
    markedAt('13:22'),
    dosesToday(2, 4),
    activitiesDone(3, 8),
    ofTotal(1, 2),
    medicationsValue({ total: 3, toMark: 1, unregistered: 0, marked: 2 }),
    medicationsValue({ total: 2, toMark: 0, unregistered: 1, marked: 0 }),
    medicationsValue({ total: 1, toMark: 0, unregistered: 0, marked: 1 }),
    toMarkChip(1),
    unregisteredLine('Paracetamol', '08:00'),
    markLabel('Amoxicilina', '16:00', 'Mateo'),
    cardLabel('Mateo'),
    loadFailed('Mateo'),
    familyMembers(1),
    familyMembers(3),
    caregiverOf('Familia Morales', 'Cuidador'),
    familyOf('Ana'),
  ]

  it('never advises, evaluates, praises or says what is late or missing', () => {
    for (const text of sentences) expect(text.normalize('NFD').replace(/\p{M}/gu, ''), text).not.toMatch(FORBIDDEN)
  })
})

describe('the values of the rows', () => {
  it('say the count of the day as the design does', () => {
    expect(medicationsValue({ total: 3, toMark: 1, unregistered: 0, marked: 2 })).toBe('3 tomas hoy · 1 por marcar')
    expect(medicationsValue({ total: 2, toMark: 0, unregistered: 1, marked: 0 })).toBe('2 tomas hoy · 1 sin registrar')
    expect(medicationsValue({ total: 3, toMark: 0, unregistered: 0, marked: 2 })).toBe('3 tomas hoy · 2 marcadas')
    expect(medicationsValue({ total: 1, toMark: 0, unregistered: 0, marked: 1 })).toBe('1 toma hoy · 1 marcada')
    expect(activitiesDone(2, 5)).toBe('2 de 5 hechas')
    expect(activitiesDone(0, 1)).toBe('0 de 1 hecha')
    expect(dosesToday(2, 4)).toBe('2 de 4 hoy')
    expect(nextLine('Vitamina D', '14:00')).toBe('Próxima: Vitamina D · 14:00')
    expect(unregisteredLine('Paracetamol', '08:00')).toBe('Paracetamol · 08:00 · sin registrar')
    expect(familyMembers(1)).toBe('Solo tú')
    expect(familyMembers(3)).toBe('3 personas')
  })
})
