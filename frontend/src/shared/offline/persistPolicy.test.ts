import { describe, expect, it } from 'vitest'
import { isExpired, isGoneError, OFFLINE_MAX_AGE_MS, shouldPersist, stripForStorage } from './persistPolicy'

describe('shouldPersist', () => {
  it.each([
    [['accounts', 'me']],
    [['overview', 'c1', '2026-11-11T06:00:00.000Z']],
    [['consultations', 'c1']],
    [['consultation', 'k1']],
    [['routines', 'c1', 'supplement', 'x']],
    [['routine', 'r1', 'x']],
    [['appointments', 'child', 'c1']],
    [['cabinet', 'a1']],
    [['cabinet-item', 'i1']],
    [['vaccinations', 'c1']],
    [['vaccine-photos', 'c1']],
    [['family']],
    [['child-device', 'overview', 'c1', 'x']],
    [['catalog', 'countries']],
  ])('keeps %j', (key) => {
    expect(shouldPersist(key, 'success')).toBe(true)
  })

  it.each([
    [['cabinet-photo', 'i1']],
    [['vaccine-photos', 'c1', 'p1']],
    [['history', 'c1', {}]],
    [['history-options', 'c1']],
    [['growth', 'c1']],
    [['growth-chart', 'c1']],
    [['subscription', 'a1']],
    [['reminders', 'config']],
    [['device-links', 'c1']],
    [['invitation-preview']],
    [['something-new']],
    [[42]],
  ])('never keeps %j', (key) => {
    expect(shouldPersist(key, 'success')).toBe(false)
  })

  it('keeps only answers that arrived', () => {
    expect(shouldPersist(['consultation', 'k1'], 'error')).toBe(false)
    expect(shouldPersist(['consultation', 'k1'], 'pending')).toBe(false)
  })
})

describe('stripForStorage', () => {
  it('empties the prescription and says there was one', () => {
    const kept = stripForStorage({ id: 'k1', doctorName: 'Dra. Cázares', photoBase64: 'AAAA', medications: [{ name: 'Amoxicilina' }] })
    expect(kept).toEqual({ id: 'k1', doctorName: 'Dra. Cázares', photoBase64: '', photoOmitted: true, medications: [{ name: 'Amoxicilina' }] })
  })

  it('does not invent a photo where there was none', () => {
    expect(stripForStorage({ photoBase64: '' })).toEqual({ photoBase64: '' })
  })

  it('drops any image, however deep', () => {
    const kept = JSON.stringify(stripForStorage({ items: [{ name: 'x', picture: 'data:image/png;base64,AAA', nested: { src: 'data:image/jpeg;base64,BBB' } }] }))
    expect(kept).not.toContain('data:image')
    expect(kept).toContain('"name":"x"')
  })

  it('leaves the rest as the server sent it', () => {
    expect(stripForStorage([1, 'a', null, true])).toEqual([1, 'a', null, true])
    expect(stripForStorage('texto')).toBe('texto')
  })
})

describe('isExpired', () => {
  it('counts 7 days for each answer', () => {
    const now = Date.UTC(2026, 10, 11)
    expect(isExpired(now - OFFLINE_MAX_AGE_MS, now)).toBe(false)
    expect(isExpired(now - OFFLINE_MAX_AGE_MS - 1, now)).toBe(true)
    expect(isExpired(now - 24 * 60 * 60 * 1000, now)).toBe(false)
  })
})

describe('isGoneError', () => {
  it('takes the access the server no longer gives', () => {
    expect(isGoneError({ kind: 'forbidden' })).toBe(true)
    expect(isGoneError({ kind: 'no_access' })).toBe(true)
    expect(isGoneError({ kind: 'consultation_not_found' })).toBe(true)
    expect(isGoneError({ kind: 'not_found' })).toBe(true)
  })

  it('leaves anything else alone', () => {
    expect(isGoneError({ kind: 'network' })).toBe(false)
    expect(isGoneError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isGoneError(null)).toBe(false)
  })
})
