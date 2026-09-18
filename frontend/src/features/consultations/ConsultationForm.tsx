import { useEffect, useRef, useState } from 'react'
import { useForm, useFieldArray, type Path } from 'react-hook-form'
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

const inputBase =
  'min-h-11 w-full rounded-[14px] bg-surface px-4 py-2.5 text-base font-medium text-ink placeholder-slate-400 outline-none focus:border-ink'
// Fields the OCR filled in carry the bright border until the parent reviews them.
const inputClass = `${inputBase} border-[1.5px] border-slate-300 focus:ring-[0.5px] focus:ring-ink`
const suggestedInputClass = `${inputBase} border-2 border-bright`
const labelClass = 'mb-1.5 block text-[13px] font-bold text-ink'
const errorClass = 'mt-1.5 block text-sm font-semibold text-red-700'
const overlineClass = 'text-xs font-extrabold uppercase tracking-[0.1em] text-action'

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
  // Prefer a date explicitly labeled "fecha" (the consult date) over the
  // first date-shaped number anywhere in the text (which could be a
  // birthdate, license validity, etc.) — fall back to that loose match
  // only when no labeled date is found.
  const dateMatch =
    ocrText.match(/fecha\s*:?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/i) ??
    ocrText.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)

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
    // Stop the name at the first digit (a dosage number), newline, or the
    // word "cada" (start of the frequency instructions) — whichever comes
    // first — so a medication with no dosage number right after its name
    // (e.g. a liquid measured only by "cada N horas") doesn't swallow the
    // instructions into the name.
    const nameMatch = block.match(/^\d{1,2}\.\s*([A-Za-zÁÉÍÓÚÑáéíóúñ/ ]+?)(?=\d|\n|cada\b)/i)
    if (!nameMatch) continue
    meds.push({
      name: nameMatch[1].replace(/\s+/g, ' ').trim(),
      ...frequencyAndDurationHints(block),
    })
  }
  return meds
}

/**
 * Fallback for prescriptions with no numbered list — one entry per
 * "NAME ###mg" occurrence found anywhere in the text (e.g. "Amoxicilina
 * 250mg ... cada 8 horas ... 5 dias\nParacetamol 500mg ..."), rather than
 * just the first one, so a prescription with several unlisted medications
 * still surfaces all of them.
 */
function extractUnlistedMedications(ocrText: string): MedicationHint[] {
  const nameRegex = /([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:[ /][A-Za-zÁÉÍÓÚÑáéíóúñ]+){0,2})\s*\d{2,4}\s*mg/gi
  const matches = [...ocrText.matchAll(nameRegex)]
  return matches.map((match, i) => {
    const start = match.index ?? 0
    const end = matches[i + 1]?.index ?? ocrText.length
    return { name: match[1].trim(), ...frequencyAndDurationHints(ocrText.slice(start, end)) }
  })
}

/**
 * Best-effort medication guesses from OCR-extracted free text (FR-006) —
 * never authoritative. Prescriptions with a numbered medication list yield
 * one entry per line; otherwise falls back to one entry per unlisted
 * "NAME ###mg" occurrence.
 */
