import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { StickyActionBar } from '../../shared/ui/StickyActionBar'
import { useDiscardGuard } from '../../shared/ui/useDiscardGuard'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { ChildRecordApiError } from './api'
import { useChildRecord, useSaveChildRecord } from './hooks'
import { NewVersionDialog } from './NewVersionDialog'
import { BloodPills, CompactRows, ItemFieldset, KindPills, ListHeading, TextField, dashedAdd, formCard } from './RecordFormParts'
import { EMPTY_VALUES, errorsFromServer, isDirty, toInput, validate, valuesOf, type RecordErrors, type RecordFormValues } from './recordForm'
import { FORM, conflictBody, conflictTitle, countOf, limitNote, moreLine } from './recordText'
import { LIMITS, type ChildRecord } from './types'

const notice = 'rounded-2xl border-[1.5px] border-hint-border bg-surface px-4 py-3.5 text-[14px] leading-normal text-body'

/**
 * `/children/:childId/ficha/editar` (specs/073, mock «Ficha del hijo PediTrack» D, D2 and E): the whole record in one form — each
 * allergy and condition a `fieldset` with real labels, option pills of 44 px, «Subir»/«Bajar» with an accessible name, «Quitar» as
 * text — in two designs (phone: one column and a bar with «Cancelar»/«Guardar» pinned at the bottom; web: two columns and the
 * buttons in the header). If somebody else saved meanwhile (409) a notice says who and when, nothing typed is lost, «Ver la versión
 * nueva» opens theirs apart and the next save is made on top of it. Only who can edit reaches the form.
 */
