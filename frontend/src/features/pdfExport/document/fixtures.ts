import type { ExportData, ExportMedication, ExportRequest, ExportVaccination } from '../types'

// specs/050: the three cases of the mock (referencia/Exportar PDF - Documento.dc.html) as export data, for the document's tests.
// Instants are built in the machine's local time, so what the document prints doesn't depend on the time zone the tests run in.

/** A local instant as the API sends it (UTC ISO). Months are 1–12. */
export const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString()

/** The day the mock's PDFs were made: 24 oct 2026, local noon. */
export const NOW = new Date(2026, 9, 24, 12, 0)

/** The mock's grid of marks: `n` doses, the ones in `unregistered` dashed, the last `ahead` still to come. */
export function sequence(n: number, unregistered: number[], ahead = 0): string {
  return Array.from({ length: n }, (_, i) => (i >= n - ahead ? 'p' : unregistered.includes(i) ? 'u' : 't')).join('')
}

type MedicationSeed = Partial<Omit<ExportMedication, 'doses'>> &
  Pick<ExportMedication, 'name' | 'frequencyHours' | 'durationDays'> & { sequence?: string }

/** A medication whose counts are those of its sequence, as the server answers. */
function medication({ sequence: seq = '', ...m }: MedicationSeed): ExportMedication {
  const count = (c: string) => [...seq].filter((x) => x === c).length
  return {
    startTime: null,
    endedAt: null,
    extensions: [],
    firstDoseAt: null,
    lastDoseAt: null,
    lastMark: null,
    ...m,
    doses: {
      taken: count('t'),
      unregistered: count('u'),
      due: count('d'),
      pending: count('p'),
      total: seq.length,
      sequence: seq,
    },
  }
}

const laura = 'Dra. Laura Cázares'
const ruiz = 'Dr. Ernesto Ruiz'
const cs = 'Centro de Salud T-III Coyoacán'
const hospital = 'Hospital Ángeles Lindavista'

let nextId = 1
function vaccine(name: string, doseNumber: number | null, appliedOn: string, lot: string, place: string, notes: string | null = null, extra: Partial<ExportVaccination> = {}): ExportVaccination {
  return { id: `v${nextId++}`, name, custom: false, doseNumber, appliedOn, lot, place, notes, corrected: null, ...extra }
}

