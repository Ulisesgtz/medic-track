import type { UpdateConsultationPayload } from './api'
import type { ConsultationFormValues } from './ConsultationForm'
import { parsePositiveInt } from './parsePositiveInt'
import type { ConsultationDetail } from './types'

// The pure part of editing a consultation (specs/051): the saved consultation as the form's values, whether an edit changes a
// schedule (so the app asks first) and the request body.

/** What the form needs to know of each saved medication, by its id. */
export interface MedicationFlags {
  /** The treatment was ended (specs/016): its schedule can't change. */
  ended: boolean
  /** At least one of its doses is marked: it can't be removed. */
  hasMarks: boolean
}

/** The version an edit sends back: the last edit, or the creation. */
export function versionOf(detail: ConsultationDetail): string {
  return detail.edited?.at ?? detail.createdAt ?? ''
}

export function valuesOfDetail(detail: ConsultationDetail): ConsultationFormValues {
  return {
    doctorName: detail.doctorName,
    consultDate: detail.consultDate,
    notes: detail.notes,
    symptomCodes: detail.symptoms.map((s) => s.code),
    recordOnly: detail.recordOnly === true,
    medications: detail.medications.map((m) => ({
      medicationId: m.id,
      name: m.name,
      frequencyHours: String(m.frequencyHours),
      durationDays: String(m.durationDays),
      startTime: m.startTime ?? '',
    })),
  }
}

export function flagsOf(detail: ConsultationDetail): Record<string, MedicationFlags> {
  const flags: Record<string, MedicationFlags> = {}
  for (const m of detail.medications) {
    flags[m.id] = { ended: m.endedAt !== null, hasMarks: m.doses.some((d) => d.taken) }
  }
  return flags
}

/**
 * Whether the edit moves doses of a saved medication: its frequency, duration or first dose changed, or the consultation's
 * date did (the first dose is read on that day). A new medication doesn't count (nothing it had changes), nor an ended one
 * (its doses stay); a record-only consultation has no doses.
 */
export function hasScheduleChange(
  initial: ConsultationFormValues,
  current: ConsultationFormValues,
  flags: Record<string, MedicationFlags> = {},
): boolean {
  if (initial.recordOnly) return false
  const saved = new Map(initial.medications.map((m) => [m.medicationId, m]))
  // An ended treatment keeps its doses whatever changes (specs/016): it moves nothing.
  const kept = current.medications.filter(
    (m) => m.medicationId !== undefined && saved.has(m.medicationId) && flags[m.medicationId]?.ended !== true,
  )
  if (kept.length > 0 && initial.consultDate !== current.consultDate) return true
  return kept.some((m) => {
    const before = saved.get(m.medicationId)!
    return (
      parsePositiveInt(m.frequencyHours) !== parsePositiveInt(before.frequencyHours) ||
      parsePositiveInt(m.durationDays) !== parsePositiveInt(before.durationDays) ||
      m.startTime !== before.startTime
    )
  })
}

export function toUpdatePayload(values: ConsultationFormValues, version: string, photoBase64?: string): UpdateConsultationPayload {
  return {
    expectedVersion: version,
    doctorName: values.doctorName,
    consultDate: values.consultDate,
    photoBase64,
    notes: values.notes,
    symptomCodes: values.symptomCodes,
    medications: values.medications.map((m) => ({
      ...(m.medicationId ? { id: m.medicationId } : {}),
      name: m.name,
      frequencyHours: parsePositiveInt(m.frequencyHours) ?? 0,
      durationDays: parsePositiveInt(m.durationDays) ?? 0,
      startTime: values.recordOnly ? null : m.startTime,
    })),
    // As when creating: the start times are read in the parent's own time zone on the consultation's date.
    utcOffsetMinutes: -new Date(`${values.consultDate}T00:00:00`).getTimezoneOffset(),
  }
}
