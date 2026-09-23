import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/react'
import { Link } from 'react-router-dom'
import { useForm, useFieldArray, type Path } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { MedicationFieldset } from './MedicationFieldset'
import { parsePositiveInt } from './parsePositiveInt'
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
  /** 'phone' = mock 04 (dark header with the OCR panel); 'desktop' = mock 14. */
  variant: 'phone' | 'desktop'
  /** "Para Mateo Morales · 5 años 6 meses" under the desktop title, when the child is known. */
  childLabel?: string
  /** Where "← Cancelar" goes (the child's detail). */
  cancelTo: string
  onSuccess: (consultationId: string) => void
  /** Called when "← Cancelar" is followed: return false to stay (e.g. the parent refused to discard). */
  confirmLeave?: () => boolean
  /** Tells the parent whether the form holds anything the user would lose. */
  onDirtyChange?: (dirty: boolean) => void
}

const MEDICATION_STAGGER_MS = 180

// Mocks 04/14: every field of the "Sugerido por OCR" group carries the bright
// border ("proposed by the OCR, confirm it"); the symptoms box is a plain field.
const ocrField =
  'min-h-11 w-full min-w-0 rounded-xl border-2 border-bright bg-surface px-4 py-3 text-base text-ink focus:border-ink focus:outline-none'
const plainField =
  'w-full min-w-0 rounded-xl border-[1.5px] border-slate-300 bg-surface px-4 py-3 text-base font-medium text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none'
const label = 'text-[13px] font-bold text-ink-soft'
const errorText = 'text-[13px] font-semibold text-red-700'

/**
 * The "Nueva consulta" screen (FR-003, FR-004), built from mockups 04 (phone)
 * and 14 (desktop): "← Cancelar", the dark "Leyendo receta" panel, the
 * "Sugerido por OCR · revisa y confirma" group (doctor, date, symptoms), the
 * medication cards, "+ Otro medicamento" and "Guardar consulta".
 *
 * The mocks assume the photo was already taken; the form still needs a way to
 * choose it, so the OCR panel shows a "Seleccionar archivo" button until a
 * photo is chosen and then turns into the reading progress. OCR runs in the
 * browser and only ever *suggests*: hints fill empty fields (marked with the
 * bright border) and stay fully editable (Principio I).
 */
