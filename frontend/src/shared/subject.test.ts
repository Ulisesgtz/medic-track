import { describe, expect, it } from 'vitest'
import type { Account } from '../features/home/types'
import {
  apiBase,
  historyHref,
  newConsultationHref,
  personalPaid,
  subjectAccessOf,
  subjectHref,
  subjectKey,
  subjectOfConsultation,
  toSubject,
} from './subject'

const me: Account = {
  id: 'me',
  firstName: 'Ana',
  lastName: 'Gómez',
  email: 'ana@example.com',
  countryCode: null,
  stateCode: null,
  plan: 'paid',
  children: [{ id: 'kid', firstName: 'Mateo', lastName: 'Gómez', birthDate: '2021-03-14', height: null, weight: null }],
  disclaimerVersion: 'v',
  disclaimerAccepted: true,
  reminderDetail: null,
}

describe('subject', () => {
  it('reads a plain id as a child and builds the paths of each', () => {
    expect(toSubject('kid')).toEqual({ kind: 'child', childId: 'kid' })
    expect(apiBase('kid')).toBe('/children/kid')
    expect(apiBase({ kind: 'person', accountId: 'me' })).toBe('/accounts/me')
    expect(subjectKey('kid')).toBe('kid')
    expect(subjectKey({ kind: 'person', accountId: 'me' })).toBe('person:me')
    expect(subjectHref('kid', 'me')).toBe('/children/kid')
    expect(subjectHref({ kind: 'person', accountId: 'me' }, 'me')).toBe('/yo')
    expect(subjectHref({ kind: 'person', accountId: 'luis' }, 'me')).toBe('/personas/luis')
    expect(historyHref({ kind: 'person', accountId: 'me' }, 'me')).toBe('/yo/historial')
    expect(newConsultationHref('kid')).toBe('/children/kid/consultations/new')
    expect(newConsultationHref({ kind: 'person', accountId: 'me' })).toBe('/yo/consultas/nueva')
  })

  it('takes a consultation subject from its detail', () => {
    expect(subjectOfConsultation({ childId: 'kid', accountId: 'me' })).toEqual({ kind: 'child', childId: 'kid' })
    expect(subjectOfConsultation({ childId: null, accountId: 'me' })).toEqual({ kind: 'person', accountId: 'me' })
    expect(subjectOfConsultation({ childId: null })).toBeUndefined()
  })

  it('the plan of a person is theirs or their family', () => {
    expect(personalPaid({ plan: 'paid' })).toBe(true)
    expect(personalPaid({ plan: 'free', family: { role: 'tutor', ownerAccountId: 'o', ownerName: 'Luis', plan: 'paid', readOnly: false } })).toBe(true)
    expect(personalPaid({ plan: 'free' })).toBe(false)
  })

  it('the person does everything with their own; anybody else only sees and marks', () => {
    expect(subjectAccessOf(me, { kind: 'person', accountId: 'me' })).toMatchObject({ role: 'owner', canAdd: true, isFree: false })
    expect(subjectAccessOf(me, { kind: 'person', accountId: 'luis' })).toMatchObject({ role: 'caregiver', canAdd: false, canMark: true })
    expect(subjectAccessOf({ ...me, plan: 'free' }, { kind: 'person', accountId: 'me' }).isFree).toBe(true)
    expect(subjectAccessOf(undefined, { kind: 'person', accountId: 'me' })).toMatchObject({ canAdd: false, isFree: false })
    expect(subjectAccessOf(me, 'kid')).toMatchObject({ role: 'owner', canAdd: true })
    expect(subjectAccessOf(me, undefined).role).toBe('owner')
  })
})
