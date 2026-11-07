import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { blobToBase64, shrinkPhoto } from '../consultations/shrinkPhoto'
import { useOcrSuggestion } from '../consultations/useOcrSuggestion'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { fieldCabinet, fieldCabinetProposed } from '../../shared/ui/formStyles'
import { StickyActionBar } from '../../shared/ui/StickyActionBar'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { CabinetApiError } from './api'
import { cabinetAccess } from './cabinetAccess'
import { EMPTY_VALUES, applyProposal, isDirty, toInput, validate, valuesOf, yearOptions, type CabinetErrors, type CabinetValues, type ProposedField } from './cabinetForm'
import { CABINET, MONTHS, fromConsultation, unitLabel } from './cabinetText'
import { useCabinetItem, useCabinetPhoto, useSaveCabinetItem } from './hooks'
import { parseMedicineText } from './parseMedicineText'
import { CABINET_UNITS, type FromConsultation } from './types'

type PhotoState = 'none' | 'reading' | 'read' | 'noText' | 'saved'

const label = 'text-[14px] font-bold text-ink'
const optional = <span className="font-medium text-muted"> {CABINET.optional}</span>
const tag = (text: string) => <span className="rounded-full border border-hint-border bg-hint px-[9px] py-0.5 text-[12px] font-extrabold text-action">{text}</span>
const errorText = 'text-[13px] font-semibold text-red-700'
const outline = 'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[14px] border-2 border-action px-3 text-[15px] font-extrabold text-action hover:bg-hint'
const textButton = 'min-h-11 cursor-pointer self-start text-[15px] font-extrabold text-action hover:underline'

/**
 * `/botiquin/nuevo` and `/botiquin/:itemId/editar` (specs/062, mock pantalla 3): the medicine as a page. The box's photo is optional;
 * with one, the text is read **in the phone** and only PROPOSES the name, the strength and the expiry date (marked «Leído de tu foto»,
 * never over what the parent wrote, never the quantity) — nothing is saved until «Guardar». From a consultation the name comes from
 * the prescription (the router's state, never the address). Leaving with something typed asks first.
 */
