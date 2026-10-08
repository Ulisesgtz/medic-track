import { describe, expect, it } from 'vitest'
import {
  activityPreview,
  activityRange,
  activityRule,
  dayCount,
  dayMonth,
  dayMonthYear,
  dayPct,
  daysText,
  detailRows,
  endedCardText,
  endedNote,
  everyText,
  instantDayMonth,
  joinTimes,
  lastMarked,
  lastMarkedDose,
  lastOfDay,
  nextUnmarked,
  noTodayText,
  pausedCardText,
  pausedNote,
  perDay,
  rangeText,
  supplementPeriodText,
  todayLabel,
} from './scheduleText'
import type { Routine, RoutineDose } from './types'

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: 'r1',
  childId: 'c1',
  kind: 'supplement',
  name: 'Vitamina D',
  note: '',
  period: 'daily',
  times: ['08:00'],
  weekdays: [],
  windowStart: null,
  windowEnd: null,
  intervalMinutes: null,
  firstDate: '2026-10-01',
  endDate: null,
  status: 'active',
  pausedAt: null,
  endedAt: null,
  createdBy: 'Ana',
  createdAt: new Date(2026, 9, 1, 9).toISOString(),
  myReminders: true,
  canEdit: true,
  progress: { taken: 12, elapsed: 13, total: 14 },
  doses: [],
  nextDose: null,
  ...over,
})

const activity = (over: Partial<Routine> = {}) =>
  routine({ kind: 'activity', period: 'window', times: [], windowStart: '08:00', windowEnd: '20:00', intervalMinutes: 60, ...over })

const dose = (hour: number, over: Partial<RoutineDose> = {}): RoutineDose => ({
  id: `d${hour}`,
  scheduledAt: new Date(2026, 9, 6, hour).toISOString(),
  taken: false,
  status: 'pending',
  takenBy: null,
  ...over,
})

describe('joinTimes', () => {
  it('says one, two and three times', () => {
    expect(joinTimes([])).toBe('')
    expect(joinTimes(['08:00'])).toBe('08:00')
    expect(joinTimes(['08:00', '20:00'])).toBe('08:00 y 20:00')
    expect(joinTimes(['06:00', '14:00', '22:00'])).toBe('06:00, 14:00 y 22:00')
  })
})

describe('dates', () => {
  it('writes the day and month without a leading zero, and with the year', () => {
    expect(dayMonth('2026-10-06')).toBe('6 oct')
    expect(dayMonthYear('2026-10-06')).toBe('6 oct 2026')
    expect(instantDayMonth(new Date(2026, 9, 2, 23, 30))).toBe('2 oct')
  })

  it('labels the day card', () => {
    expect(todayLabel(new Date(2026, 9, 8, 14, 30))).toBe('Hoy · jue 8 oct')
  })
})

describe('supplements', () => {
  it('say the days and how many doses, not the hours', () => {
    expect(supplementPeriodText(routine({ times: ['08:00', '14:00', '20:00', '21:00', '22:00', '23:00'] }))).toBe('Todos los días · 6 tomas')
    expect(supplementPeriodText(routine())).toBe('Todos los días · 1 toma')
    expect(supplementPeriodText(routine({ period: 'weekdays', weekdays: [4, 0, 2], times: ['09:00', '21:00'] }))).toBe('Lun, Mié, Vie · 2 tomas')
  })

  it('say days: every day with none or all seven', () => {
    expect(daysText([])).toBe('Todos los días')
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe('Todos los días')
    expect(daysText([6, 1])).toBe('Mar, Dom')
  })
})

