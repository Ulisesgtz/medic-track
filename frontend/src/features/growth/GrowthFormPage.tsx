import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { fieldCabinet } from '../../shared/ui/formStyles'
import { StickyActionBar } from '../../shared/ui/StickyActionBar'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { GrowthApiError } from './api'
import { EMPTY_VALUES, isDirty, toInput, validate, valuesOf, type GrowthErrors, type GrowthValues } from './growthForm'
import { GROWTH } from './growthText'
import { useGrowth, useSaveMeasurement } from './hooks'

const label = 'text-[14px] font-bold text-ink'
const errorText = 'text-[13px] font-semibold text-red-700'
const optional = <span className="font-medium text-muted"> {GROWTH.optional}</span>

/** The device's local day as YYYY-MM-DD (a measurement can't be dated after it). */
function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

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

  const start: GrowthValues = registered
    ? { ...EMPTY_VALUES, weight: registered.weightKg != null ? String(registered.weightKg) : '', height: registered.heightCm != null ? String(registered.heightCm) : '' }
    : EMPTY_VALUES
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
  const leave = (e: { preventDefault: () => void }) => {
    if (dirty && !window.confirm(GROWTH.leaveConfirm)) e.preventDefault()
  }
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

  const number = (id: string, field: 'weight' | 'height', text: string, errorKey: 'weightKg' | 'heightCm') => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={label}>
        {text}
        {optional}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={values[field]}
        onChange={(e) => set(field, e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
        className={fieldCabinet}
        aria-invalid={!!errors[errorKey]}
      />
      {errors[errorKey] && <p className={errorText}>{errors[errorKey]}</p>}
    </div>
  )

  const fields = (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="growth-date" className={label}>
          {GROWTH.date}
        </label>
        <input
          id="growth-date"
          type="date"
          min={birthDate || undefined}
          max={today}
          value={values.measuredOn}
          onChange={(e) => set('measuredOn', e.target.value)}
          className={`${fieldCabinet} appearance-none`}
          aria-invalid={!!errors.measuredOn}
        />
        {errors.measuredOn && <p className={errorText}>{errors.measuredOn}</p>}
      </div>
      <p className="text-[14px] leading-normal text-body">{GROWTH.bothOptional}</p>
      <div className="grid grid-cols-2 gap-3">
        {number('growth-weight', 'weight', GROWTH.weightLabel, 'weightKg')}
        {number('growth-height', 'height', GROWTH.heightLabel, 'heightCm')}
      </div>
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
          className="min-h-[88px] w-full min-w-0 rounded-[14px] border-[1.5px] border-calendar-muted bg-surface px-3.5 py-3.5 text-base leading-normal text-ink placeholder:text-calendar-muted focus:border-2 focus:border-ink focus:outline-none"
        />
        {errors.note && <p className={errorText}>{errors.note}</p>}
      </div>
    </div>
  )

  const saveButton = (
    <button ref={saveRef} type="button" disabled={save.isPending} onClick={submit} className={`${pageHeaderButton('primary', variant)} disabled:cursor-not-allowed disabled:opacity-60`}>
      {save.isPending ? GROWTH.saving : editing ? GROWTH.saveEdit : GROWTH.save}
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
      subtitle={child?.firstName}
      maxWidth="max-w-[640px]"
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
          {fields}
          {desktop ? (
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
          ) : (
            <StickyActionBar variant="phone">{saveButton}</StickyActionBar>
          )}
        </>
      )}
    </RoutinePageFrame>
  )
}
