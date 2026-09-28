import { describe, it, expect, vi } from 'vitest'
import { formatTime } from '../../shared/date'
import {
  buildNotification,
  focusOrOpen,
  markTaken,
  MARK_FAILED,
  parsePayload,
  TAKEN_ACTION,
  targetUrl,
  type ReminderPayload,
} from './notification'

const detailed: ReminderPayload = {
  kind: 'detailed',
  doseId: 'dose-1',
  consultationId: 'cons-1',
  scheduledAt: '2026-09-27T14:00:00Z',
  medication: 'Amoxicilina',
  child: 'Mateo',
  actionToken: 'tok',
}
const generic: ReminderPayload = { kind: 'generic', doseId: 'dose-2', consultationId: 'cons-2', scheduledAt: '2026-09-27T14:00:00Z' }

describe('parsePayload', () => {
  it('accepts a reminder and ignores anything else', () => {
    expect(parsePayload(() => detailed)).toEqual(detailed)
    expect(parsePayload(() => generic)).toEqual(generic)
    expect(parsePayload(() => null)).toBeNull()
    expect(parsePayload(() => 'text')).toBeNull()
    expect(parsePayload(() => ({ ...generic, kind: 'loud' }))).toBeNull()
    expect(parsePayload(() => ({ kind: 'generic', doseId: 'd' }))).toBeNull()
    expect(
      parsePayload(() => {
        throw new SyntaxError('not json')
      }),
    ).toBeNull()
  })
})

describe('buildNotification', () => {
  const time = formatTime('2026-09-27T14:00:00Z')

  it('detailed: "Toma programada" with medication, time in the device zone and child', () => {
    const n = buildNotification(detailed)
    expect(n.title).toBe('Toma programada')
    expect(n.options.body).toBe(`Amoxicilina · ${time} · Mateo`)
    expect(n.options.tag).toBe('dose-dose-1')
    expect(n.options.data).toEqual(detailed)
    expect(n.options.actions).toEqual([{ action: TAKEN_ACTION, title: 'Tomada' }])
  })

  it('generic: no medication and no child, and no action without a token', () => {
    const n = buildNotification(generic)
    expect(n.title).toBe('Toma programada')
    expect(n.options.body).toBe(`Hay una toma programada · ${time}`)
    expect(n.options.actions).toBeUndefined()
  })

  it('never an imperative or a dose (Principio I)', () => {
    for (const p of [detailed, generic]) {
      const { title, options } = buildNotification(p)
      expect(`${title} ${options.body}`.toLowerCase()).not.toMatch(/debes|dale|administra|dosis/)
    }
  })

  it('a "detailed" reminder without a medication falls back to the generic text', () => {
    expect(buildNotification({ ...detailed, medication: undefined }).options.body).toBe(`Hay una toma programada · ${time}`)
  })
})

describe('targetUrl', () => {
  it('is the consultation of the dose', () => {
    expect(targetUrl(detailed)).toBe('/consultations/cons-1')
  })
})

describe('focusOrOpen', () => {
  const origin = 'https://pedi-track.com'

  it('takes an open window of the app to the consultation', async () => {
    const win = { url: `${origin}/home`, focus: vi.fn().mockResolvedValue(undefined), navigate: vi.fn().mockResolvedValue(undefined) }
    const clients = { matchAll: vi.fn().mockResolvedValue([win]), openWindow: vi.fn() }

    await focusOrOpen(clients, origin, '/consultations/c')

    expect(win.navigate).toHaveBeenCalledWith(`${origin}/consultations/c`)
    expect(win.focus).toHaveBeenCalled()
    // Focus first: browsers only allow it while the tap is fresh.
    expect(win.focus.mock.invocationCallOrder[0]).toBeLessThan(win.navigate.mock.invocationCallOrder[0])
    expect(clients.openWindow).not.toHaveBeenCalled()
  })

  it('navigates the client that focus() hands back', async () => {
    const focused = { url: `${origin}/home`, focus: vi.fn(), navigate: vi.fn().mockResolvedValue(undefined) }
    const win = { url: `${origin}/home`, focus: vi.fn().mockResolvedValue(focused), navigate: vi.fn() }
    const clients = { matchAll: vi.fn().mockResolvedValue([win]), openWindow: vi.fn() }

    await focusOrOpen(clients, origin, '/consultations/c')

    expect(focused.navigate).toHaveBeenCalledWith(`${origin}/consultations/c`)
    expect(win.navigate).not.toHaveBeenCalled()
  })

  it('opens a new window when the open one cannot be navigated', async () => {
    const win = {
      url: `${origin}/home`,
      focus: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockRejectedValue(new TypeError('not controlled')),
    }
    const clients = { matchAll: vi.fn().mockResolvedValue([win]), openWindow: vi.fn().mockResolvedValue(null) }

    await focusOrOpen(clients, origin, '/consultations/c')

    expect(clients.openWindow).toHaveBeenCalledWith(`${origin}/consultations/c`)
  })

  it('opens a new window when none of the app is open', async () => {
    const other = { url: 'https://example.com/', focus: vi.fn(), navigate: vi.fn() }
    const clients = { matchAll: vi.fn().mockResolvedValue([other]), openWindow: vi.fn().mockResolvedValue(null) }

    await focusOrOpen(clients, origin, '/consultations/c')

    expect(clients.openWindow).toHaveBeenCalledWith(`${origin}/consultations/c`)
    expect(other.navigate).not.toHaveBeenCalled()
  })
})

describe('markTaken', () => {
  it('posts the token and reports whether it worked', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true })
    expect(await markTaken(fetchFn, 'http://api', 'tok')).toBe(true)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://api/reminders/actions/taken')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ token: 'tok' })
    expect(init.headers).not.toHaveProperty('Authorization')

    expect(await markTaken(vi.fn().mockResolvedValue({ ok: false }), 'http://api', 'tok')).toBe(false)
    expect(await markTaken(vi.fn().mockRejectedValue(new TypeError('offline')), 'http://api', 'tok')).toBe(false)
  })

  it('has a Spanish fallback notification', () => {
    expect(MARK_FAILED.title).toBe('No se pudo marcar la toma')
    expect(MARK_FAILED.options.body).toBe('Ábrela en la app para marcarla.')
  })
})