function extractMedications(ocrText: string): MedicationHint[] {
  const numbered = extractNumberedMedications(ocrText)
  if (numbered.length > 0) return numbered
  return extractUnlistedMedications(ocrText)
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
  const [suggested, setSuggested] = useState<ReadonlySet<string>>(new Set())

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
    // Tracks how many fieldsets THIS run appended, so if it gets superseded
    // (e.g. the parent selects a second photo before the stagger finishes)
    // the cleanup below can remove exactly the ones it added and no others.
    let appendedCount = 0

    // Fills a field only if the parent left it empty, and marks it as an
    // OCR suggestion (bright border) so it's visibly "to review" (Principio I).
    function fill(path: Path<ConsultationFormValues>, value: string | undefined) {
      if (!value || getValues(path)) return
      setValue(path, value as never)
      setSuggested((prev) => new Set(prev).add(path))
    }

    async function applyHints() {
      const hints = extractPrescriptionHints(suggestion as string)
      fill('doctorName', hints.doctorName)
      fill('consultDate', hints.consultDate)

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
          appendedCount += 1
          await new Promise((resolve) => setTimeout(resolve, MEDICATION_STAGGER_MS))
          if (cancelled) return
        }
        const med = meds[index]
        fill(`medications.${index}.name`, med.name)
        fill(`medications.${index}.frequencyHours`, med.frequencyHours)
        fill(`medications.${index}.durationDays`, med.durationDays)
        setOcrProgress({ current: index + 1, total: meds.length })
      }
      if (!cancelled) setOcrProgress(null)
    }

    applyHints()
    return () => {
      cancelled = true
      setSuggested(new Set())
      if (appendedCount > 0) {
        const currentCount = getValues('medications').length
        const start = currentCount - appendedCount
        remove(Array.from({ length: appendedCount }, (_, i) => start + i))
      }
    }
  }, [suggestion, getValues, setValue, append, remove])

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(values)
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-7">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="doctorName">
            Doctor
          </label>
          <input
            id="doctorName"
            className={suggested.has('doctorName') ? suggestedInputClass : inputClass}
            {...register('doctorName', { required: true })}
          />
          {errors.doctorName && <span className={errorClass}>El nombre del doctor es obligatorio</span>}
        </div>

        <div>
          <label className={labelClass} htmlFor="consultDate">
            Fecha de la consulta
          </label>
          <input
            id="consultDate"
            type="date"
            className={suggested.has('consultDate') ? suggestedInputClass : inputClass}
            {...register('consultDate', { required: true })}
          />
          {errors.consultDate && <span className={errorClass}>La fecha es obligatoria</span>}
        </div>
      </div>

      <div className="rounded-2xl bg-ink-soft p-5 text-white">
        {/* Not a real <label htmlFor>: the file input is `hidden` (display:none),
            which removes it from the accessibility tree, so a htmlFor association
            would point at a node assistive tech never reaches. The button below
            carries its own accessible name and is described by this text instead. */}
        <p id="photo-label" className="text-[13px] font-bold text-white">
          Foto de la receta
        </p>
        <p className="mt-1 text-sm text-white/70">
          La receta se lee en tu dispositivo y no se comparte con terceros. Revisa lo que se
          autocompleta antes de guardar.
        </p>
        <input
          id="photo"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-labelledby="photo-label"
          onChange={handlePhotoChange}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-describedby={photoFile ? 'photo-label photo-filename' : 'photo-label'}
            className="min-h-11 cursor-pointer rounded-2xl border-2 border-bright px-5 py-2.5 text-base font-extrabold text-bright transition-colors duration-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-bright focus-visible:ring-offset-2 focus-visible:ring-offset-ink-soft"
          >
            Seleccionar archivo
          </button>
          {photoFile && (
            <span id="photo-filename" className="min-w-0 truncate text-sm font-semibold text-white/80">
              {photoFile.name}
            </span>
          )}
        </div>
        {isRunning && (
          <p className="mt-3 text-sm font-semibold text-bright" aria-live="polite">
            Analizando la foto…
          </p>
        )}
        {ocrProgress && (
          <div className="mt-3">
            <p className="text-sm font-semibold text-bright" aria-live="polite">
              Agregando medicamentos de la receta… {ocrProgress.current} de {ocrProgress.total}
            </p>
            <div
              role="progressbar"
              aria-label="Progreso de lectura de la receta"
              aria-valuemin={0}
              aria-valuemax={ocrProgress.total}
              aria-valuenow={ocrProgress.current}
              className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"
            >
              <div
                className="h-full rounded-full bg-bright transition-[width] duration-200 ease-out"
                style={{ width: `${(ocrProgress.current / ocrProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
        {mutation.isError &&
          mutation.error instanceof ConsultationApiError &&
          mutation.error.kind === 'validation_error' &&
          !photoFile && (
            <span className="mt-3 block text-sm font-semibold text-red-200">{mutation.error.message}</span>
          )}
      </div>

      <section className="space-y-5">
        <h2 className={overlineClass}>Medicamentos</h2>
        <div className="space-y-4">
          {fields.map((field, index) => (
            <MedicationFieldset
              key={field.id}
              index={index}
              register={register}
              errors={errors}
              control={control}
              onRemove={() => remove(index)}
              removeDisabled={ocrProgress !== null}
              suggested={suggested}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => append(emptyMedication)}
          disabled={ocrProgress !== null}
          className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
          <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">
            {mutation.error instanceof ConsultationApiError
              ? mutation.error.message
              : 'Ocurrió un error al guardar la consulta. Intenta de nuevo.'}
          </p>
        )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-6 py-2.5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="min-h-11 cursor-pointer rounded-2xl bg-confirmed px-8 py-3 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