/** Caso A · Mateo, many consultations, a range, every section and the photos. */
export const CASE_A: { request: ExportRequest; data: ExportData } = {
  request: {
    period: { kind: 'range', from: '2026-01-01', to: '2026-10-24' },
    sections: { consultations: true, vaccinations: true, photos: true },
  },
  data: {
    child: { firstName: 'Mateo', lastName: 'Morales', birthDate: '2021-03-14', height: 112, weight: 19.4 },
    activeTreatment: { medicationName: 'Amoxicilina', frequencyHours: 8, since: at(2026, 10, 18, 8), doctorName: laura },
    nextAppointment: { scheduledAt: at(2026, 10, 28, 10, 30), doctorName: laura, location: 'Consultorio 204, Torre Médica Satélite' },
    consultations: [
      {
        id: 'c1',
        consultDate: '2026-10-18',
        doctorName: laura,
        recordOnly: false,
        notes:
          'Desde el miércoles 15 tiene fiebre por las noches; la más alta fue 38.6 °C el jueves. Tos seca que aumenta al acostarse. Come menos que de costumbre, pero toma bien líquidos. En su salón hay varios niños con gripa.',
        symptoms: [
          { code: 'fever', name: 'Fiebre' },
          { code: 'cough', name: 'Tos' },
        ],
        hasPhoto: true,
        medications: [
          medication({
            name: 'Amoxicilina', frequencyHours: 8, durationDays: 7, startTime: '08:00',
            firstDoseAt: at(2026, 10, 18, 8), lastDoseAt: at(2026, 10, 25, 0),
            lastMark: { at: at(2026, 10, 24, 8, 5), by: 'Ana' },
            sequence: sequence(21, [5, 11], 3),
          }),
          medication({
            name: 'Paracetamol', frequencyHours: 6, durationDays: 3, startTime: '08:00', endedAt: at(2026, 10, 20, 15),
            firstDoseAt: at(2026, 10, 18, 8), lastDoseAt: at(2026, 10, 19, 2),
            lastMark: { at: at(2026, 10, 20, 14, 10), by: 'Ana' },
            sequence: sequence(8, [6]),
          }),
        ],
        appointment: { scheduledAt: at(2026, 10, 28, 10, 30), doctorName: laura, location: 'Consultorio 204, Torre Médica Satélite' },
      },
      {
        id: 'c2',
        consultDate: '2026-09-12',
        doctorName: laura,
        recordOnly: false,
        notes: 'Vomitó tres veces el jueves en la noche y una vez el viernes en la mañana. Fiebre de 38.1 °C el viernes a mediodía.',
        symptoms: [
          { code: 'vomiting', name: 'Vómito' },
          { code: 'fever', name: 'Fiebre' },
        ],
        hasPhoto: false,
        medications: [
          medication({
            name: 'Paracetamol', frequencyHours: 6, durationDays: 3, startTime: '07:00',
            extensions: [{ createdAt: at(2026, 9, 15, 19), addedDoses: 2 }],
            firstDoseAt: at(2026, 9, 12, 7), lastDoseAt: at(2026, 9, 15, 13),
            lastMark: { at: at(2026, 9, 16, 1, 5), by: 'Luis' },
            sequence: sequence(14, [3, 9]),
          }),
        ],
        appointment: null,
      },
      {
        id: 'c3',
        consultDate: '2026-06-02',
        doctorName: ruiz,
        recordOnly: true,
        notes: 'Revisión anual. Talla 112 cm y peso 19.4 kg, anotados en la consulta.',
        symptoms: [],
        hasPhoto: false,
        medications: [],
        appointment: null,
      },
      {
        id: 'c4',
        consultDate: '2026-02-20',
        doctorName: laura,
        recordOnly: false,
        notes: 'Tos con flemas desde hace una semana. Fiebre de 37.9 °C el domingo y el lunes. Duerme poco por la tos.',
        symptoms: [
          { code: 'cough', name: 'Tos' },
          { code: 'fever', name: 'Fiebre' },
        ],
        hasPhoto: false,
        medications: [
          medication({
            name: 'Amoxicilina', frequencyHours: 8, durationDays: 7, startTime: '08:00',
            firstDoseAt: at(2026, 2, 20, 8), lastDoseAt: at(2026, 2, 26, 16),
            lastMark: { at: at(2026, 2, 26, 22), by: 'Ana' },
            sequence: sequence(21, []),
          }),
        ],
        appointment: null,
      },
    ],
    vaccinations: [
      vaccine('Influenza estacional 2025', 1, '2025-11-10', 'FLU-25B', 'Farmacia San Pablo Satélite', 'Campaña de invierno', { custom: true }),
      vaccine('Triple viral (SRP)', 1, '2022-03-16', 'SRP-7781', 'Consultorio Dra. Laura Cázares', 'Fiebre leve al día siguiente'),
      vaccine('Neumococo', 2, '2021-09-16', 'NM-1203', cs),
      vaccine('Neumococo', 1, '2021-07-17', 'NM-1187', cs),
      vaccine('Hexavalente', 2, '2021-07-17', 'HX-4492', cs, 'Lote copiado de la cartilla', { corrected: { at: at(2026, 10, 3, 18), by: 'Ana' } }),
      vaccine('Hexavalente', 1, '2021-05-15', 'HX-4410', cs),
      vaccine('Hepatitis B', 3, '2021-09-16', 'HB-0921', cs),
      vaccine('Hepatitis B', 2, '2021-05-15', 'HB-0521', cs),
      vaccine('Hepatitis B', 1, '2021-03-14', 'HB-0321', hospital),
      vaccine('BCG', null, '2021-03-14', 'BCG-2103', hospital),
    ],
    photos: {
      consultations: [{ consultationId: 'c1', consultDate: '2026-10-18', doctorName: laura }],
      card: [
        { id: 'p1', createdAt: at(2026, 10, 3, 18) },
        { id: 'p2', createdAt: at(2026, 10, 3, 18, 2) },
      ],
    },
  },
}

