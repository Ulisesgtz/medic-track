import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { useVaccines } from '../../shared/catalog/useCatalog'
import { FormField } from '../../shared/ui/FormField'
import { fieldBorder, fieldModal, fieldMultiline } from '../../shared/ui/formStyles'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { VaccinationApiError } from './api'
import { useSaveVaccination } from './hooks'
import { OTHER, emptyValues, isDirty, localToday, serverErrors, toInput, validateDose, valuesOf, type DoseErrors, type DoseField, type DoseFormValues } from './vaccineForm'
import { TEXT } from './vaccineText'
import type { Vaccination } from './types'

interface VaccineDialogProps {
  childId: string
  /** The child's birth date: a dose can't be dated before it. */
  birthDate: string
  /** The dose being corrected; none = a new one. */
  vaccination?: Vaccination
  /** Values to start from (what the photo reading proposed), already edited by the parent in `ProposedRows`. */
  initial?: Partial<DoseFormValues>
  onClose: () => void
  /** The button that opened this: focus goes back to it (Safari doesn't focus a clicked button). */
  opener: RefObject<HTMLElement | null>
}

/**
 * Records or corrects one dose (specs/046): the vaccine from the catalog's list or «Otra…» written by the parent, the date it was
 * applied and, optionally, the dose number, the lot, the place and a note. A real dialog like the others (rendered into <body>, Escape,
 * focus in and back, Tab stays inside): a sheet from the bottom on the phone, centered on the web. If the same vaccine, dose and date are
 * already there the parent is told and may save it anyway. What was typed is never lost on a failure.
 */
