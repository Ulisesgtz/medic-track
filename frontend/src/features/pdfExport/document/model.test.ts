import { describe, expect, it } from 'vitest'
import type { ExportMedication } from '../types'
import { CASE_A, CASE_B, CASE_C, NOW, at, sequence } from './fixtures'
import {
  activeTreatmentLines,
  ageText,
  appointmentWhen,
  coverCount,
  coverRows,
  day,
  doseMarks,
  doseRecord,
  doseSpan,
  fileName,
  filtersText,
  fullName,
  indication,
  localDay,
  periodText,
  sectionsText,
  statusLabels,
  vaccineGroups,
  vaccineRow,
} from './model'

const [amoxA, paraA] = CASE_A.data.consultations[0].medications
const paraExtended = CASE_A.data.consultations[1].medications[0]
const amoxDone = CASE_A.data.consultations[3].medications[0]
const paraC = CASE_C.data.consultations[0].medications[0]
const recordOnlyMed = CASE_C.data.consultations[1].medications[0]

describe('dates and names', () => {
  it('writes days as the mock does, without a leading zero', () => {
    expect(day('2019-01-05')).toBe('5 ene 2019')
    expect(day('2026-10-24')).toBe('24 oct 2026')
    expect(day('no es fecha')).toBe('no es fecha')
    expect(day('2026-13-01')).toBe('2026-13-01')
    expect(localDay(at(2026, 10, 18, 8))).toBe('18 oct 2026')
  })

  it('names the file after the child and the local day, with nothing a file system minds', () => {
    expect(fileName(CASE_A.data.child, NOW)).toBe('Mateo-Morales-historial-24-oct-2026.pdf')
    expect(fileName({ firstName: 'Sofía', lastName: 'Núñez de la O' }, NOW)).toBe('Sofia-Nunez-de-la-O-historial-24-oct-2026.pdf')
    expect(fileName({ firstName: '', lastName: '' }, NOW)).toBe('Hijo-historial-24-oct-2026.pdf')
    expect(fullName(CASE_B.data.child)).toBe('Sofía Morales')
  })

  it('says the age in years and months, as the cover of each case', () => {
    expect(ageText('2021-03-14', NOW)).toBe('5 años 7 meses')
    expect(ageText('2025-08-02', NOW)).toBe('1 año 2 meses')
    expect(ageText('2019-01-05', NOW)).toBe('7 años 9 meses')
    expect(ageText('2026-03-30', NOW)).toBe('6 meses')
    expect(ageText('2026-10-01', NOW)).toBe('0 meses')
    expect(ageText('2025-10-24', NOW)).toBe('1 año')
    expect(ageText('2026-09-24', NOW)).toBe('1 mes')
  })
})