export function CabinetFormPage() {
  const { itemId } = useParams<{ itemId: string }>()
  const editing = !!itemId
  const location = useLocation()
  const fromRx = (location.state as { fromConsultation?: FromConsultation } | null)?.fromConsultation
  const navigate = useNavigate()
  const { isDesktop } = useSidebarSession()
  const desktop = isDesktop
  const variant = desktop ? 'desktop' : 'phone'
  const accountQuery = useCurrentAccount()
  const access = cabinetAccess(accountQuery.data)
  const ownerId = access.ownerId ?? ''
  const itemQuery = useCabinetItem(editing ? access.ownerId : undefined, itemId)
  const savedPhoto = useCabinetPhoto(access.ownerId, itemId, editing && !!itemQuery.data?.hasPhoto)
  const save = useSaveCabinetItem(ownerId, itemId)
  const ocr = useOcrSuggestion()

  const startValues = fromRx ? { ...EMPTY_VALUES, name: fromRx.name } : EMPTY_VALUES
  const [initial, setInitial] = useState<CabinetValues>(startValues)
  const [values, setValues] = useState<CabinetValues>(startValues)
  const [proposed, setProposed] = useState<ProposedField[]>([])
  const [errors, setErrors] = useState<CabinetErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [photoRemoved, setPhotoRemoved] = useState(false)
  const [photo, setPhoto] = useState<PhotoState>('none')
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)

  // Editing: the saved values arrive once.
  const loaded = useRef(false)
  useEffect(() => {
    if (itemQuery.data && !loaded.current) {
      loaded.current = true
      const v = valuesOf(itemQuery.data)
      setInitial(v)
      setValues(v)
      if (itemQuery.data.hasPhoto) setPhoto('saved')
    }
  }, [itemQuery.data])

  // The reading of a new photo finished: propose what it found into the fields still empty at that moment.
  const valuesRef = useRef(values)
  useEffect(() => {
    valuesRef.current = values
  })
  const reading = ocr.isRunning
  const wasReading = useRef(false)
  useEffect(() => {
    if (reading) {
      wasReading.current = true
      return
    }
    if (!wasReading.current) return
    wasReading.current = false
    const { values: next, proposed: filled } = applyProposal(valuesRef.current, parseMedicineText(ocr.suggestion))
    setValues(next)
    setProposed(filled)
    setPhoto(filled.length > 0 ? 'read' : 'noText')
  }, [reading, ocr.suggestion])

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  const dirty = isDirty(values, initial) || !!file || photoRemoved
  useUnsavedWork(dirty && !save.isSuccess)

  const backTo = fromRx ? `/consultations/${fromRx.consultationId}` : editing ? `/botiquin/${itemId}` : '/botiquin'
  const backLabel = fromRx ? CABINET.backConsultation : CABINET.backCabinet
  const leave = (e: { preventDefault: () => void }) => {
    if (dirty && !window.confirm(CABINET.leaveConfirm)) e.preventDefault()
  }

  const set = (field: keyof CabinetValues, value: string) => {
    setValues((v) => ({ ...v, [field]: value }))
    const owner: ProposedField | undefined = field === 'name' ? 'name' : field === 'strength' ? 'strength' : ['month', 'year', 'day'].includes(field) ? 'expires' : undefined
    if (owner) setProposed((p) => p.filter((f) => f !== owner))
  }

  const choose = (picked: File | undefined) => {
    if (!picked) return
    setFile(picked)
    setPhotoRemoved(false)
    setPreview(URL.createObjectURL(picked))
    setPhoto('reading')
    void ocr.runOcr(picked)
  }

  const submit = async () => {
    const found = validate(values)
    setErrors(found)
    setNotice(null)
    if (Object.keys(found).length > 0) return
    const input = toInput(values)
    if (file) input.photoBase64 = await blobToBase64(await shrinkPhoto(file))
    else if (editing && photoRemoved) input.photoBase64 = ''
    save.mutate(input, {
      onSuccess: (saved) => navigate(`/botiquin/${saved.id}`, { replace: true }),
      onError: (e) => {
        if (e instanceof CabinetApiError && e.kind === 'plan_required') setPlanOpen(true)
        else if (e instanceof CabinetApiError && e.kind === 'limit') setNotice(CABINET.limitReached)
        else if (e instanceof CabinetApiError && e.kind === 'validation_error' && e.details?.length) {
          const fromServer: CabinetErrors = {}
          for (const d of e.details) fromServer[d.field as keyof CabinetErrors] = d.message
          setErrors(fromServer)
        } else setNotice(CABINET.saveFailed)
      },
    })
  }

  const isProposed = (f: ProposedField) => proposed.includes(f)
  const fieldTag = (f: ProposedField) => (isProposed(f) ? tag(CABINET.readTag) : f === 'name' && fromRx && values.name === fromRx.name ? tag(CABINET.recipeTag) : null)
  const fieldClass = (f: ProposedField) => (isProposed(f) || (f === 'name' && fromRx && values.name === fromRx.name) ? fieldCabinetProposed : fieldCabinet)
  const head = (text: ReactNode, f?: ProposedField, id?: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      {f && fieldTag(f)}
    </div>
  )

  const photoBox = (() => {
    const src = preview ?? (photo === 'saved' && savedPhoto.data ? `data:image/jpeg;base64,${savedPhoto.data.photoBase64}` : null)
    if (photo === 'none' || photoRemoved)
      return (
        <div className="flex flex-col gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-hint-border bg-surface p-4">
          <span className="text-[14px] leading-normal text-body">{desktop ? CABINET.photoHelpWeb : CABINET.photoHelpPhone}</span>
          {desktop ? (
            <button type="button" onClick={() => galleryRef.current?.click()} className={`${outline} self-start px-5`}>
              {CABINET.choosePhoto}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => cameraRef.current?.click()} className={outline}>
                {CABINET.takePhoto}
              </button>
              <button type="button" onClick={() => galleryRef.current?.click()} className={outline}>
                {CABINET.galleryPhoto}
              </button>
            </div>
          )}
        </div>
      )
    const read = photo === 'read'
    return (
      <div aria-live="polite" className={`flex items-start gap-3.5 rounded-[18px] border-[1.5px] p-3.5 ${read ? 'border-action bg-hint' : photo === 'noText' ? 'border-calendar-muted bg-surface' : 'border-hint-border bg-surface'}`}>
        <span className="h-24 w-[72px] flex-none overflow-hidden rounded-xl border border-hint-border bg-hint">{src && <img src={src} alt={CABINET.photoLabel} className="h-full w-full object-cover" />}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {photo === 'reading' && (
            <>
              <span className="text-[16px] font-extrabold text-ink">{CABINET.readingTitle}</span>
              <span className="text-[14px] leading-normal text-body">{desktop ? CABINET.readingWeb : CABINET.readingPhone}</span>
              <div role="progressbar" aria-label={CABINET.readingTitle} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ocr.progress * 100)} className="mt-1 h-1.5 overflow-hidden rounded-full bg-hint-edge">
                <div className="h-full rounded-full bg-action" style={{ width: `${Math.max(8, Math.round(ocr.progress * 100))}%` }} />
              </div>
            </>
          )}
          {read && (
            <>
              <span className="text-[16px] font-extrabold text-ink">{CABINET.readTitle}</span>
              <span className="text-[14px] leading-normal text-body">{desktop ? CABINET.readWeb : CABINET.readPhone}</span>
            </>
          )}
          {photo === 'noText' && (
            <>
              <span className="text-[16px] font-extrabold text-ink">{CABINET.noTextTitle}</span>
              <span className="text-[14px] leading-normal text-body">{CABINET.noTextBody}</span>
            </>
          )}
          <div className="flex flex-wrap gap-x-4">
            <button type="button" onClick={() => galleryRef.current?.click()} className={textButton}>
              {CABINET.changePhoto}
            </button>
            {photo === 'saved' && (
              <button type="button" onClick={() => setPhotoRemoved(true)} className={textButton}>
                {CABINET.removePhoto}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  })()

  const photoSection = (
    <section aria-label={CABINET.photoLabel} className="flex flex-col gap-2.5">
      <span className={label}>
        {CABINET.photoLabel}
        {optional}
      </span>
      {photoBox}
      {errors.photoBase64 && <p className={errorText}>{errors.photoBase64}</p>}
      {/* Without `capture` the phone offers the library too; only «Tomar foto» goes to the camera (the gallery always works). */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden data-testid="cabinet-camera" onChange={(e) => choose(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden data-testid="cabinet-gallery" onChange={(e) => choose(e.target.files?.[0])} />
    </section>
  )

  const select = (id: string, value: string, onChange: (v: string) => void, options: { value: string; label: string }[], placeholder: string, f: ProposedField) => (
    <span className="relative flex">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${fieldClass(f)} cursor-pointer appearance-none pr-8`}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {/* The mock's ▾: appearance-none takes the native arrow away. */}
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-action">
        ▾
      </span>
    </span>
  )

  const fields = (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        {head(CABINET.name, 'name', 'cabinet-name')}
        <input id="cabinet-name" value={values.name} maxLength={120} placeholder={CABINET.namePlaceholder} onChange={(e) => set('name', e.target.value)} className={fieldClass('name')} aria-invalid={!!errors.name} />
        {errors.name && <p className={errorText}>{errors.name}</p>}
      </div>
      <div className={desktop ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-[18px]'}>
        <div className="flex flex-col gap-1.5">
          {head(
            <>
              {CABINET.strength}
              {optional}
            </>,
            'strength',
            'cabinet-strength',
          )}
          <input id="cabinet-strength" value={values.strength} maxLength={60} placeholder={CABINET.strengthPlaceholder} onChange={(e) => set('strength', e.target.value)} className={fieldClass('strength')} />
          {errors.strength && <p className={errorText}>{errors.strength}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cabinet-quantity" className={label}>
            {CABINET.quantity}
          </label>
          <div className={`flex gap-2 ${desktop ? 'flex-col' : 'items-center'}`}>
            {/* The field is `w-full` inside its own 96 px box on the phone: with both widths on the input the unit chips got squeezed to nothing and overlapped. */}
            <div className={desktop ? '' : 'w-24 flex-none'}>
              <input
                id="cabinet-quantity"
                inputMode="numeric"
                value={values.quantity}
                placeholder="0"
                onChange={(e) => set('quantity', e.target.value.replace(/\D/g, '').slice(0, 3))}
                className={fieldCabinet}
                aria-invalid={!!errors.quantity}
              />
            </div>
            <div role="group" aria-label={CABINET.unit} className="grid flex-1 grid-cols-2 gap-1.5">
              {CABINET_UNITS.map((u) => {
                const on = values.unit === u
                return (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('unit', on ? '' : u)}
                    className={`min-h-11 cursor-pointer rounded-xl border-[1.5px] px-2 text-[14px] font-extrabold ${on ? 'border-ink bg-ink text-white' : 'border-calendar-muted bg-surface text-ink'}`}
                  >
                    {unitLabel(u)}
                  </button>
                )
              })}
            </div>
          </div>
          {errors.quantity && <p className={errorText}>{errors.quantity}</p>}
          {errors.unit && <p className={errorText}>{errors.unit}</p>}
        </div>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className={label}>{CABINET.expires}</span>
          {fieldTag('expires')}
        </legend>
        <div className={desktop ? 'grid grid-cols-[repeat(3,160px)] gap-2' : 'grid grid-cols-3 gap-2'}>
          <div className="flex flex-col gap-1">
            <label htmlFor="cabinet-month" className="text-[12px] font-bold text-muted">
              {CABINET.month}
            </label>
            {select('cabinet-month', values.month, (v) => set('month', v), MONTHS.map((m, i) => ({ value: String(i + 1), label: m })), CABINET.month, 'expires')}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cabinet-year" className="text-[12px] font-bold text-muted">
              {CABINET.year}
            </label>
            {select('cabinet-year', values.year, (v) => set('year', v), yearOptions(new Date(), values.year).map((y) => ({ value: String(y), label: String(y) })), CABINET.year, 'expires')}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cabinet-day" className="text-[12px] font-bold text-muted">
              {CABINET.day}
            </label>
            {select('cabinet-day', values.day, (v) => set('day', v), Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })), '—', 'expires')}
          </div>
        </div>
        {errors.expires && <p className={errorText}>{errors.expires}</p>}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cabinet-note" className={label}>
          {CABINET.note}
          {optional}
        </label>
        <textarea
          id="cabinet-note"
          value={values.note}
          maxLength={500}
          placeholder={CABINET.notePlaceholder}
          onChange={(e) => set('note', e.target.value)}
          className="min-h-[88px] w-full min-w-0 rounded-[14px] border-[1.5px] border-calendar-muted bg-surface px-3.5 py-3.5 text-base leading-normal text-ink placeholder:text-calendar-muted focus:border-2 focus:border-ink focus:outline-none"
        />
        {errors.note && <p className={errorText}>{errors.note}</p>}
      </div>
    </div>
  )

  const saveButton = (
    <button ref={saveRef} type="button" disabled={save.isPending} onClick={() => void submit()} className={`${pageHeaderButton('primary', variant)} disabled:cursor-not-allowed disabled:opacity-60`}>
      {save.isPending ? CABINET.saving : editing ? CABINET.saveEdit : CABINET.save}
    </button>
  )
  const origin = fromRx && fromConsultation(fromRx.consultDate, fromRx.doctor)

  return (
    <RoutinePageFrame
      isDesktop={desktop}
      childId={undefined}
      backLabel={backLabel}
      backTo={backTo}
      backOnClick={leave}
      title={editing ? CABINET.editTitle : CABINET.formTitle}
      state={editing && itemQuery.isError ? 'error' : editing && itemQuery.isPending ? 'loading' : undefined}
      errorWhat={CABINET.loadFailed}
      onRetry={() => void itemQuery.refetch()}
    >
      {origin && (
        <div role="note" className="rounded-2xl border-[1.5px] border-hint-border bg-hint px-4 py-3.5 text-[14px] leading-normal text-body">
          <strong className="text-ink">{origin.lead}</strong>
          {origin.rest}
        </div>
      )}
      {notice && (
        <p role="alert" className="rounded-2xl border-[1.5px] border-hint-border bg-surface px-4 py-3.5 text-[14px] leading-normal text-body">
          {notice}
        </p>
      )}
      {desktop ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-[300px_minmax(0,560px)] gap-8">
            {photoSection}
            {fields}
          </div>
          <StickyActionBar variant="desktop">
            <button
              type="button"
              onClick={(e) => {
                leave(e)
                if (!e.defaultPrevented) navigate(backTo)
              }}
              className={pageHeaderButton('secondary', 'desktop')}
            >
              {CABINET.cancel}
            </button>
            {saveButton}
          </StickyActionBar>
        </div>
      ) : (
        <>
          {photoSection}
          {fields}
          <StickyActionBar variant="phone">{saveButton}</StickyActionBar>
        </>
      )}
      {planOpen && <FreemiumLimitModal reason="medicine_cabinet" opener={saveRef} onStayFree={() => setPlanOpen(false)} onViewPlans={() => navigate('/planes')} />}
    </RoutinePageFrame>
  )
}
