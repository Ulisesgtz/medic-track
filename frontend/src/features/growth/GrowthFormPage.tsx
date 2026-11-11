import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { useDiscardGuard } from '../../shared/ui/useDiscardGuard'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { formatAgeLong } from '../../shared/age'
import { fieldGrowth, fieldGrowthError, fieldGrowthInput } from '../../shared/ui/formStyles'
import { StickyActionBar } from '../../shared/ui/StickyActionBar'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { dayKeyOf } from '../consultations/treatmentDays'
import { GrowthApiError } from './api'
import { EMPTY_VALUES, isDirty, toInput, validate, valuesOf, type GrowthErrors, type GrowthValues } from './growthForm'
import { GROWTH } from './growthText'
import { useGrowth, useSaveMeasurement } from './hooks'

const label = 'text-[15px] font-extrabold text-ink'
const optional = <span className="font-medium text-body"> {GROWTH.optional}</span>

/** The device's local day as YYYY-MM-DD (a measurement can't be dated after it). */
const localToday = (now = new Date()) => dayKeyOf(now.getFullYear(), now.getMonth(), now.getDate())

/**
 * `/children/:childId/crecimiento/nueva` and `/children/:childId/crecimiento/:measurementId/editar` (specs/063): a measurement as a
 * page — the date, the weight and/or the height and a note. «Anotarla con fecha» brings the signup's values in the router's state
 * (never the address). Leaving with something typed asks first; the server's field errors show under each field.
 */