describe('the cover', () => {
  it('says the period, the filters and the sections of each case', () => {
    expect(periodText(CASE_A.request.period)).toBe('Del 1 ene 2026 al 24 oct 2026')
    expect(periodText(CASE_B.request.period)).toBe('Todo el historial')
    expect(periodText(CASE_C.request.period)).toBe('Filtros actuales del historial')
    expect(filtersText(CASE_A.request.period)).toBe('Sin filtros')
    expect(filtersText(CASE_C.request.period)).toBe('Fechas: del 1 jul 2026 al 24 oct 2026 · Medicamento: Paracetamol')
    expect(sectionsText(CASE_A.request.sections)).toBe('Consultas · Cartilla de vacunación · Fotos (anexo)')
    expect(sectionsText(CASE_B.request.sections)).toBe('Consultas · Cartilla de vacunación')
  })

  it('writes every criterion of the history, with the symptoms by name', () => {
    const period = {
      kind: 'filters' as const,
      filters: { q: ' tos ', doctor: 'Dra. López', symptomCodes: ['fever', 'rash'], kind: 'record' as const },
    }
    expect(filtersText(period, { fever: 'Fiebre' })).toBe('Texto: «tos» · Doctor: Dra. López · Síntomas: Fiebre, rash · Tipo: Solo registro')
    expect(filtersText({ kind: 'filters', filters: { from: '2026-07-01' } })).toBe('Fechas: desde el 1 jul 2026')
    expect(filtersText({ kind: 'filters', filters: { to: '2026-07-01', kind: 'treatment' } })).toBe(
      'Fechas: hasta el 1 jul 2026 · Tipo: Con tratamiento',
    )
    expect(filtersText({ kind: 'filters', filters: { kind: 'all' } })).toBe('Sin filtros')
  })

  it('lists what the PDF includes as each case of the mock', () => {
    expect(coverRows(CASE_A.request, CASE_A.data).map((r) => `${r.label}: ${r.value}`)).toEqual([
      'Periodo: Del 1 ene 2026 al 24 oct 2026',
      'Filtros: Sin filtros',
      'Secciones: Consultas · Cartilla de vacunación · Fotos (anexo)',
      'Cartilla: Todas las vacunas registradas, sin filtro de periodo',
    ])
    expect(coverRows(CASE_B.request, CASE_B.data).map((r) => r.label)).toEqual(['Periodo', 'Filtros', 'Secciones', 'Fotos'])
    expect(coverRows(CASE_C.request, CASE_C.data).at(-1)).toEqual({ label: 'Fotos', value: 'No incluidas' })
    expect(coverRows(CASE_A.request, CASE_A.data)[0].strong).toBe(true)
  })

  it('counts without judging', () => {
    expect(coverCount(CASE_A.request, CASE_A.data)).toBe('4 consultas · 10 vacunas registradas · 2 fotos de la cartilla · 1 foto de receta')
    expect(coverCount(CASE_B.request, CASE_B.data)).toBe('0 consultas · 9 vacunas registradas')
    expect(coverCount(CASE_C.request, CASE_C.data)).toBe('2 consultas · 0 vacunas registradas')
    const onlyCard = { ...CASE_B.request, sections: { consultations: false, vaccinations: true, photos: true } }
    expect(coverCount(onlyCard, { ...CASE_B.data, photos: { consultations: [], card: [] } })).toBe('9 vacunas registradas')
  })

  it('says the running treatment and the next appointment', () => {
    expect(activeTreatmentLines(CASE_A.data.activeTreatment!)).toEqual({
      schedule: 'Cada 8 h · desde el 18 oct 2026',
      doctor: 'Indicado por Dra. Laura Cázares',
    })
    expect(activeTreatmentLines({ ...CASE_A.data.activeTreatment!, doctorName: ' ' }).doctor).toBeNull()
    expect(appointmentWhen(CASE_A.data.nextAppointment!, ' · ')).toBe('28 oct 2026 · 10:30')
    expect(appointmentWhen(CASE_A.data.nextAppointment!, ', ')).toBe('28 oct 2026, 10:30')
  })
})

