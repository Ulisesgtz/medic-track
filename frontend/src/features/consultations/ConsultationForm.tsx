import { useEffect, useRef, useState } from 'react'
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

interface PrescriptionHints {
  doctorName?: string
  consultDate?: string
}

interface MedicationHint {
  name?: string
  frequencyHours?: string
  durationDays?: string
}

/**
 * Best-effort doctor/date guesses from OCR-extracted free text (FR-006) —
 * never authoritative. Every hint only ever fills a field the parent left
 * empty, and stays fully editable/overwritable before Guardar (Principio I).
 */
function extractPrescriptionHints(ocrText: string): PrescriptionHints {
  const doctorMatch = ocrText.match(
    /dra?\.?[ \t]+([A-Za-zÁÉÍÓÚÑáéíóúñ.]+(?:[ \t]+[A-Za-zÁÉÍÓÚÑáéíóúñ.]+){1,3})/i,
  )
  const dateMatch = ocrText.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)

  let consultDate: string | undefined
  if (dateMatch) {
    const [, day, month, yearRaw] = dateMatch
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw
    consultDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return {
    doctorName: doctorMatch ? doctorMatch[1].trim() : undefined,
    consultDate,
  }
}

function frequencyAndDurationHints(block: string): Pick<MedicationHint, 'frequencyHours' | 'durationDays'> {
  const frequencyMatch = block.match(/cada\s*(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*(?:hrs?\.?|horas?)/i)
  const durationMatch = block.match(/(?:por|durante)\s*(\d{1,3})\s*d[ií]as?/i)
  return {
    frequencyHours: frequencyMatch ? frequencyMatch[1] : undefined,
    durationDays: durationMatch ? durationMatch[1] : undefined,
  }
}

/** One medication per numbered line ("1. AMOXICILINA 500MG ... cada 8 horas por 7 días"). */
function extractNumberedMedications(ocrText: string): MedicationHint[] {
  const blocks = ocrText.split(/(?=^\d{1,2}\.\s)/m).filter((block) => /^\d{1,2}\.\s/.test(block))
  const meds: MedicationHint[] = []
  for (const block of blocks) {
    const nameMatch = block.match(/^\d{1,2}\.\s*([A-Za-zÁÉÍÓÚÑáéíóúñ/ ]+?)(?=\d)/)
    if (!nameMatch) continue
    meds.push({
      name: nameMatch[1].replace(/\s+/g, ' ').trim(),
      ...frequencyAndDurationHints(block),
    })
  }
  return meds
}

/** Fallback for a single, unlisted medication ("Amoxicilina 250mg ... cada 8 horas ... 5 dias"). */
function extractSingleMedication(ocrText: string): MedicationHint | undefined {
  const nameMatch = ocrText.match(/([A-Za-zÁÉÍÓÚÑáéíóúñ]{4,})\s*\d{2,4}\s*mg/i)
  if (!nameMatch) return undefined
  return { name: nameMatch[1], ...frequencyAndDurationHints(ocrText) }
}

/**
 * Best-effort medication guesses from OCR-extracted free text (FR-006) —
 * never authoritative. Prescriptions with a numbered medication list yield
 * one entry per line; otherwise falls back to a single best-guess entry.
 */
function extractMedications(ocrText: string): MedicationHint[] {
  const numbered = extractNumberedMedications(ocrText)
  if (numbered.length > 0) return numbered
  const single = extractSingleMedication(ocrText)
  return single ? [single] : []
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
const MEDICATION_STAGGER_MS = 180

export function ConsultationForm({ childId, onSuccess, onCancel }: ConsultationFormProps) {
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const { suggestion, isRunning, runOcr } = useOcrSuggestion()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number } | null>(null)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
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

  useEffect(() => {
    if (!suggestion) return
    let cancelled = false

    async function applyHints() {
      const hints = extractPrescriptionHints(suggestion as string)
      if (hints.doctorName && !getValues('doctorName')) {
        setValue('doctorName', hints.doctorName)
      }
      if (hints.consultDate && !getValues('consultDate')) {
        setValue('consultDate', hints.consultDate)
      }

      const meds = extractMedications(suggestion as string)
      if (meds.length === 0) return
      const existingCount = getValues('medications').length
      setOcrProgress({ current: 0, total: meds.length })

      for (let index = 0; index < meds.length; index++) {
        if (cancelled) return
        // Adds each medication with a short pause so a long prescription
        // reveals itself progressively instead of dumping every fieldset
        // at once (UI/UX guidance: visible incremental progress).
        if (index >= existingCount) {
          append(emptyMedication)
          await new Promise((resolve) => setTimeout(resolve, MEDICATION_STAGGER_MS))
          if (cancelled) return
        }
        const med = meds[index]
        if (med.name && !getValues(`medications.${index}.name`)) {
          setValue(`medications.${index}.name`, med.name)
        }
        if (med.frequencyHours && !getValues(`medications.${index}.frequencyHours`)) {
          setValue(`medications.${index}.frequencyHours`, med.frequencyHours)
        }
        if (med.durationDays && !getValues(`medications.${index}.durationDays`)) {
          setValue(`medications.${index}.durationDays`, med.durationDays)
        }
        setOcrProgress({ current: index + 1, total: meds.length })
      }
      if (!cancelled) setOcrProgress(null)
    }

    applyHints()
    return () => {
      cancelled = true
    }
  }, [suggestion, getValues, setValue, append])

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
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoChange}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
          >
            Seleccionar archivo
          </button>
          {photoFile && <span className="truncate text-sm text-slate-600">{photoFile.name}</span>}
        </div>
        {isRunning && (
          <p className="mt-1 text-sm text-slate-500" aria-live="polite">
            Analizando la foto…
          </p>
        )}
        {ocrProgress && (
          <p className="mt-1 text-sm text-cyan-700" aria-live="polite">
            Agregando medicamentos de la receta… {ocrProgress.current} de {ocrProgress.total}
          </p>
        )}
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
              control={control}
              onRemove={() => remove(index)}
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
