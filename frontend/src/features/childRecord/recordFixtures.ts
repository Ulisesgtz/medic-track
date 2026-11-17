import type { ChildRecord } from './types'

/** A full record, as the API sends it (specs/073 contracts/api.md). */
export const fullRecord: ChildRecord = {
  exists: true,
  version: 3,
  canEdit: true,
  bloodType: 'O+',
  generalNote: 'Usa lentes desde los 4 años.',
  pediatrician: { name: 'Dra. Ruiz', phone: '+52 33 1234 5678', office: 'Torre Médica, piso 4' },
  allergies: [
    { name: 'Penicilina', kind: 'medication', note: 'le salen ronchas' },
    { name: 'Cacahuate', kind: 'food', note: null },
    { name: 'Polen', kind: null, note: null },
  ],
  conditions: [{ name: 'Asma', note: 'usa inhalador en crisis' }],
  updated: { at: '2026-11-17T18:05:00Z', by: 'Ana' },
}

export const emptyRecord: ChildRecord = {
  exists: false,
  version: 0,
  canEdit: true,
  bloodType: null,
  generalNote: null,
  pediatrician: null,
  allergies: [],
  conditions: [],
  updated: null,
}