describe('activities', () => {
  it('say «cada N» as the parent chose it', () => {
    expect(everyText(60)).toBe('Cada hora')
    expect(everyText(120)).toBe('Cada 2 horas')
    expect(everyText(30)).toBe('Cada 30 min')
    expect(everyText(90)).toBe('Cada 90 min')
  })

  it('write the rule and the range', () => {
    expect(activityRule(activity())).toBe('Cada hora, de 08:00 a 20:00')
    expect(activityRule(activity({ intervalMinutes: 30, windowStart: '09:00', windowEnd: '18:00' }))).toBe('Cada 30 min, de 09:00 a 18:00')
    expect(activityRange(activity())).toBe('Todos los días · desde el 1 oct')
    expect(activityRange(activity({ weekdays: [1, 3], firstDate: '2026-10-02', endDate: '2026-10-20' }))).toBe('Mar, Jue · del 2 al 20 oct')
    expect(activityRange(activity({ firstDate: '2026-09-28', endDate: '2026-10-03' }))).toBe('Todos los días · del 28 sep al 3 oct')
  })

  it('at fixed hours say the days and the hours, and the range apart', () => {
    const fixed = activity({ period: 'weekdays', times: ['17:00'], weekdays: [3, 1], windowStart: null, windowEnd: null, intervalMinutes: null })
    expect(activityRule(fixed)).toBe('Mar, Jue · a las 17:00')
    expect(activityRule({ ...fixed, period: 'daily', weekdays: [], times: ['08:00', '20:00'] })).toBe('Todos los días · a las 08:00 y 20:00')
    expect(activityRange(fixed)).toBe('Desde el 1 oct · sin fecha de fin')
    expect(activityRange({ ...fixed, firstDate: '2026-10-02', endDate: '2026-10-20' })).toBe('Del 2 al 20 oct')
    expect(detailRows(fixed).map((r) => r.k)).toEqual(['Días', 'Horas', 'Fechas', 'Agregada por'])
    expect(detailRows(fixed)[1].v).toBe('17:00')
  })

  it('count the doses of a day, the last one the last that fits', () => {
    expect(perDay('08:00', '20:00', 60)).toBe(13)
    expect(perDay('09:00', '18:00', 120)).toBe(5)
    expect(lastOfDay('09:00', '18:00', 120)).toBe('17:00')
    expect(lastOfDay('08:00', '20:00', 60)).toBe('20:00')
    expect(perDay('08:00', '08:00', 60)).toBe(1)
    expect(perDay('10:00', '08:00', 60)).toBe(0)
    expect(perDay('xx', '08:00', 60)).toBe(0)
    expect(perDay('08:00', '09:00', 0)).toBe(0)
  })

  it('preview the form’s arithmetic without listing the hours', () => {
    expect(activityPreview('08:00', '20:00', 60, [])).toBe('Con esto, cada día hay 13 avisos: el primero a las 08:00 y el último a las 20:00.')
    expect(activityPreview('09:00', '18:00', 180, [3, 1])).toBe('Con esto, cada martes y jueves hay 4 avisos: el primero a las 09:00 y el último a las 18:00.')
    expect(activityPreview('09:00', '18:00', 600, [0, 2, 4])).toBe('Con esto, cada lunes, miércoles y viernes hay 1 aviso: a las 09:00.')
    expect(activityPreview('09:00', '18:00', 60, [0, 1, 2, 3, 4, 5, 6])).toContain('cada día')
    expect(activityPreview('', '18:00', 60, [])).toBeNull()
    expect(activityPreview('10:00', '09:00', 60, [])).toBeNull()
  })
})

describe('rangeText', () => {
  it('says open, same-month and cross-month ranges', () => {
    expect(rangeText(routine())).toBe('Desde el 1 oct · sin fecha de fin')
    expect(rangeText(routine({ firstDate: '2026-10-02', endDate: '2026-10-20' }))).toBe('Del 2 al 20 oct')
    expect(rangeText(routine({ firstDate: '2026-09-28', endDate: '2026-10-03' }))).toBe('Del 28 sep al 3 oct')
  })
})

describe('the day', () => {
  const doses = [
    dose(8, { taken: true, takenBy: { name: 'Ana', at: new Date(2026, 9, 6, 8, 5).toISOString(), mine: true } }),
    dose(14, { taken: true, takenBy: { name: 'Rosa', at: new Date(2026, 9, 6, 14, 2).toISOString(), mine: false } }),
    dose(16, { status: 'due' }),
    dose(18),
  ]

  it('counts what was marked and gives the percent for the bar', () => {
    expect(dayCount(doses)).toEqual({ done: 2, total: 4 })
    expect(dayPct({ done: 2, total: 4 })).toBe(50)
    expect(dayPct({ done: 0, total: 0 })).toBe(0)
  })

  it('finds the next unmarked one still to come and the last marked one', () => {
    const now = new Date(2026, 9, 6, 15, 10)
    expect(nextUnmarked(doses, now)).toBe('16:00')
    expect(nextUnmarked([dose(8, { taken: true })], now)).toBeNull()
    expect(nextUnmarked([dose(8)], now)).toBeNull()
    expect(lastMarked(doses)).toEqual({ at: '14:02', by: 'Rosa' })
    expect(lastMarkedDose(doses)?.id).toBe('d14')
    expect(lastMarked([dose(8)])).toBeNull()
    expect(lastMarkedDose([dose(8)])).toBeNull()
  })
})

describe('noTodayText', () => {
  it('says tomorrow, or the day, with the hour', () => {
    expect(noTodayText(new Date(2026, 9, 7, 9).toISOString(), '2026-10-06')).toBe('Hoy no le toca. La siguiente es mañana, mié 7 oct, a las 09:00.')
    expect(noTodayText(new Date(2026, 9, 9, 9, 5).toISOString(), '2026-10-06')).toBe('Hoy no le toca. La siguiente es el vie 9 oct, a las 09:05.')
  })

  it('says «Hoy no toca» for the person’s own', () => {
    expect(noTodayText(new Date(2026, 9, 7, 9).toISOString(), '2026-10-06', true)).toBe('Hoy no toca. La siguiente es mañana, mié 7 oct, a las 09:00.')
  })
})