describe('a medication', () => {
  it('says what was indicated', () => {
    expect(indication(amoxA, '2026-10-18')).toBe('cada 8 h · 7 días · primera toma 08:00 del 18 oct')
    expect(indication(paraExtended, '2026-09-12')).toBe('cada 6 h · 3 días · primera toma 07:00 del 12 sep')
    expect(indication({ ...amoxA, firstDoseAt: null }, '2026-10-18')).toBe('cada 8 h · 7 días · primera toma 08:00 del 18 oct')
    expect(indication(recordOnlyMed, '2026-08-14')).toBe('cada 24 h · 1 día')
  })

  it('labels its state: running, ended, extended', () => {
    expect(statusLabels(amoxA)).toEqual([{ text: 'En curso', strong: true }])
    expect(statusLabels(paraA)).toEqual([{ text: 'Terminado el 20 oct', strong: false }])
    expect(statusLabels(paraExtended)).toEqual([{ text: 'Se recorrió el 15 sep · +2 tomas', strong: false }])
    expect(statusLabels(amoxDone)).toEqual([])
    const due: ExportMedication = { ...amoxDone, doses: { ...amoxDone.doses, due: 1 } }
    expect(statusLabels(due)).toEqual([{ text: 'En curso', strong: true }])
    const oneMore: ExportMedication = { ...amoxDone, extensions: [{ createdAt: at(2026, 2, 27, 9), addedDoses: 1 }] }
    expect(statusLabels(oneMore)[0].text).toBe('Se recorrió el 27 feb · +1 toma')
  })

  it('records its doses only as counts, as the mock', () => {
    expect(doseRecord(amoxA)).toEqual({
      lead: '16 de 18 tomas marcadas',
      rest: ['2 sin registrar', '3 por venir', 'Última marca: 24 oct, 08:05, por Ana'],
    })
    expect(doseRecord(paraA)).toEqual({ lead: '7 de 8 tomas marcadas', rest: ['1 sin registrar', 'Última marca: 20 oct, 14:10, por Ana'] })
    expect(doseRecord(paraExtended).rest.at(-1)).toBe('Última marca: 16 sep, 01:05, por Luis')
    expect(doseRecord(amoxDone)).toEqual({
      lead: '21 de 21 tomas marcadas',
      rest: ['Del 20 al 26 feb', 'Última marca: 26 feb, 22:00, por Ana'],
    })
    expect(doseRecord(paraC).lead).toBe('5 de 6 tomas marcadas')
    expect(doseRecord(recordOnlyMed)).toEqual({ lead: null, rest: ['sin registro de tomas en la app'] })
  })

  it('counts a dose waiting to be marked apart, and has no lead while nothing has come', () => {
    const waiting: ExportMedication = { ...amoxA, doses: { taken: 1, unregistered: 0, due: 1, pending: 0, total: 2, sequence: 'td' } }
    expect(doseRecord(waiting)).toEqual({ lead: '1 de 2 tomas marcadas', rest: ['1 por marcar', 'Última marca: 24 oct, 08:05, por Ana'] })
    const ahead: ExportMedication = { ...amoxA, lastMark: null, doses: { taken: 0, unregistered: 0, due: 0, pending: 3, total: 3, sequence: 'ppp' } }
    expect(doseRecord(ahead)).toEqual({ lead: null, rest: ['3 por venir'] })
    const one: ExportMedication = { ...amoxA, lastMark: null, doses: { taken: 1, unregistered: 0, due: 0, pending: 1, total: 2, sequence: 'tp' } }
    expect(doseRecord(one).lead).toBe('1 de 1 toma marcada')
  })

  it('spans its days within a month, across months and across years', () => {
    expect(doseSpan(at(2026, 2, 20, 8), at(2026, 2, 26, 16))).toBe('Del 20 al 26 feb')
    expect(doseSpan(at(2026, 2, 28, 8), at(2026, 3, 6, 8))).toBe('Del 28 feb al 6 mar')
    expect(doseSpan(at(2025, 12, 30, 8), at(2026, 1, 2, 8))).toBe('Del 30 dic 2025 al 2 ene 2026')
  })

  it('draws one mark per dose in the order they happened', () => {
    expect(doseMarks(amoxA).join('')).toBe(sequence(21, [5, 11], 3))
    expect(doseMarks({ ...amoxA, doses: { ...amoxA.doses, sequence: 'tx?ud' } })).toEqual(['t', 'u', 'd'])
  })
})

describe('the vaccination card', () => {
  it('groups by vaccine, oldest first, as the mock lists them', () => {
    const groups = vaccineGroups(CASE_A.data.vaccinations)
    expect(groups.map((g) => g.name)).toEqual([
      'BCG',
      'Hepatitis B',
      'Hexavalente',
      'Neumococo',
      'Triple viral (SRP)',
      'Influenza estacional 2025',
    ])
    expect(groups[1].doses.map((d) => d.doseNumber)).toEqual([1, 2, 3])
    expect(groups.at(-1)?.custom).toBe(true)
    expect(vaccineGroups(CASE_C.data.vaccinations)).toEqual([])
  })

  it('keeps a family-written name apart from the catalog one, and joins the same words without accents', () => {
    const base = CASE_A.data.vaccinations[3]
    const groups = vaccineGroups([
      { ...base, id: 'a', name: 'Neumocócica', custom: true, appliedOn: '2021-01-01', doseNumber: null },
      { ...base, id: 'b', name: 'neumococica', custom: true, appliedOn: '2021-01-01', doseNumber: 2 },
      { ...base, id: 'c', name: 'Neumocócica', custom: false, appliedOn: '2021-01-01' },
    ])
    expect(groups).toHaveLength(2)
    expect(groups.find((g) => g.custom)?.doses.map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('writes each row with a dash for what wasn’t recorded, and who corrected it', () => {
    const groups = vaccineGroups(CASE_A.data.vaccinations)
    expect(vaccineRow(groups[0].doses[0])).toEqual({
      dose: '—',
      date: '14 mar 2021',
      lot: 'BCG-2103',
      place: 'Hospital Ángeles Lindavista',
      note: '—',
      corrected: null,
    })
    expect(vaccineRow(groups[2].doses[1])).toMatchObject({ dose: '2.ª dosis', note: 'Lote copiado de la cartilla', corrected: 'Corregida el 3 oct por Ana' })
    const anonymous = { ...groups[2].doses[1], lot: ' ', place: null, corrected: { at: at(2026, 10, 3, 18), by: null } }
    expect(vaccineRow(anonymous)).toMatchObject({ lot: '—', place: '—', corrected: 'Corregida el 3 oct' })
  })
})
