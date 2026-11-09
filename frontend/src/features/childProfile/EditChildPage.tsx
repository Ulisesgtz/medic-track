import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { childAccessOf } from '../family/useChildAccess'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { fieldCabinet } from '../../shared/ui/formStyles'
import { StickyActionBar } from '../../shared/ui/StickyActionBar'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { ChildProfileApiError } from './api'
import { CHILD_PROFILE, conflictLine } from './childProfileText'
import { errorsFromServer, identityChanged, isDirty, measuresChanged, toBody, validate, valuesOf, type ChildErrors, type ChildValues } from './editChildForm'
import { useUpdateChild } from './hooks'

const label = 'text-[14px] font-bold text-ink'
const errorText = 'text-[13px] font-semibold text-red-700'
const badge = 'shrink-0 rounded-full border border-hint-border bg-hint px-[9px] py-[3px] text-[12px] font-extrabold text-action'
const notice = 'rounded-2xl border-[1.5px] border-hint-border bg-surface px-4 py-3.5 text-[14px] leading-normal text-body'
const EMPTY: ChildValues = { firstName: '', lastName: '', birthDate: '', height: '', weight: '' }

/** The device's local day as YYYY-MM-DD (a birth date can't be after it; the box's measurement is dated on it). */
function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * `/children/:childId/editar` (specs/064): correct a child's own data — names, birth date, the signup's height and weight. Height and
 * weight on every plan; on the free plan the names and the birth date are disabled with «Plan completo», which opens the plan's
 * notice (the server refuses them anyway). When the height or the weight changes, the box «Anotarlo también como medida de hoy»
 * also writes a growth measurement. A birth date after records already written down is refused with their dates. Phone and web
 * are separate designs (useIsDesktop), like every form page.
 */