describe('status texts', () => {
  const at = new Date(2026, 9, 2, 10).toISOString()
  const supplement = routine()
  const act = activity()

  it('record a pause and an end without advice, each in its own gender', () => {
    expect(pausedCardText(supplement, at)).toBe('Pausado desde el 2 oct. Mientras esté pausado no genera tomas ni avisos.')
    expect(pausedNote(supplement, at)).toBe('Pausado desde el 2 oct. Mientras esté pausado no se crean tomas ni avisos. Lo marcado se conserva.')
    expect(endedCardText(supplement, at, 12, 14)).toBe('Terminado el 2 oct · 12 de 14 tomas')
    expect(endedNote(supplement, at, 12, 14)).toBe('Terminado el 2 oct · 12 de 14 tomas. Para volver a registrarlo, agrega un suplemento nuevo.')

    expect(pausedCardText(act, at)).toBe('Pausada desde el 2 oct. Mientras esté pausada no llegan avisos. Lo marcado se conserva.')
    expect(pausedNote(act, at)).toBe('Pausada desde el 2 oct. Mientras esté pausada no llegan avisos. Lo marcado se conserva.')
    expect(endedCardText(act, at, 12, 14)).toBe('Terminada el 2 oct')
    expect(endedNote(act, at, 12, 14)).toBe('Terminada el 2 oct. Para volver a registrarla, agrega una actividad nueva.')
  })
})

describe('detailRows', () => {
  it('lists a supplement’s hours, dates, note and who added it', () => {
    const rows = detailRows(routine({ note: 'Con jugo.', times: ['08:00', '20:00'], firstDate: '2026-10-02', endDate: '2026-10-20' }))
    expect(rows.map((r) => r.k)).toEqual(['Horas', 'Fechas', 'Nota', 'Agregado por'])
    expect(rows[0].v).toBe('08:00 y 20:00')
    expect(rows[1].v).toBe('Primera toma el 2 oct 2026 · última el 20 oct 2026')
    expect(rows[3].v).toBe('Ana, el 1 oct')
  })

  it('adds the days of one on some weekdays, and leaves the note out when empty', () => {
    const rows = detailRows(routine({ period: 'weekdays', weekdays: [0, 2] }))
    expect(rows.map((r) => r.k)).toEqual(['Días', 'Horas', 'Fechas', 'Agregado por'])
    expect(rows[1].v).toBe('08:00')
    expect(rows[2].v).toBe('Primera toma el 1 oct 2026 · sin fecha de fin')
  })

  it('lists an activity’s rule, days, reminders a day and dates', () => {
    const rows = detailRows(activity({ weekdays: [1, 3] }))
    expect(rows.map((r) => r.k)).toEqual(['Cada cuánto', 'Días', 'Avisos al día', 'Fechas', 'Agregada por'])
    expect(rows[0].v).toBe('Cada hora, de 08:00 a 20:00')
    expect(rows[1].v).toBe('Mar, Jue')
    expect(rows[2].v).toBe('13')
    expect(rows[3].v).toBe('Desde el 1 oct 2026 · sin fecha de fin')
    expect(detailRows(activity({ endDate: '2026-10-20' }))[3].v).toBe('Desde el 1 oct 2026 · hasta el 20 oct 2026')
  })

  it('does not say who added the person’s own', () => {
    expect(detailRows(activity(), true).map((r) => r.k)).not.toContain('Agregada por')
    expect(detailRows(routine(), true).map((r) => r.k)).not.toContain('Agregado por')
  })

  it('says the range of a finished one', () => {
    const sameMonth = detailRows(routine({ status: 'ended', firstDate: '2026-09-17', endDate: '2026-09-30', endedAt: new Date(2026, 8, 30).toISOString() }))
    expect(sameMonth[1].v).toBe('Del 17 al 30 sep 2026')
    const crossMonth = detailRows(routine({ status: 'ended', firstDate: '2026-09-17', endDate: '2026-10-03', endedAt: new Date(2026, 9, 3).toISOString() }))
    expect(crossMonth[1].v).toBe('Del 17 sep al 3 oct 2026')
    const noEndDate = detailRows(routine({ status: 'ended', firstDate: '2026-09-17', endDate: null, endedAt: new Date(2026, 9, 3, 12).toISOString() }))
    expect(noEndDate[1].v).toBe('Del 17 sep al 3 oct 2026')
  })
})