export function EditChildRecordPage() {
  const { childId = '' } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const { isDesktop: desktop } = useSidebarSession()
  const variant = desktop ? 'desktop' : 'phone'
  const accountQuery = useCurrentAccount()
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const recordQuery = useChildRecord(childId)
  const record = recordQuery.data
  const save = useSaveChildRecord(childId)

  const form = useForm<RecordFormValues>({ defaultValues: EMPTY_VALUES })
  const { register, control, setValue, getValues } = form
  const allergies = useFieldArray({ control, name: 'allergies' })
  const conditions = useFieldArray({ control, name: 'conditions' })
  const values = form.watch()

  const [initial, setInitial] = useState<RecordFormValues>(EMPTY_VALUES)
  const [baseVersion, setBaseVersion] = useState(0)
  const [errors, setErrors] = useState<RecordErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ChildRecord | null>(null)
  const [viewing, setViewing] = useState(false)
  const [expanded, setExpanded] = useState({ allergy: false, condition: false })
  const viewRef = useRef<HTMLButtonElement>(null)

  const loaded = useRef(false)
  useEffect(() => {
    if (record && !loaded.current) {
      loaded.current = true
      const v = valuesOf(record)
      setInitial(v)
      setBaseVersion(record.version)
      form.reset(v)
    }
  }, [record, form])

  const dirty = isDirty(initial, values)
  useUnsavedWork(dirty && !save.isSuccess)
  const backTo = `/children/${childId}`
  const guard = useDiscardGuard({ isDirty: () => dirty && !save.isSuccess, title: FORM.leaveTitle, body: FORM.leaveBody })
  const leave = (e: { preventDefault: () => void; currentTarget?: EventTarget | null }) => guard.guardLink(e, backTo)

  const submit = () => {
    const found = validate(getValues())
    setErrors(found)
    setMessage(null)
    if (Object.keys(found).length > 0) return
    save.mutate(toInput(getValues(), baseVersion), {
      onSuccess: () => navigate(backTo, { replace: true }),
      onError: (e) => {
        if (!(e instanceof ChildRecordApiError)) return setMessage(FORM.saveFailed)
        if (e.kind === 'conflict' && e.current) {
          // What was typed stays; the next save is made on top of the version that is now saved.
          setConflict(e.current)
          setBaseVersion(e.current.version)
        } else if (e.kind === 'validation_error' && e.details?.length) setErrors(errorsFromServer(e.details))
        else setMessage(FORM.saveFailed)
      },
    })
  }

  const errorOf = (path: string) => errors[path]

  const list = (kind: 'allergy' | 'condition') => {
    const isAllergy = kind === 'allergy'
    const array = isAllergy ? allergies : conditions
    const key = isAllergy ? 'allergies' : 'conditions'
    const items = values[key]
    const full = array.fields.length >= LIMITS.items
    const compact = full && !expanded[kind]
    const open = () => setExpanded((e) => ({ ...e, [kind]: true }))
    return (
      <section aria-label={isAllergy ? 'Alergias' : 'Padecimientos o condiciones permanentes'} className={formCard}>
        <ListHeading title={isAllergy ? 'Alergias' : 'Padecimientos o condiciones permanentes'} count={countOf(array.fields.length, LIMITS.items)} />
        {full && (
          <p role="note" className="rounded-[14px] border-[1.5px] border-hint-border bg-hint px-3.5 py-3 text-[14px] leading-normal text-ink">
            {limitNote(kind, LIMITS.items)}
          </p>
        )}
        {compact ? (
          <CompactRows
            names={items.slice(0, 2).map((i) => i.name)}
            more={moreLine(kind, array.fields.length - 2)}
            seeAll={FORM.seeAll(array.fields.length)}
            onOpen={open}
          />
        ) : (
          array.fields.map((field, i) => (
            <ItemFieldset key={field.id} kind={kind} index={i} count={array.fields.length} onMove={(d) => array.move(i, i + d)} onRemove={() => array.remove(i)}>
              <TextField
                id={`${key}-${i}-name`}
                label={isAllergy ? FORM.allergy : FORM.condition}
                registration={register(`${key}.${i}.name`)}
                error={errorOf(`${key}.${i}.name`)}
                value={items[i]?.name ?? ''}
                max={LIMITS.name}
              />
              {isAllergy && (
                <KindPills
                  name={`allergy-kind-${i}`}
                  value={values.allergies[i]?.kind ?? ''}
                  onChange={(v) => setValue(`allergies.${i}.kind`, v, { shouldDirty: true })}
                />
              )}
              <TextField
                id={`${key}-${i}-note`}
                label={FORM.note}
                registration={register(`${key}.${i}.note`)}
                error={errorOf(`${key}.${i}.note`)}
                value={items[i]?.note ?? ''}
                max={LIMITS.note}
              />
            </ItemFieldset>
          ))
        )}
        {!full && (
          <button
            type="button"
            className={dashedAdd}
            onClick={() => (isAllergy ? allergies.append({ name: '', kind: '', note: '' }) : conditions.append({ name: '', note: '' }))}
          >
            {isAllergy ? FORM.addAllergy : FORM.addCondition}
          </button>
        )}
      </section>
    )
  }

  const blood = (
    <section aria-label="Tipo de sangre" className={formCard}>
      <ListHeading title="Tipo de sangre" count="" />
      <BloodPills name="blood-type" value={values.bloodType} onChange={(v) => setValue('bloodType', v, { shouldDirty: true })} />
      <span className="text-[13px] leading-[1.45] text-body">{FORM.bloodHint}</span>
    </section>
  )
  const pediatrician = (
    <section aria-label="Pediatra de cabecera" className={formCard}>
      <ListHeading title="Pediatra de cabecera" count="" />
      <TextField id="ped-name" label={FORM.name} registration={register('pedName')} error={errorOf('pedName')} value={values.pedName} max={LIMITS.pediatricianName} />
      <TextField id="ped-phone" label={FORM.phone} type="tel" registration={register('pedPhone')} error={errorOf('pedPhone')} value={values.pedPhone} max={LIMITS.phone} />
      <TextField id="ped-office" label={FORM.office} registration={register('pedOffice')} error={errorOf('pedOffice')} value={values.pedOffice} max={LIMITS.office} />
    </section>
  )
  const note = (
    <section aria-label="Nota general" className={formCard}>
      <ListHeading title="Nota general" count="" />
      <TextField id="general-note" label={FORM.note} rows={4} counter registration={register('generalNote')} error={errorOf('generalNote')} value={values.generalNote} max={LIMITS.generalNote} />
    </section>
  )

  const conflictNotice = conflict && (
    <div role="status" className="flex flex-col gap-2 rounded-[22px] border-[1.5px] border-hint-border bg-hint px-[18px] py-4">
      <p className="text-[17px] font-extrabold text-ink">{conflictTitle(conflict.updated?.by ?? null)}</p>
      <p className="text-[15px] leading-[1.55] text-body">{conflictBody(conflict.updated?.by ?? null, conflict.updated?.at ?? null)}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button ref={viewRef} type="button" onClick={() => setViewing(true)} className={pageHeaderButton('edit', variant)}>
          {FORM.seeNewVersion}
        </button>
        <button type="button" onClick={() => setConflict(null)} className="min-h-11 cursor-pointer px-3 text-[15px] font-extrabold text-action">
          {FORM.keepEditing}
        </button>
      </div>
    </div>
  )

  const cancel = (
    <button
      type="button"
      onClick={(e) => {
        leave(e)
        if (!e.defaultPrevented) navigate(backTo)
      }}
      className={pageHeaderButton('secondary', variant)}
    >
      {FORM.cancel}
    </button>
  )
  const saveButton = (
    <button type="button" disabled={save.isPending} onClick={submit} className={`${pageHeaderButton('primary', variant, { tall: true })} disabled:cursor-not-allowed disabled:opacity-60 ${desktop ? 'min-w-40' : 'flex-1'}`}>
      {save.isPending ? FORM.saving : FORM.save}
    </button>
  )

  const body = !child ? (
    <p className="text-[15px] text-body">{FORM.notFound}</p>
  ) : record && !record.canEdit ? (
    <p className="text-[15px] leading-normal text-body">{FORM.readOnly}</p>
  ) : !record ? (
    <p className="text-[15px] text-body">{recordQuery.isError ? FORM.loadError : FORM.loading}</p>
  ) : (
    <>
      {message && (
        <p role="alert" className={notice}>
          {message}
        </p>
      )}
      {conflictNotice}
      {desktop ? (
        <div className="grid grid-cols-2 items-start gap-6">
          <div className="flex flex-col gap-4">
            {list('allergy')}
            {list('condition')}
          </div>
          <div className="flex flex-col gap-4">
            {blood}
            {pediatrician}
            {note}
          </div>
        </div>
      ) : (
        <>
          {list('allergy')}
          {blood}
          {list('condition')}
          {pediatrician}
          {note}
          <StickyActionBar variant="phone">
            <div className="flex gap-2.5">
              {cancel}
              {saveButton}
            </div>
          </StickyActionBar>
        </>
      )}
    </>
  )

  return (
    <RoutinePageFrame
      isDesktop={desktop}
      childId={childId}
      backLabel={`← ${child?.firstName ?? 'Atrás'}`}
      backTo={backTo}
      backOnClick={leave}
      eyebrow={child ? `${child.firstName} ${child.lastName}` : undefined}
      title="Editar ficha"
      subtitle={FORM.subtitle}
      actions={desktop && record?.canEdit ? <>{cancel}{saveButton}</> : undefined}
      maxWidth="max-w-[904px]"
      phoneContent="gap-4 pt-0"
      state={accountQuery.isError ? 'error' : accountQuery.isPending ? 'loading' : undefined}
      errorWhat={FORM.loadFailed}
      onRetry={() => void accountQuery.refetch()}
    >
      {body}
      {viewing && conflict && <NewVersionDialog record={conflict} variant={variant} opener={viewRef} onClose={() => setViewing(false)} />}
      {guard.dialog}
    </RoutinePageFrame>
  )
}
