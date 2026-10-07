import { describe, expect, it } from 'vitest'
import {
  cardProgress,
  dayMonth,
  dayMonthYear,
  detailRows,
  endedCardText,
  endedNote,
  instantDayMonth,
  intervalDayTimes,
  intervalPreview,
  joinTimes,
  noTodayText,
  pausedCardText,
  pausedNote,
  periodText,
  progressSummary,
  rangeText,
} from './scheduleText'
import type { Routine } from './types'

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: 'r1',
  childId: 'c1',
  name: 'Vitamina D',
  note: '',
  period: 'daily',
  times: ['08:00'],
  weekdays: [],
  intervalHours: null,
  firstDate: '2026-10-01',
  firstTime: null,
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
})

describe('intervalDayTimes and intervalPreview', () => {
  it('lists the hours of a day when the interval divides 24', () => {
    expect(intervalDayTimes('06:00', 8)).toEqual(['06:00', '14:00', '22:00'])
    expect(intervalDayTimes('13:30', 12)).toEqual(['01:30', '13:30'])
    expect(intervalDayTimes('00:00', 24)).toEqual(['00:00'])
  })

  it('has no fixed list when the hours slide from one day to the next', () => {
    expect(intervalDayTimes('06:00', 5)).toBeNull()
    expect(intervalDayTimes('06:00', 0)).toBeNull()
    expect(intervalDayTimes('06:00', 25)).toBeNull()
    expect(intervalDayTimes('xx:yy', 8)).toBeNull()
  })

  it('previews only arithmetic of what was typed', () => {
    expect(intervalPreview('06:00', 8)).toBe('Con esto, cada día las tomas quedan a las 06:00, 14:00 y 22:00.')
    expect(intervalPreview('06:00', 5)).toBe('Con esto, las tomas siguen cada 5 horas desde la primera y la hora cambia de un día al otro.')
    expect(intervalPreview('', 8)).toBeNull()
    expect(intervalPreview('06:00', 30)).toBeNull()
    expect(intervalPreview('06:00', 2.5)).toBeNull()
  })
})

describe('periodText', () => {
  it('says each periodicity as the mocks do', () => {
    expect(periodText(routine())).toBe('Todos los días · 08:00')
    expect(periodText(routine({ times: ['08:00', '20:00'] }))).toBe('Todos los días · 08:00 y 20:00')
    expect(periodText(routine({ period: 'weekdays', weekdays: [4, 0, 2], times: ['09:00'] }))).toBe('Lun, Mié, Vie · 09:00')
    expect(periodText(routine({ period: 'interval', times: [], intervalHours: 8, firstTime: '06:00' }))).toBe('Cada 8 horas · 06:00, 14:00 y 22:00')
    expect(periodText(routine({ period: 'interval', times: [], intervalHours: 5, firstTime: '06:00' }))).toBe('Cada 5 horas · desde las 06:00')
    expect(periodText(routine({ period: 'interval', times: [], intervalHours: 1, firstTime: '06:00' })).startsWith('Cada hora · ')).toBe(true)
  })
})

describe('rangeText', () => {
  it('says open, same-month and cross-month ranges', () => {
    expect(rangeText(routine())).toBe('Desde el 1 oct · sin fecha de fin')
    expect(rangeText(routine({ firstDate: '2026-10-02', endDate: '2026-10-20' }))).toBe('Del 2 al 20 oct')
    expect(rangeText(routine({ firstDate: '2026-09-28', endDate: '2026-10-03' }))).toBe('Del 28 sep al 3 oct')
  })
})