export function ConsultationForm({
  childId,
  variant,
  childLabel,
  cancelTo,
  onSuccess,
  confirmLeave,
  onDirtyChange,
}: ConsultationFormProps) {
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  // Set when the parent tries to save without a photo; it shows with the other missing-field errors.
  const [photoMissing, setPhotoMissing] = useState(false)
  const { suggestion, isRunning, progress, runOcr } = useOcrSuggestion()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number } | null>(null)
  const [suggested, setSuggested] = useState<ReadonlySet<string>>(new Set())
  const desktop = variant === 'desktop'

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isDirty, submitCount },
  } = useForm<ConsultationFormValues>({
    defaultValues: {
      doctorName: '',
      consultDate: '',
      symptoms: '',
      medications: [emptyMedication],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'medications' })

  // A typed field or a chosen photo (which OCR may have autofilled from) is worth a confirmation.
  const dirty = isDirty || photoFile !== null
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const { getToken } = useAuth()
  const mutation = useMutation({
    mutationFn: async ({ values, photo }: { values: ConsultationFormValues; photo: File }) => {
      const photoBase64 = await fileToBase64(photo)
      const payload: CreateConsultationPayload = {
        doctorName: values.doctorName,
        consultDate: values.consultDate,
        photoBase64,
        symptoms: values.symptoms,
        medications: values.medications.map((m) => ({
          name: m.name,
          frequencyHours: parsePositiveInt(m.frequencyHours) ?? 0,
          durationDays: parsePositiveInt(m.durationDays) ?? 0,
          startTime: m.startTime,
        })),
        // Start times are read in the parent's own time zone (their offset on the consult date).
        utcOffsetMinutes: -new Date(`${values.consultDate}T00:00:00`).getTimezoneOffset(),
      }
      return createConsultation(childId, payload, await getToken())
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
        fill(`medications.${index}.frequencyHours`, med.frequencyHours ? `c/${med.frequencyHours} h` : undefined)
        fill(`medications.${index}.durationDays`, med.durationDays ? `${med.durationDays} días` : undefined)
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

  // `suggested` is keyed by index-based paths, so removing a medication row
  // must drop that row's entries and shift the ones after it down by one —
  // otherwise the "OCR suggestion" border would stick to whichever row now
  // occupies the old index (including one the parent typed themselves).
  function removeMedication(index: number) {
    remove(index)
    setSuggested((prev) => {
      const next = new Set<string>()
      for (const path of prev) {
        const match = /^medications\.(\d+)\.(.+)$/.exec(path)
        if (!match) {
          next.add(path)
          continue
        }
        const n = Number(match[1])
        if (n === index) continue
        next.add(n > index ? `medications.${n - 1}.${match[2]}` : path)
      }
      return next
    })
  }

  const onSubmit = handleSubmit(
    (values) => {
      if (!photoFile) {
        setPhotoMissing(true)
        return
      }
      mutation.mutate({ values, photo: photoFile })
    },
    () => setPhotoMissing(!photoFile),
  )

  // ---- "Leyendo receta" panel: chooser -> progress -> "Listo".
  const reading = isRunning || ocrProgress !== null
  const percent = isRunning
    ? Math.round(progress * 100)
    : ocrProgress
      ? Math.round((ocrProgress.current / ocrProgress.total) * 100)
      : 100
  // Mock 04 (phone): fields of the OCR group are semibold; the web mock 14 keeps medium.
  const ocrFieldClass = `${ocrField} ${desktop ? 'font-medium' : 'font-semibold'}`
  // Once a photo is chosen the panel is exactly the mock's (title + percent, bar, note) and
  // "Cambiar foto" moves to the top row, next to "← Cancelar" (phone) or the header's right end (web).
  const showChooser = !photoFile
  const gapTop = desktop ? 'mt-4' : 'mt-3.5'
  const panelBox = desktop ? 'rounded-3xl bg-ink p-6 lg:p-7' : 'mt-5 rounded-3xl bg-ink-soft p-5'
  const track = desktop ? 'bg-ink-soft' : 'bg-ink'
  const ocrPanel = (
    <div className={`min-w-0 ${panelBox}`}>
      {/* Not a real <label htmlFor>: the file input is `hidden` (display:none),
          which removes it from the accessibility tree. The button carries its
          own accessible name and is described by this text instead. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id="photo-label" className="text-[13px] font-extrabold tracking-[0.08em] text-[#67e8f9] uppercase">
          {photoFile ? 'Leyendo receta' : 'Foto de la receta'}
        </p>
        {photoFile && (
          <p className="text-[13px] font-bold text-white" aria-live="polite">
            {reading ? `${percent} %` : 'Listo'}
          </p>
        )}
      </div>
      {photoFile && (
        <div
          role="progressbar"
          aria-label="Progreso de lectura de la receta"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className={`${gapTop} h-2 overflow-hidden rounded-full ${track}`}
        >
          <div className="h-full bg-bright transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      )}
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
      {ocrProgress && (
        <p className={`${gapTop} text-[13px] font-semibold text-[#67e8f9]`} aria-live="polite">
          Agregando medicamentos de la receta… {ocrProgress.current} de {ocrProgress.total}
        </p>
      )}
      <p className={`${gapTop} text-[13px] leading-relaxed text-[#a5f3fc]`}>
        {desktop
          ? 'El procesamiento ocurre en tu equipo. La foto no se envía a ningún servidor.'
          : 'El procesamiento ocurre en tu teléfono. La foto no sale del dispositivo.'}
      </p>
      {showChooser && (
        <div className={gapTop}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-describedby="photo-label"
            className="min-h-11 cursor-pointer rounded-2xl border-2 border-bright px-5 py-2.5 text-base font-extrabold text-bright transition-colors duration-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-bright focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Seleccionar archivo
          </button>
        </div>
      )}
      {photoMissing && !photoFile && (
        <p className="mt-3 text-[13px] font-semibold text-red-200">La foto de la receta es obligatoria</p>
      )}
    </div>
  )

  const changePhoto = (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      className={
        desktop
          ? '-my-3 inline-flex min-h-11 cursor-pointer items-center self-start text-sm font-bold text-action'
          : '-my-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-[#67e8f9] hover:text-white'
      }
    >
      Cambiar foto
    </button>
  )

  const cancelLink = (
    <Link
      to={cancelTo}
      onClick={(event) => {
        if (confirmLeave && !confirmLeave()) event.preventDefault()
      }}
      className={
        desktop
          ? '-my-3 inline-flex min-h-11 items-center text-sm font-bold text-action'
          : '-my-3 inline-flex min-h-11 items-center text-sm font-bold text-[#67e8f9] hover:text-white'
      }
    >
      ← Cancelar
    </Link>
  )

  const missing = submitCount > 0 && (Object.keys(errors).length > 0 || (photoMissing && !photoFile))
  const statusText = mutation.isError
    ? mutation.error instanceof ConsultationApiError
      ? mutation.error.message
      : 'Ocurrió un error al guardar la consulta. Intenta de nuevo.'
    : missing
      ? 'Completa los campos faltantes.'
      : ''

  // Not in the phone mock 04 (the web mock 14 has it inside the OCR group): kept because the model
  // stores it, as its own field below the group on the phone so the group stays as the mock.
  const symptomsField = (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor="symptoms" className={label}>
        Síntomas
      </label>
      <textarea
        id="symptoms"
        rows={3}
        placeholder="Lo que observaste antes de la consulta"
        className={plainField}
        {...register('symptoms')}
      />
    </div>
  )

  const ocrGroup = (
    <fieldset
      className={`flex min-w-0 flex-col rounded-3xl border-[1.5px] border-hint-border bg-hint ${
        desktop ? 'gap-4 p-6' : 'gap-3.5 p-5'
      }`}
    >
      <legend className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">
        Sugerido por OCR · revisa y confirma
      </legend>
      <div className={desktop ? 'grid gap-4 sm:grid-cols-2' : 'flex flex-col gap-3.5'}>
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="doctorName" className={label}>
            Doctor
          </label>
          <input id="doctorName" size={1} className={ocrFieldClass} {...register('doctorName', { required: true })} />
          {errors.doctorName && <p className={errorText}>El nombre del doctor es obligatorio</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="consultDate" className={label}>
            Fecha
          </label>
          <input
            id="consultDate"
            type="date"
            size={1}
            className={ocrFieldClass}
            {...register('consultDate', { required: true })}
          />
          {errors.consultDate && <p className={errorText}>La fecha es obligatoria</p>}
        </div>
      </div>
      {desktop && symptomsField}
    </fieldset>
  )

  const medications = (
    <div className={`flex min-w-0 flex-col ${desktop ? 'gap-4' : 'gap-3.5'}`}>
      {fields.map((field, index) => (
        <MedicationFieldset
          key={field.id}
          index={index}
          register={register}
          errors={errors}
          onRemove={() => removeMedication(index)}
          canRemove={fields.length > 1}
          removeDisabled={ocrProgress !== null}
          suggested={suggested}
          variant={variant}
        />
      ))}
    </div>
  )

  const addButton = (
    <button
      type="button"
      onClick={() => append(emptyMedication)}
      disabled={ocrProgress !== null}
      className={
        desktop
          ? 'min-h-11 cursor-pointer rounded-2xl border-2 border-action px-6 py-3 text-[15px] font-extrabold text-action transition-colors hover:bg-hint disabled:cursor-not-allowed disabled:opacity-50'
          : 'min-h-11 cursor-pointer rounded-3xl border-2 border-dashed border-[#67e8f9] py-4 text-[15px] font-extrabold text-action transition-colors hover:bg-hint disabled:cursor-not-allowed disabled:opacity-50'
      }
    >
      + Otro medicamento
    </button>
  )
  const saveButton = (
    <button
      type="submit"
      disabled={mutation.isPending}
      className={`min-h-11 cursor-pointer rounded-2xl bg-confirmed text-base font-extrabold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 ${
        desktop ? 'px-8 py-3.5' : 'py-4'
      }`}
    >
      {mutation.isPending ? 'Guardando…' : 'Guardar consulta'}
    </button>
  )
  const status = (
    <p
      role="status"
      className={`text-[13px] font-semibold ${statusText ? 'text-red-700' : 'text-action'} ${
        desktop ? '' : 'pb-2 text-center'
      }`}
    >
      {statusText}
    </p>
  )

  if (desktop) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {cancelLink}
            <h1 className="mt-3 text-4xl font-black tracking-tight text-ink">Nueva consulta</h1>
            {childLabel && <p className="mt-2 text-base text-slate-600">Para {childLabel}</p>}
          </div>
          {photoFile && changePhoto}
        </div>
        {ocrPanel}
        <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col gap-5">
          {ocrGroup}
          {medications}
          <div className="flex flex-wrap items-center justify-between gap-4">
            {addButton}
            {saveButton}
          </div>
          {status}
        </form>
      </div>
    )
  }

  return (
    <>
      <header className="bg-ink px-6 pt-6 pb-7">
        <div className="flex min-h-6 items-center justify-between">
          {cancelLink}
          {photoFile && changePhoto}
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-tight text-white">Nueva consulta</h1>
        {ocrPanel}
      </header>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 px-6 pt-6">
        {ocrGroup}
        {symptomsField}
        {medications}
        {addButton}
        {saveButton}
        {status}
      </form>
    </>
  )
}
