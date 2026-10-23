import { describe, expect, it } from 'vitest'
import { buildNotification, parsePayload, targetUrl, type ReminderPayload } from './notification'

// specs/047: the reminder of a child's own phone has the same words as any other and opens the child's screen when tapped.

const payload = (extra: Partial<ReminderPayload> = {}): ReminderPayload => ({
  kind: 'generic',
  doseId: 'd1',
  consultationId: 'c1',
  scheduledAt: '2026-10-22T14:00:00Z',
  actionToken: 'token',
  scope: 'child',
  ...extra,
})

describe('the reminder of a child phone', () => {
  it('opens the child screen, whatever kind of dose it is', () => {
    expect(targetUrl(payload())).toBe('/hijo/hoy')
    expect(targetUrl(payload({ consultationId: undefined, routineId: 'r1', source: 'supplement' }))).toBe('/hijo/hoy')
    expect(targetUrl(payload({ consultationId: undefined, routineId: 'r1', source: 'activity' }))).toBe('/hijo/hoy')
  })

  it('does not change where the parents reminders go', () => {
    expect(targetUrl(payload({ scope: undefined }))).toBe('/consultations/c1')
  })

  it('is read like any other, keeping its scope', () => {
    const read = parsePayload(() => payload())
    expect(read?.scope).toBe('child')
  })

  it('has the same neutral words and the button for marking', () => {
    const { title, options } = buildNotification(payload())
    expect(title).toBe('Toma programada')
    expect(options.actions?.map((a) => a.title)).toEqual(['Tomada'])
  })
})
