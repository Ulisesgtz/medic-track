import type { ConsultationSummary } from './types'

const SHOWN_SYMPTOMS = 3

/** "Fiebre, Tos, Vómito +2": up to three marked symptoms and how many more (specs/012 FR-015). */
function symptomsSummary(names: string[]): string {
  const shown = names.slice(0, SHOWN_SYMPTOMS).join(', ')
  const rest = names.length - SHOWN_SYMPTOMS
  return rest > 0 ? `${shown} +${rest}` : shown
}

/**
 * "Fiebre, Tos · 2 medicamentos"; with no marked symptoms, the start of the notes (earlier consultations
 * keep their old symptoms text there); a visit with no medication reads "sin receta".
 */
export function consultationLine({ symptomNames, notes, medicationCount }: ConsultationSummary): string {
  const meds =
    medicationCount === 0 ? 'sin receta' : `${medicationCount} ${medicationCount === 1 ? 'medicamento' : 'medicamentos'}`
  const lead = symptomNames.length > 0 ? symptomsSummary(symptomNames) : notes.trim()
  return [lead, meds].filter(Boolean).join(' · ')
}
