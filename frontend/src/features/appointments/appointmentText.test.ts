import { describe, expect, it } from 'vitest'
import {
  bigDateText,
  countdown,
  dayMonthText,
  defaultNotices,
  leadMinutesOf,
  longDayText,
  noticeFireAt,
  noticeLabel,
  pastNoticesNote,
  pastWhen,
  sameNotice,
  shortDayText,
  startsAtOf,
  timeText,
  whenText,
} from './appointmentText'
import type { NoticeInput } from './types'

const FRI = new Date(2026, 9, 9, 10, 30)
const before = (m: number): NoticeInput => ({ kind: 'before', leadMinutes: m, daysBefore: null, atTime: null })
const fixed = (d: number, t: string): NoticeInput => ({ kind: 'at_time', leadMinutes: null, daysBefore: d, atTime: t })

describe('dates in words', () => {
  it('writes the day, the time and the pieces the mock uses', () => {
    expect(timeText(FRI)).toBe('10:30')
    expect(dayMonthText(FRI)).toBe('9 oct')
    expect(shortDayText(FRI)).toBe('vie 9 oct')
    expect(bigDateText(FRI)).toBe('Vie 9 oct')
    expect(whenText(new Date(2026, 9, 8, 10, 30))).toBe('jue 8 oct, 10:30')
    expect(longDayText(FRI)).toBe('viernes 9 oct')
  })

  it('reads the device-local date and time as one instant', () => {
    expect(startsAtOf('2026-10-09', '10:30')?.getTime()).toBe(FRI.getTime())
    expect(startsAtOf('', '10:30')).toBeNull()
    expect(startsAtOf('2026-10-09', '')).toBeNull()
    expect(startsAtOf('2026-13-45', '10:30')).toBeNull()
  })
})

describe('notices', () => {
  it('starts with one day before and two hours before', () => {
    expect(defaultNotices().map(noticeLabel)).toEqual(['1 día antes', '2 horas antes'])
  })

  it('says each notice as the server does', () => {
    expect(noticeLabel(before(2880))).toBe('2 días antes')
    expect(noticeLabel(before(60))).toBe('1 hora antes')
    expect(noticeLabel(before(180))).toBe('3 horas antes')
    expect(noticeLabel(before(30))).toBe('30 minutos antes')
    expect(noticeLabel(before(1))).toBe('1 minuto antes')
    expect(noticeLabel(fixed(0, '07:00'))).toBe('El mismo día a las 07:00')
    expect(noticeLabel(fixed(1, '20:00'))).toBe('Un día antes a las 20:00')
    expect(noticeLabel(fixed(3, '09:30'))).toBe('3 días antes a las 09:30')
  })

  it('computes when each one goes off', () => {
    expect(noticeFireAt(FRI, before(120))?.getTime()).toBe(new Date(2026, 9, 9, 8, 30).getTime())
    expect(noticeFireAt(FRI, fixed(1, '20:00'))?.getTime()).toBe(new Date(2026, 9, 8, 20, 0).getTime())
    expect(noticeFireAt(FRI, fixed(0, '07:00'))?.getTime()).toBe(new Date(2026, 9, 9, 7, 0).getTime())
    expect(noticeFireAt(FRI, { kind: 'before', leadMinutes: null, daysBefore: null, atTime: null })).toBeNull()
    expect(noticeFireAt(FRI, { kind: 'at_time', leadMinutes: null, daysBefore: 1, atTime: null })).toBeNull()
    expect(noticeFireAt(FRI, { kind: 'at_time', leadMinutes: null, daysBefore: null, atTime: '20:00' })).toBeNull()
  })

  it('tells two equal notices apart from different ones', () => {
    expect(sameNotice(before(60), before(60))).toBe(true)
    expect(sameNotice(before(60), before(61))).toBe(false)
    expect(sameNotice(before(60), fixed(1, '20:00'))).toBe(false)
  })
})

describe('what already passed', () => {
  const now = new Date(2026, 9, 7, 12, 0)
  it('says when a past notice was due', () => {
    expect(pastWhen(new Date(2026, 9, 7, 10, 30), now)).toBe('era hoy, 10:30')
    expect(pastWhen(new Date(2026, 9, 6, 10, 30), now)).toBe('era ayer, 10:30')
    expect(pastWhen(new Date(2026, 9, 3, 10, 30), now)).toBe('era el sáb 3 oct, 10:30')
  })

  it('explains that past notices are not sent and the rest stay', () => {
    expect(pastNoticesNote([], now)).toBeNull()
    expect(pastNoticesNote([{ label: '1 día antes', fire: new Date(2026, 9, 7, 10, 30) }], now)).toBe(
      'El aviso de «1 día antes» habría llegado hoy a las 10:30, que ya pasó, así que no se enviará. Los demás siguen igual.',
    )
    expect(pastNoticesNote([{ label: 'X', fire: new Date(2026, 9, 6, 8, 0) }], now)).toContain('habría llegado ayer')
    expect(pastNoticesNote([{ label: 'X', fire: new Date(2026, 9, 3, 8, 0) }], now)).toContain('habría llegado el sáb 3 oct')
    expect(
      pastNoticesNote(
        [
          { label: 'A', fire: new Date(2026, 9, 7, 8, 0) },
          { label: 'B', fire: new Date(2026, 9, 7, 9, 0) },
        ],
        now,
      ),
    ).toBe('Estos avisos ya pasaron, así que no se enviarán: «A», «B». Los demás siguen igual.')
  })
})

describe('countdown', () => {
  const start = new Date(2026, 9, 9, 10, 30)
  it('is neutral at any distance', () => {
    expect(countdown(start, new Date(2026, 9, 6, 15, 10))).toBe('en 3 días')
    expect(countdown(start, new Date(2026, 9, 8, 23, 0))).toBe('mañana')
    expect(countdown(start, new Date(2026, 9, 9, 8, 30))).toBe('hoy, en 2 horas')
    expect(countdown(start, new Date(2026, 9, 9, 9, 15))).toBe('hoy, en 1 hora')
    expect(countdown(start, new Date(2026, 9, 9, 10, 0))).toBe('hoy, en 30 minutos')
    expect(countdown(start, new Date(2026, 9, 9, 10, 31))).toBe('hoy')
    expect(countdown(start, new Date(2026, 9, 10, 9, 0))).toBe('ya pasó')
  })
})

describe('leadMinutesOf', () => {
  it('turns an amount and a unit into minutes, up to 30 days', () => {
    expect(leadMinutesOf('3', 'horas')).toBe(180)
    expect(leadMinutesOf('30', 'minutos')).toBe(30)
    expect(leadMinutesOf('2', 'dias')).toBe(2880)
    expect(leadMinutesOf('30', 'dias')).toBe(43200)
    expect(leadMinutesOf('31', 'dias')).toBeNull()
    expect(leadMinutesOf('0', 'horas')).toBeNull()
    expect(leadMinutesOf('', 'horas')).toBeNull()
    expect(leadMinutesOf('1.5', 'horas')).toBeNull()
  })
})