export function EditChildPage() {
  const { childId = '' } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const { isDesktop: desktop } = useSidebarSession()
  const variant = desktop ? 'desktop' : 'phone'
  const accountQuery = useCurrentAccount()
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const access = childAccessOf(accountQuery.data, child)
  const freeIdentity = (child?.plan ?? accountQuery.data?.plan ?? 'free') !== 'paid'
  const save = useUpdateChild(childId)

  const [initial, setInitial] = useState<ChildValues>(EMPTY)
  const [values, setValues] = useState<ChildValues>(EMPTY)
  const [measure, setMeasure] = useState(false)
  const [errors, setErrors] = useState<ChildErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const planRef = useRef<HTMLButtonElement>(null)

  const loaded = useRef(false)
  useEffect(() => {
    if (child && !loaded.current) {
      loaded.current = true
      const v = valuesOf(child)
      setInitial(v)
      setValues(v)
    }
  }, [child])

  const dirty = isDirty(initial, values)
  const offerMeasure = measuresChanged(initial, values)
  const measuring = measure && offerMeasure
  useUnsavedWork(dirty && !save.isSuccess)
  const backTo = `/children/${childId}`
  const leave = (e: { preventDefault: () => void }) => {
    if (dirty && !window.confirm(CHILD_PROFILE.leaveConfirm)) e.preventDefault()
  }
  const set = (field: keyof ChildValues, value: string) => setValues((v) => ({ ...v, [field]: value }))
  const today = localToday()

  const submit = () => {
    const found = validate(values, today, measuring)
    setErrors(found)
    setMessage(null)
    setConflict(null)
    if (Object.keys(found).length > 0) return
    if (freeIdentity && identityChanged(initial, values)) {
      setPlanOpen(true)
      return
    }
    save.mutate(toBody(values, measuring, today), {
      onSuccess: () => navigate(backTo, { replace: true }),
      onError: (e) => {
        if (!(e instanceof ChildProfileApiError)) return setMessage(CHILD_PROFILE.saveFailed)
        if (e.kind === 'validation_error' && e.details?.length) setErrors(errorsFromServer(e.details))
        else if (e.kind === 'birth_date_conflict' && e.conflict) setConflict(conflictLine(e.conflict))
        else if (e.kind === 'plan_required') setPlanOpen(true)
        else if (e.kind === 'limit') setMessage(CHILD_PROFILE.limitReached)
        else setMessage(CHILD_PROFILE.saveFailed)
      },
    })
  }

  const field = (id: string, key: keyof ChildValues, text: string, opts: { disabled?: boolean; type?: string; optional?: boolean; decimal?: boolean } = {}) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={label}>
        {text}
        {opts.optional && <span className="font-medium text-muted"> {CHILD_PROFILE.optional}</span>}
      </label>
      <input
        id={id}
        type={opts.type ?? 'text'}
        inputMode={opts.decimal ? 'decimal' : undefined}
        max={opts.type === 'date' ? today : undefined}
        maxLength={opts.decimal ? 6 : opts.type === 'date' ? undefined : 100}
        disabled={opts.disabled}
        value={values[key]}
        onChange={(e) => set(key, opts.decimal ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value)}
        className={`${fieldCabinet} ${opts.type === 'date' ? 'appearance-none' : ''} disabled:cursor-not-allowed disabled:bg-hint disabled:text-body`}
        aria-invalid={!!errors[key]}
        aria-describedby={key === 'birthDate' && conflict ? 'child-conflict' : undefined}
      />
      {errors[key] && <p className={errorText}>{errors[key]}</p>}
    </div>
  )

  const identityNote = freeIdentity && (
    <div className="flex flex-col gap-2">
      {access.role === 'owner' ? (
        <button
          ref={planRef}
          type="button"
          onClick={() => setPlanOpen(true)}
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border-[1.5px] border-hint-border bg-surface px-4 py-3 text-left text-[14px] leading-normal text-body"
        >
          <span>{CHILD_PROFILE.identityPlan}</span>
          <span className={badge}>{CHILD_PROFILE.planBadge}</span>
        </button>
      ) : (
        <p className="text-[14px] leading-normal text-body">{CHILD_PROFILE.identityFamilyPlan}</p>
      )}
    </div>
  )

  const form = (
    <div className="flex flex-col gap-[18px]">
      {identityNote}
      <div className={desktop ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-[18px]'}>
        {field('child-first-name', 'firstName', CHILD_PROFILE.firstName, { disabled: freeIdentity })}
        {field('child-last-name', 'lastName', CHILD_PROFILE.lastName, { disabled: freeIdentity })}
      </div>
      {field('child-birth-date', 'birthDate', CHILD_PROFILE.birthDate, { disabled: freeIdentity, type: 'date' })}
      {conflict && (
        <p id="child-conflict" role="alert" className={notice}>
          {conflict}
        </p>
      )}
      <p className="text-[14px] leading-normal text-body">{CHILD_PROFILE.measuresIntro}</p>
      <div className="grid grid-cols-2 gap-3">
        {field('child-height', 'height', CHILD_PROFILE.height, { optional: true, decimal: true })}
        {field('child-weight', 'weight', CHILD_PROFILE.weight, { optional: true, decimal: true })}
      </div>
      {offerMeasure && (
        <label htmlFor="child-measure" className={`flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-2xl border-[1.5px] border-hint-edge bg-surface ${desktop ? 'p-5' : 'p-4'}`}>
          <input
            id="child-measure"
            type="checkbox"
            checked={measure}
            onChange={(e) => setMeasure(e.target.checked)}
            aria-labelledby="child-measure-title"
            aria-describedby="child-measure-help"
            className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer accent-action"
          />
          <span className="flex min-w-0 flex-col gap-1">
            <span id="child-measure-title" className="text-[15px] font-extrabold text-ink">
              {CHILD_PROFILE.alsoMeasurement}
            </span>
            <span id="child-measure-help" className="text-[13px] font-semibold text-body">
              {CHILD_PROFILE.alsoMeasurementHint}
            </span>
          </span>
        </label>
      )}
      {errors.measurement && <p className={errorText}>{errors.measurement}</p>}
    </div>
  )

  const saveButton = (
    <button type="button" disabled={save.isPending} onClick={submit} className={`${pageHeaderButton('primary', variant)} disabled:cursor-not-allowed disabled:opacity-60`}>
      {save.isPending ? CHILD_PROFILE.saving : CHILD_PROFILE.save}
    </button>
  )

  const body = !child ? (
    <p className="text-[15px] text-body">{CHILD_PROFILE.notFound}</p>
  ) : !access.canAdd ? (
    <p className="text-[15px] leading-normal text-body">{CHILD_PROFILE.readOnly}</p>
  ) : (
    <>
      {message && (
        <p role="alert" className={notice}>
          {message}
        </p>
      )}
      {form}
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
            {CHILD_PROFILE.cancel}
          </button>
          {saveButton}
        </StickyActionBar>
      ) : (
        <StickyActionBar variant="phone">{saveButton}</StickyActionBar>
      )}
    </>
  )

  return (
    <RoutinePageFrame
      isDesktop={desktop}
      childId={childId}
      backLabel={`← ${child?.firstName ?? CHILD_PROFILE.back}`}
      backTo={backTo}
      backOnClick={leave}
      title={CHILD_PROFILE.title}
      subtitle={child ? `${child.firstName} ${child.lastName}` : undefined}
      maxWidth="max-w-[640px]"
      state={accountQuery.isError ? 'error' : accountQuery.isPending ? 'loading' : undefined}
      errorWhat={CHILD_PROFILE.loadFailed}
      onRetry={() => void accountQuery.refetch()}
    >
      {body}
      {planOpen && <FreemiumLimitModal reason="child_identity" opener={planRef} onStayFree={() => setPlanOpen(false)} onViewPlans={() => navigate('/planes')} />}
    </RoutinePageFrame>
  )
}
