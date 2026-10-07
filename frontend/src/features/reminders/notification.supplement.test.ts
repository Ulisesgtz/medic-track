import { describe, expect, it } from 'vitest'
import { buildNotification, parsePayload, targetUrl, type ReminderPayload } from './notification'

// specs/033: a supplement routine's reminder points at its routine, not at a consultation.

const supplement: ReminderPayload = {
  kind: 'detailed',
  doseId: 'd1',
  routineId: 'r1',
  source: 'supplement',
  scheduledAt: '2026-10-06T14:00:00Z',
  medication: 'Vitamina D',
  child: 'Mateo',
  actionToken: 'tok',
}

describe('a supplement reminder', () => {
  it('is accepted without a consultation as long as it has a routine', () => {
    expect(parsePayload(() => supplement)).toEqual(supplement)
    expect(parsePayload(() => ({ kind: 'generic', doseId: 'd1', scheduledAt: '2026-10-06T14:00:00Z' }))).toBeNull()
  })

  it('opens the routine, and a medication opens its consultation', () => {
    expect(targetUrl(supplement)).toBe('/suplementos/r1')
    expect(targetUrl({ kind: 'generic', doseId: 'd1', consultationId: 'c9', scheduledAt: '2026-10-06T14:00:00Z' })).toBe('/consultations/c9')
  })

  it('is as neutral as a medication reminder, with the "Tomada" action', () => {
    const detailed = buildNotification(supplement)
    expect(detailed.options.body).toContain('Vitamina D')
    expect(detailed.options.actions).toEqual([{ action: 'taken', title: 'Tomada' }])
    const generic = buildNotification({ kind: 'generic', doseId: 'd1', routineId: 'r1', source: 'supplement', scheduledAt: supplement.scheduledAt })
    expect(generic.options.body).toMatch(/^Hay una toma programada · /)
    expect(JSON.stringify(generic)).not.toContain('Vitamina')
  })
})