export function VaccineDialog({ childId, birthDate, vaccination, initial, onClose, opener }: VaccineDialogProps) {
  const id = useId()
  const desktop = useIsDesktop()
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLSelectElement>(null)
  const vaccines = useVaccines()
  const save = useSaveVaccination(childId, vaccination?.id)

  const start = useMemo(() => ({ ...(vaccination ? valuesOf(vaccination) : emptyValues()), ...initial }), [vaccination, initial])
  const [values, setValues] = useState<DoseFormValues>(start)
  const [errors, setErrors] = useState<DoseErrors>({})
  const [duplicate, setDuplicate] = useState(false)
  const [failed, setFailed] = useState(false)
  const dirty = isDirty(values, vaccination ? valuesOf(vaccination) : emptyValues())
  useUnsavedWork(dirty)

  const busyRef = useRef(false)
  useEffect(() => {
    busyRef.current = save.isPending
  })
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  })
  const close = useCallback(() => {
    if (busyRef.current) return
    if (dirtyRef.current && !window.confirm(TEXT.dialog.leave)) return
    onClose()
  }, [onClose])

  useEffect(() => {
    const restoreTo = opener.current
    firstRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select, input, textarea') ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreTo?.focus()
    }
  }, [close, opener])

  function set(field: DoseField, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
    setDuplicate(false)
    setFailed(false)
  }

  function send(allowDuplicate: boolean) {
    save.mutate(toInput(values, allowDuplicate), {
      onSuccess: onClose,
      onError: (error) => {
        if (error instanceof VaccinationApiError && error.kind === 'duplicate') setDuplicate(true)
        else if (error instanceof VaccinationApiError && error.kind === 'validation_error') setErrors(serverErrors(error.details))
        else setFailed(true)
      },
    })
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validateDose(values, birthDate, localToday())
    setErrors(found)
    if (Object.keys(found).length > 0) return
    send(false)
  }

  const border = (field: DoseField) => fieldBorder(!!errors[field])
  const other = values.vaccine === OTHER
  const title = vaccination ? TEXT.dialog.editTitle : TEXT.dialog.addTitle
  return createPortal(
    <div className={`fixed inset-0 z-50 flex bg-ink/70 ${desktop ? 'items-center justify-center p-6' : 'items-end p-4'}`} onClick={close}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={`flex max-h-[92vh] w-full flex-col gap-4 overflow-y-auto rounded-3xl bg-surface shadow-2xl ${desktop ? 'max-w-[560px] p-7' : 'p-6 pb-7'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={`${id}-title`} className="mt-2 text-2xl leading-[1.2] font-black tracking-[-0.02em] text-ink">
            {title}
          </h2>
          <button
            type="button"
            aria-label={TEXT.dialog.close}
            onClick={close}
            disabled={save.isPending}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-[26px] leading-none font-bold text-ink hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-not-allowed"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormField id={`${id}-vaccine`} text={TEXT.dialog.vaccine} error={errors.vaccine}>
            <select
              id={`${id}-vaccine`}
              ref={firstRef}
              value={values.vaccine}
              onChange={(e) => set('vaccine', e.target.value)}
              aria-invalid={!!errors.vaccine}
              className={`${fieldModal} ${border('vaccine')}`}
            >
              <option value="">{TEXT.dialog.chooseVaccine}</option>
              {(vaccines.data ?? []).map((v) => (
                <option key={v.code} value={v.code}>
                  {v.name}
                </option>
              ))}
              {vaccination?.vaccineCode && !(vaccines.data ?? []).some((v) => v.code === vaccination.vaccineCode) && (
                <option value={vaccination.vaccineCode}>{vaccination.name}</option>
              )}
              <option value={OTHER}>{TEXT.dialog.other}</option>
            </select>
          </FormField>
          {other && (
            <FormField id={`${id}-custom`} text={TEXT.dialog.customName} error={errors.customName}>
              <input
                id={`${id}-custom`}
                type="text"
                value={values.customName}
                onChange={(e) => set('customName', e.target.value)}
                aria-invalid={!!errors.customName}
                className={`${fieldModal} ${border('customName')}`}
              />
            </FormField>
          )}
          <FormField id={`${id}-date`} text={TEXT.dialog.appliedOn} error={errors.appliedOn}>
            <input
              id={`${id}-date`}
              type="date"
              value={values.appliedOn}
              min={birthDate.slice(0, 10)}
              max={localToday()}
              onChange={(e) => set('appliedOn', e.target.value)}
              aria-invalid={!!errors.appliedOn}
              className={`${fieldModal} ${border('appliedOn')}`}
            />
          </FormField>
          <FormField id={`${id}-dose`} text={TEXT.dialog.doseNumber} error={errors.doseNumber}>
            <input
              id={`${id}-dose`}
              type="text"
              inputMode="numeric"
              value={values.doseNumber}
              onChange={(e) => set('doseNumber', e.target.value)}
              aria-invalid={!!errors.doseNumber}
              className={`${fieldModal} ${border('doseNumber')}`}
            />
          </FormField>
          <FormField id={`${id}-lot`} text={TEXT.dialog.lot} error={errors.lot}>
            <input id={`${id}-lot`} type="text" value={values.lot} onChange={(e) => set('lot', e.target.value)} aria-invalid={!!errors.lot} className={`${fieldModal} ${border('lot')}`} />
          </FormField>
          <FormField id={`${id}-place`} text={TEXT.dialog.place} error={errors.place}>
            <input id={`${id}-place`} type="text" value={values.place} onChange={(e) => set('place', e.target.value)} aria-invalid={!!errors.place} className={`${fieldModal} ${border('place')}`} />
          </FormField>
          <FormField id={`${id}-notes`} text={TEXT.dialog.notes} error={errors.notes}>
            <textarea
              id={`${id}-notes`}
              rows={3}
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              aria-invalid={!!errors.notes}
              className={`${fieldMultiline} ${border('notes')}`}
            />
          </FormField>
          {duplicate && (
            <div role="alert" className="flex flex-col gap-2 rounded-2xl border-2 border-hint-border bg-hint px-4 py-3 text-[15px] text-body">
              <p>{TEXT.dialog.duplicate}</p>
              <button
                type="button"
                onClick={() => send(true)}
                disabled={save.isPending}
                className="min-h-11 cursor-pointer self-start rounded-2xl border-2 border-action px-4 text-[15px] font-extrabold text-action hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-60"
              >
                {TEXT.dialog.saveAnyway}
              </button>
            </div>
          )}
          {failed && (
            <p role="alert" className="text-[13px] font-semibold text-red-700">
              {TEXT.dialog.saveError}
            </p>
          )}
          <div className={`mt-1.5 flex gap-3 ${desktop ? 'justify-end' : 'flex-col-reverse gap-2.5'}`}>
            <button
              type="button"
              onClick={close}
              disabled={save.isPending}
              className="min-h-12 cursor-pointer rounded-2xl border-2 border-action px-6 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {TEXT.dialog.cancel}
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="min-h-12 cursor-pointer rounded-2xl bg-confirmed px-6 text-base font-extrabold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {save.isPending ? TEXT.dialog.saving : TEXT.dialog.save}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
