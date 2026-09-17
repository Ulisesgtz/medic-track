import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { MedicationFieldset } from './MedicationFieldset'
import { useOcrSuggestion } from './useOcrSuggestion'
import { createConsultation, ConsultationApiError, type CreateConsultationPayload } from './api'

export interface MedicationFormValues {
  name: string
  frequencyHours: string
  durationDays: string
  startTime: string
}

export interface ConsultationFormValues {
  doctorName: string
  consultDate: string
  symptoms: string
  medications: MedicationFormValues[]
}

const emptyMedication: MedicationFormValues = {
  name: '',
  frequencyHours: '',
  durationDays: '',
  startTime: '',
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30'
const labelClass = 'mb-1 block text-sm font-medium text-slate-700'
const errorClass = 'mt-1 text-sm text-red-600'

/**
 * Extracts a plausible "treatment duration in days" from OCR-extracted free
 * text, as a best-effort autofill suggestion (FR-006) — never authoritative,
 * always left as an editable placeholder the parent must confirm.
 */
function extractDurationDaysHint(ocrText: string): string | undefined {
  const match = ocrText.match(/(\d{1,3})\s*(?:d[ií]as?|days?)/i)
  return match ? match[1] : undefined
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

interface ConsultationFormProps {
  childId: string
  onSuccess: (consultationId: string) => void
  onCancel: () => void
}

/** Form to register a new medical consultation (FR-003, FR-004). */
export function ConsultationForm({ childId, onSuccess, onCancel }: ConsultationFormProps) {
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const { suggestion, isRunning, runOcr } = useOcrSuggestion()

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ConsultationFormValues>({
    defaultValues: {
      doctorName: '',
      consultDate: '',
      symptoms: '',
      medications: [emptyMedication],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'medications' })

  const mutation = useMutation({
    mutationFn: async (values: ConsultationFormValues) => {
      if (!photoFile) {
        throw new ConsultationApiError('validation_error', 'La foto de la receta es obligatoria')
      }
      const photoBase64 = await fileToBase64(photoFile)
      const payload: CreateConsultationPayload = {
        doctorName: values.doctorName,
        consultDate: values.consultDate,
        photoBase64,
        symptoms: values.symptoms,
        medications: values.medications.map((m) => ({
          name: m.name,
          frequencyHours: Number(m.frequencyHours),
          durationDays: Number(m.durationDays),
          startTime: m.startTime || undefined,
        })),
      }
      return createConsultation(childId, payload)
    },
    onSuccess: (consultation) => onSuccess(consultation.id),
  })

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setPhotoFile(file)
    if (file) {
      await runOcr(file)
    }
  }

  const durationHint = suggestion ? extractDurationDaysHint(suggestion) : undefined

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(values)
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div>
        <label className={labelClass} htmlFor="doctorName">
          Doctor
        </label>
        <input id="doctorName" className={inputClass} {...register('doctorName', { required: true })} />
        {errors.doctorName && <span className={errorClass}>El nombre del doctor es obligatorio</span>}
      </div>

      <div>
        <label className={labelClass} htmlFor="consultDate">
          Fecha de la consulta
        </label>
        <input
          id="consultDate"
          type="date"
          className={inputClass}
          {...register('consultDate', { required: true })}
        />
        {errors.consultDate && <span className={errorClass}>La fecha es obligatoria</span>}
      </div>

      <div>
        <label className={labelClass} htmlFor="photo">
          Foto de la receta
        </label>
        <input
          id="photo"
          type="file"
          accept="image/*"
          capture="environment"
          className={inputClass}
          onChange={handlePhotoChange}
        />
        {isRunning && <p className="mt-1 text-sm text-slate-500">Analizando la foto…</p>}
        {mutation.isError &&
          mutation.error instanceof ConsultationApiError &&
          mutation.error.kind === 'validation_error' &&
          !photoFile && <span className={errorClass}>{mutation.error.message}</span>}
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Medicamentos</h2>
        <div className="space-y-3">
          {fields.map((field, index) => (
            <MedicationFieldset
              key={field.id}
              index={index}
              register={register}
              errors={errors}
              onRemove={() => remove(index)}
              durationPlaceholder={index === 0 ? durationHint : undefined}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => append(emptyMedication)}
          className="cursor-pointer rounded-lg border border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700 transition-colors duration-200 hover:bg-cyan-50"
        >
          Agregar medicamento
        </button>
      </section>

      <div>
        <label className={labelClass} htmlFor="symptoms">
          Síntomas
        </label>
        <textarea id="symptoms" className={inputClass} rows={3} {...register('symptoms')} />
      </div>

      {mutation.isError &&
        !(mutation.error instanceof ConsultationApiError && mutation.error.kind === 'validation_error' && !photoFile) && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {mutation.error instanceof ConsultationApiError
              ? mutation.error.message
              : 'Ocurrió un error al guardar la consulta. Intenta de nuevo.'}
          </p>
        )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="cursor-pointer rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