/** Caso B · Sofía, no consultations and a whole card, everything, without photos. */
export const CASE_B: { request: ExportRequest; data: ExportData } = {
  request: { period: { kind: 'all' }, sections: { consultations: true, vaccinations: true, photos: false } },
  data: {
    child: { firstName: 'Sofía', lastName: 'Morales', birthDate: '2025-08-02', height: null, weight: null },
    activeTreatment: null,
    nextAppointment: null,
    consultations: [],
    vaccinations: [
      vaccine('BCG', null, '2025-08-02', 'BCG-2508', hospital),
      vaccine('Hepatitis B', 1, '2025-08-02', 'HB-0825', hospital),
      vaccine('Hepatitis B', 2, '2025-10-03', 'HB-1025', cs),
      vaccine('Hexavalente', 1, '2025-10-03', 'HX-5120', cs),
      vaccine('Hexavalente', 2, '2025-12-05', 'HX-5188', cs),
      vaccine('Hexavalente', 3, '2026-02-06', 'HX-5231', cs, 'Lloró poco, durmió bien'),
      vaccine('Neumococo', 1, '2025-10-03', 'NM-2290', cs),
      vaccine('Neumococo', 2, '2025-12-05', 'NM-2341', cs),
      vaccine('Influenza', 1, '2026-02-06', 'FLU-25C', cs),
    ],
    photos: null,
  },
}

/** Caso C · Diego, only consultations through the history's filters, without vaccines. */
export const CASE_C: { request: ExportRequest; data: ExportData } = {
  request: {
    period: { kind: 'filters', filters: { from: '2026-07-01', to: '2026-10-24', medication: 'Paracetamol' } },
    sections: { consultations: true, vaccinations: true, photos: false },
  },
  data: {
    child: { firstName: 'Diego', lastName: 'Morales', birthDate: '2019-01-05', height: 126, weight: 25.8 },
    activeTreatment: null,
    nextAppointment: null,
    consultations: [
      {
        id: 'd1',
        consultDate: '2026-10-03',
        doctorName: laura,
        recordOnly: false,
        notes: 'Tos desde el lunes, más fuerte en la mañana. Fiebre de 38.0 °C el miércoles en la noche. Se queja de dolor de garganta al tragar.',
        symptoms: [
          { code: 'cough', name: 'Tos' },
          { code: 'fever', name: 'Fiebre' },
        ],
        hasPhoto: false,
        medications: [
          medication({
            name: 'Paracetamol', frequencyHours: 6, durationDays: 3, startTime: '20:00', endedAt: at(2026, 10, 4, 21),
            firstDoseAt: at(2026, 10, 3, 20), lastDoseAt: at(2026, 10, 5, 2),
            lastMark: { at: at(2026, 10, 4, 20, 5), by: 'Ana' },
            sequence: sequence(6, [2]),
          }),
        ],
        appointment: null,
      },
      {
        id: 'd2',
        consultDate: '2026-08-14',
        doctorName: ruiz,
        recordOnly: true,
        notes: 'Revisión antes de entrar a la escuela. Talla 126 cm y peso 25.8 kg. Fiebre leve el día anterior, se le dio Paracetamol en casa.',
        symptoms: [{ code: 'fever', name: 'Fiebre' }],
        hasPhoto: false,
        medications: [medication({ name: 'Paracetamol', frequencyHours: 24, durationDays: 1 })],
        appointment: null,
      },
    ],
    vaccinations: [],
    photos: null,
  },
}