export function GrowthFormPage() {
  const { childId = '', measurementId } = useParams<{ childId: string; measurementId: string }>()
  const editing = !!measurementId
  const location = useLocation()
  const registered = (location.state as { registered?: { weightKg: number | null; heightCm: number | null } } | null)?.registered
  const navigate = useNavigate()
  const { isDesktop } = useSidebarSession()
  const desktop = isDesktop
  const variant = desktop ? 'desktop' : 'phone'
  const accountQuery = useCurrentAccount()
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const growth = useGrowth(childId)
  const save = useSaveMeasurement(childId, measurementId)
  const saved = editing ? growth.data?.measurements.find((m) => m.id === measurementId) : undefined

  // A new measurement starts dated today, as the mock (G1); a correction starts from what was saved.
  const blank: GrowthValues = editing ? EMPTY_VALUES : { ...EMPTY_VALUES, measuredOn: localToday() }
  const start: GrowthValues = registered
    ? { ...blank, weight: registered.weightKg != null ? String(registered.weightKg) : '', height: registered.heightCm != null ? String(registered.heightCm) : '' }
    : blank
  const [initial, setInitial] = useState<GrowthValues>(start)
  const [values, setValues] = useState<GrowthValues>(start)
  const [errors, setErrors] = useState<GrowthErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const saveRef = useRef<HTMLButtonElement>(null)

  const loaded = useRef(false)
  useEffect(() => {
    if (saved && !loaded.current) {
      loaded.current = true
      const v = valuesOf(saved)
      setInitial(v)
      setValues(v)
    }
  }, [saved])

  const dirty = isDirty(values, initial)
  useUnsavedWork(dirty && !save.isSuccess)
  const backTo = `/children/${childId}/crecimiento`
  // specs/066: the app's own question instead of the browser's; «Descartar» goes on to where the tap was going.
  const guard = useDiscardGuard({ isDirty: () => dirty && !save.isSuccess, title: GROWTH.leaveTitle, body: GROWTH.leaveBody })
  const leave = (e: { preventDefault: () => void; currentTarget?: EventTarget | null }) => guard.guardLink(e, backTo)
  const set = (field: keyof GrowthValues, value: string) => setValues((v) => ({ ...v, [field]: value }))
  const today = localToday()
  const birthDate = growth.data?.birthDate ?? child?.birthDate ?? ''

  const submit = () => {
    const found = validate(values, birthDate, today)
    setErrors(found)
    setNotice(null)
    if (Object.keys(found).length > 0) return
    save.mutate(toInput(values), {
      onSuccess: () => navigate(backTo, { replace: true }),
      onError: (e) => {
        if (e instanceof GrowthApiError && e.kind === 'limit') setNotice(GROWTH.limitReached)
        else if (e instanceof GrowthApiError && e.kind === 'validation_error' && e.details?.length) {
          const fromServer: GrowthErrors = {}
          for (const d of e.details) fromServer[d.field as keyof GrowthErrors] = d.message
          setErrors(fromServer)
        } else setNotice(GROWTH.saveFailed)
      },
    })
  }

  const errorLine = (id: string, text: string | undefined) =>
    text ? (
      <p id={id} role="alert" className="flex items-start gap-1.5 text-[14px] leading-[1.4] font-semibold text-error">
        <span aria-hidden="true" className="mt-px flex size-[18px] flex-none items-center justify-center rounded-full bg-error text-[12px] font-black text-white">
          !
        </span>
        {text}
      </p>
    ) : null

  const number = (id: string, field: 'weight' | 'height', text: string, unit: string, errorKey: 'weightKg' | 'heightCm', example: string) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <div className={errors[errorKey] ? fieldGrowthError : fieldGrowth}>
        <input
          id={id}
          inputMode="decimal"
          value={values[field]}
          placeholder={example}
          onChange={(e) => set(field, e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
          className={fieldGrowthInput}
          aria-invalid={!!errors[errorKey]}
          aria-describedby={errors[errorKey] ? `${id}-error` : undefined}
        />
        <span aria-hidden="true" className="flex-none text-[15px] font-bold text-body">
          {unit}
        </span>
      </div>
    </div>
  )

  const fields = (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="growth-date" className={label}>
          {GROWTH.date}
        </label>
        <div className={`${errors.measuredOn ? fieldGrowthError : fieldGrowth} ${desktop ? 'max-w-[260px]' : ''}`}>
          <input
            id="growth-date"
            type="date"
            min={birthDate || undefined}
            max={today}
            value={values.measuredOn}
            onChange={(e) => set('measuredOn', e.target.value)}
            className={`${fieldGrowthInput} appearance-none`}
            aria-invalid={!!errors.measuredOn}
            aria-describedby={errors.measuredOn ? 'growth-date-error' : undefined}
          />
        </div>
        {errorLine('growth-date-error', errors.measuredOn)}
      </div>
      <div className={`grid items-start gap-3 ${desktop ? 'grid-cols-[200px_200px] gap-4' : 'grid-cols-2'}`}>
        {number('growth-weight', 'weight', GROWTH.weightLabel, GROWTH.kg, 'weightKg', GROWTH.weightExample)}
        {number('growth-height', 'height', GROWTH.heightLabel, GROWTH.cm, 'heightCm', GROWTH.heightExample)}
      </div>
      {errors.weightKg || errors.heightCm ? (
        <div className="-mt-2.5 flex flex-col gap-1">
          {errorLine('growth-weight-error', errors.weightKg)}
          {errorLine('growth-height-error', errors.heightCm)}
        </div>
      ) : null}
      <p className={`-mt-2 leading-[1.45] text-body ${desktop ? 'text-[15px]' : 'text-[14px]'}`}>{GROWTH.bothOptional}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="growth-note" className={label}>
          {GROWTH.note}
          {optional}
        </label>
        <textarea
          id="growth-note"
          value={values.note}
          maxLength={300}
          placeholder={GROWTH.notePlaceholder}
          onChange={(e) => set('note', e.target.value)}
          className="min-h-24 w-full min-w-0 rounded-[14px] border-[1.5px] border-field-edge bg-surface p-3.5 text-[17px] leading-normal text-ink placeholder:text-calendar-muted focus:border-2 focus:border-ink focus:outline-none"
        />
        {errorLine('growth-note-error', errors.note)}
      </div>
    </div>
  )

  const saveButton = (
    <button ref={saveRef} type="button" disabled={save.isPending} onClick={submit} className={`${pageHeaderButton('primary', variant)} disabled:cursor-not-allowed disabled:opacity-60`}>
      {save.isPending ? GROWTH.saving : GROWTH.save}
    </button>
  )
  const missing = editing && growth.isSuccess && !saved

  return (
    <RoutinePageFrame
      isDesktop={desktop}
      childId={childId}
      backLabel={GROWTH.backGrowth}
      backTo={backTo}
      backOnClick={leave}
      title={editing ? GROWTH.editTitle : GROWTH.addTitle}
      subtitle={child ? `${child.firstName} · ${formatAgeLong(child.birthDate)}` : undefined}
      maxWidth="max-w-[904px]"
      state={growth.isError ? 'error' : editing && growth.isPending ? 'loading' : undefined}
      errorWhat={GROWTH.loadFailed}
      onRetry={() => void growth.refetch()}
    >
      {missing ? (
        <p className="text-[15px] text-body">{GROWTH.notFound}</p>
      ) : (
        <>
          {notice && (
            <p role="alert" className="rounded-2xl border-[1.5px] border-hint-border bg-surface px-4 py-3.5 text-[14px] leading-normal text-body">
              {notice}
            </p>
          )}
          {desktop ? (
            <section className="flex max-w-[600px] flex-col gap-5 rounded-2xl border border-line bg-surface p-7">
              {fields}
              <StickyActionBar variant="desktop">
              <button
                type="button"
                onClick={(e) => {
                  leave(e)
                  if (!e.defaultPrevented) navigate(backTo)
                }}
                className={pageHeaderButton('secondary', 'desktop')}
              >
                {GROWTH.cancel}
              </button>
                {saveButton}
              </StickyActionBar>
            </section>
          ) : (
            <>
              {fields}
              <StickyActionBar variant="phone">{saveButton}</StickyActionBar>
            </>
          )}
        </>
      )}
      {guard.dialog}
    </RoutinePageFrame>
  )
}
