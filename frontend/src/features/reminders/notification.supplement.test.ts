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

// specs/035: an activity's reminder says «Actividad programada» and its button says «Realizado».

const activity: ReminderPayload = {
  kind: 'detailed',
  doseId: 'd2',
  routineId: 'a1',
  source: 'activity',
  scheduledAt: '2026-10-08T21:00:00Z',
  medication: 'Tomar agua',
  child: 'Mateo',
  actionToken: 'tok',
}

describe('an activity reminder', () => {
  it('is accepted with a routine and opens the activity, never the supplement', () => {
    expect(parsePayload(() => activity)).toEqual(activity)
    expect(targetUrl(activity)).toBe('/actividades/a1')
  })

  it('with detail names the activity and the child, with «Realizado» and no imperative', () => {
    const n = buildNotification(activity)
    expect(n.title).toBe('Actividad programada · Tomar agua')
    expect(n.options.body).toMatch(/^Mateo · /)
    expect(n.options.actions).toEqual([{ action: 'taken', title: 'Realizado' }])
    expect(n.options.tag).toBe('dose-d2')
  })

  it('the person’s own carries only the hour', () => {
    const own = buildNotification({ ...activity, child: undefined })
    expect(own.title).toBe('Actividad programada · Tomar agua')
    expect(own.options.body).not.toContain('Mateo')
    expect(own.options.body).toMatch(/^\d{2}:\d{2}$/)
  })

  it('generic carries no name and no child, and says there is one for now', () => {
    const generic = buildNotification({ kind: 'generic', doseId: 'd2', routineId: 'a1', source: 'activity', scheduledAt: activity.scheduledAt, actionToken: 'tok' })
    expect(generic.title).toBe('Actividad programada')
    expect(generic.options.body).toBe('Hay una actividad registrada para ahora.')
    expect(JSON.stringify(generic)).not.toContain('agua')
    expect(generic.options.actions).toEqual([{ action: 'taken', title: 'Realizado' }])
  })

  it('has no button without a token', () => {
    const none = buildNotification({ ...activity, actionToken: undefined })
    expect(none.options.actions).toBeUndefined()
  })
})
