import type { FieldErrors } from 'react-hook-form'
import type { ConsultationFormValues } from './ConsultationForm'

const MEDICATION_FIELDS: { key: 'name' | 'frequencyHours' | 'durationDays' | 'startTime'; label: string }[] = [
  { key: 'name', label: 'el nombre del medicamento' },
  { key: 'frequencyHours', label: 'cada cuántas horas' },
  { key: 'durationDays', label: 'cuántos días' },
  { key: 'startTime', label: 'la hora de la primera toma' },
]

/**
 * What the "Guardar consulta" status says when something is missing: the missing things by name, in
 * the form's order, so the tutor knows what's left even when those fields are off screen on a phone
 * (e.g. "Falta: la foto de la receta, el nombre del medicamento."). With more than one medication
 * each of its items says which one ("… (medicamento 2)").
 */
export function missingFieldsText(
  errors: FieldErrors<ConsultationFormValues>,
  photoMissing: boolean,
  medicationCount: number,
): string {
  const items: string[] = []
  if (photoMissing) items.push('la foto de la receta')
  if (errors.doctorName) items.push('el doctor')
  if (errors.consultDate) items.push('la fecha')
  const medications = errors.medications
  for (let i = 0; i < medicationCount; i++) {
    const medErrors = medications?.[i]
    if (!medErrors) continue
    for (const { key, label } of MEDICATION_FIELDS) {
      if (medErrors[key]) items.push(medicationCount > 1 ? `${label} (medicamento ${i + 1})` : label)
    }
  }
  return items.length > 0 ? `Falta: ${items.join(', ')}.` : 'Completa los campos faltantes.'
}