describe('progress', () => {
  it('counts the days of a routine with an end date', () => {
    const r = routine({ firstDate: '2026-10-02', endDate: '2026-10-20', progress: { taken: 12, elapsed: 13, total: 19 } })
    expect(progressSummary(r, '2026-10-06')).toEqual({
      big: 'Día 5 de 19',
      sub: '12 de 13 tomas marcadas hasta ahora · termina el 20 oct',
      pct: 26,
    })
    expect(progressSummary(r, '2026-09-01').big).toBe('Día 1 de 19')
    expect(progressSummary(r, '2026-12-01').big).toBe('Día 19 de 19')
  })

  it('counts the doses of one without an end, and of a finished one', () => {
    expect(progressSummary(routine({ progress: { taken: 24, elapsed: 26, total: 26 } }), '2026-10-06')).toEqual({
      big: '24 tomas',
      sub: 'marcadas de 26 hasta ahora',
      pct: null,
    })
    expect(progressSummary(routine({ progress: { taken: 1, elapsed: 1, total: 1 } }), '2026-10-06').big).toBe('1 toma')
    expect(progressSummary(routine({ status: 'ended' }), '2026-10-06')).toEqual({ big: '12 de 14', sub: 'tomas marcadas', pct: null })
  })

  it('has a card line only when a dose has come, and never for a finished routine', () => {
    expect(cardProgress(routine({ progress: { taken: 0, elapsed: 0, total: 0 } }), '2026-10-06')).toBeNull()
    expect(cardProgress(routine({ status: 'ended' }), '2026-10-06')).toBeNull()
    expect(cardProgress(routine({ progress: { taken: 24, elapsed: 26, total: 26 } }), '2026-10-06')).toEqual({ text: '24 tomas marcadas de 26', pct: null })
    expect(cardProgress(routine({ progress: { taken: 1, elapsed: 3, total: 3 } }), '2026-10-06')?.text).toBe('1 toma marcada de 3')
    const withEnd = routine({ firstDate: '2026-10-02', endDate: '2026-10-20' })
    expect(cardProgress(withEnd, '2026-10-06')).toEqual({ text: 'Día 5 de 19', pct: 26 })
  })
})

describe('noTodayText', () => {
  it('says tomorrow, or the day, with the hour', () => {
    expect(noTodayText(new Date(2026, 9, 7, 9).toISOString(), '2026-10-06')).toBe('Hoy no le toca. La siguiente es mañana, mié 7 oct, a las 09:00.')
    expect(noTodayText(new Date(2026, 9, 9, 9, 5).toISOString(), '2026-10-06')).toBe('Hoy no le toca. La siguiente es el vie 9 oct, a las 09:05.')
  })
})

describe('status texts', () => {
  it('records a pause and an end without advice', () => {
    const at = new Date(2026, 9, 2, 10).toISOString()
    expect(pausedCardText(at)).toBe('Pausada desde el 2 oct. Mientras esté pausada no genera tomas ni avisos.')
    expect(pausedNote(at)).toBe('Pausada desde el 2 oct. Mientras esté pausada no se crean tomas ni avisos. Lo marcado se conserva.')
    expect(endedCardText(at, 12, 14)).toBe('Terminada el 2 oct · 12 de 14 tomas')
    expect(endedNote(at, 12, 14)).toBe('Terminada el 2 oct · 12 de 14 tomas. Para volver a registrarla, crea una rutina nueva.')
  })
})

describe('detailRows', () => {
  it('lists how often, the dates, the note and who created it', () => {
    const rows = detailRows(routine({ note: 'Con jugo.', period: 'interval', times: [], intervalHours: 8, firstTime: '06:00', firstDate: '2026-10-02', endDate: '2026-10-20' }))
    expect(rows.map((r) => r.k)).toEqual(['Cada cuánto', 'Fechas', 'Nota', 'Creada por'])
    expect(rows[1].v).toBe('Primera toma el 2 oct 2026, 06:00 · última el 20 oct 2026')
    expect(rows[3].v).toBe('Ana, el 1 oct')
  })

  it('leaves the note out when empty and says there is no end', () => {
    const rows = detailRows(routine())
    expect(rows.map((r) => r.k)).toEqual(['Cada cuánto', 'Fechas', 'Creada por'])
    expect(rows[1].v).toBe('Primera toma el 1 oct 2026 · sin fecha de fin')
  })

  it('says the range of a finished routine', () => {
    const sameMonth = detailRows(routine({ status: 'ended', firstDate: '2026-09-17', endDate: '2026-09-30', endedAt: new Date(2026, 8, 30).toISOString() }))
    expect(sameMonth[1].v).toBe('Del 17 al 30 sep 2026')
    const crossMonth = detailRows(routine({ status: 'ended', firstDate: '2026-09-17', endDate: '2026-10-03', endedAt: new Date(2026, 9, 3).toISOString() }))
    expect(crossMonth[1].v).toBe('Del 17 sep al 3 oct 2026')
    const noEndDate = detailRows(routine({ status: 'ended', firstDate: '2026-09-17', endDate: null, endedAt: new Date(2026, 9, 3, 12).toISOString() }))
    expect(noEndDate[1].v).toBe('Del 17 sep al 3 oct 2026')
  })
})
