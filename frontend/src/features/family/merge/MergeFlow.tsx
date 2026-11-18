import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useCurrentAccount } from '../../auth/useCurrentAccount'
import { downloadMyData } from '../../account/api'
import { useDownload } from '../../account/useDownload'
import { namesText } from '../roles'
import { DifferencesStep } from './DifferencesStep'
import { MergeFrame, outlineButton, solidButton } from './MergeFrame'
import { PairsStep, type Selection } from './PairsStep'
import { FailedCard, MergedCard, MergingCard } from './ResultStep'
import { SummaryStep, type SummaryPair } from './SummaryStep'
import { MergeApiError } from './api'
import { useMergeChildren, useMergeOptions, usePreviewMerge } from './hooks'
import { DIFF, DONE, FIELD_LABELS, HOW, PAIRS, SUMMARY, diffStatus } from './mergeText'
import type { Choices, DifferenceField, MergeChild, MergePairPreview, MergePairRequest, MergePairResult, Side } from './types'

type Step = { kind: 'pairs' } | { kind: 'diff'; index: number } | { kind: 'summary' } | { kind: 'merging' } | { kind: 'done' } | { kind: 'failed' }

const isField = (f: string): f is DifferenceField => f in FIELD_LABELS

/**
 * `/familia/unir` (specs/074, mock B → C → D → E): pairs, the data that differ, the summary and the merge itself. Everything the
 * person chooses lives here, in memory (nothing is saved until «Unir»); the server decides again at the end. The options are
 * frozen once the merge starts: the merge changes what they read and the result screens still name the children.
 */
export function MergeFlow() {
  const [step, setStep] = useState<Step>({ kind: 'pairs' })
  const frozen = step.kind === 'merging' || step.kind === 'done' || step.kind === 'failed'
  const options = useMergeOptions(!frozen)
  const account = useCurrentAccount().data
  const preview = usePreviewMerge()
  const merge = useMergeChildren()
  const download = useDownload((token) => downloadMyData(account?.id ?? '', token))

  const [selection, setSelection] = useState<Selection | null>(null)
  const [previews, setPreviews] = useState<MergePairPreview[]>([])
  const [choices, setChoices] = useState<Record<string, Choices>>({})
  const [results, setResults] = useState<MergePairResult[]>([])
  const [previewError, setPreviewError] = useState<string | null>(null)

  const data = options.data
  const initial = useMemo<Selection>(() => {
    const out: Selection = {}
    for (const c of data?.ownChildren ?? []) out[c.id] = ''
    for (const s of data?.suggestedPairs ?? []) out[s.ownChildId] = s.familyChildId
    return out
  }, [data])
  const sel = selection ?? initial

  const ownById = new Map((data?.ownChildren ?? []).map((c) => [c.id, c]))
  const familyById = new Map((data?.familyChildren ?? []).map((c) => [c.id, c]))
  const owner = data?.familyOwnerFirstName ?? ''
  const pairList = (data?.ownChildren ?? []).filter((c) => sel[c.id]).map((c) => ({ ownChildId: c.id, familyChildId: sel[c.id] }))
  const diffPairs = previews.filter((p) => p.differences.some(isField))

  if (data && !frozen && (!data.canMerge || data.ownChildren.length === 0 || data.familyChildren.length === 0)) {
    return <Navigate to="/familia" replace />
  }

  const firstNames = (ids: string[]) => ids.map((id) => ownById.get(id)?.firstName ?? '').filter(Boolean)

  function toPairs() {
    setStep({ kind: 'pairs' })
  }

  function onContinuePairs() {
    setPreviewError(null)
    preview.mutate(pairList, {
      onSuccess: (list) => {
        setPreviews(list)
        const first = list.findIndex((p) => p.differences.some(isField))
        setStep(first >= 0 ? { kind: 'diff', index: 0 } : { kind: 'summary' })
      },
      onError: (e) => setPreviewError(e instanceof MergeApiError && e.kind === 'merge_not_allowed' ? PAIRS.notAllowed : PAIRS.failed),
    })
  }

  function runMerge(pairs: MergePairRequest[]) {
    setStep({ kind: 'merging' })
    merge.mutate(pairs, {
      onSuccess: (res) => {
        setResults((prev) => [...prev.filter((p) => p.status === 'merged'), ...res])
        setStep(res.some((r) => r.status === 'merged') ? { kind: 'done' } : { kind: 'failed' })
      },
      onError: () => setStep({ kind: 'failed' }),
    })
  }

  function requestFor(p: { ownChildId: string; familyChildId: string }): MergePairRequest {
    const pv = previews.find((x) => x.ownChildId === p.ownChildId)
    const own = choices[p.ownChildId] ?? {}
    const picked: Choices = {}
    for (const f of pv?.differences ?? []) if (isField(f) && own[f]) picked[f] = own[f]
    return { ownChildId: p.ownChildId, familyChildId: p.familyChildId, choices: picked }
  }

  function onUnir() {
    runMerge(previews.map((p) => requestFor(p)))
  }

  function onRetry() {
    const failedIds = new Set(results.filter((r) => r.status === 'failed').map((r) => r.ownChildId))
    const again = previews.filter((p) => failedIds.size === 0 || failedIds.has(p.ownChildId))
    runMerge(again.map((p) => requestFor(p)))
  }

  // ---- E1, E2, E3
  if (step.kind === 'merging') {
    const names = namesText(firstNames(previews.map((p) => p.ownChildId)))
    return (
      <MergeFrame bare title={DONE.merging(names)}>
        {() => <MergingCard names={names} />}
      </MergeFrame>
    )
  }
  if (step.kind === 'done') {
    const merged = results.filter((r) => r.status === 'merged')
    const failed = results.filter((r) => r.status === 'failed')
    const names = firstNames(merged.map((r) => r.ownChildId))
    const lines = merged.map((r) => {
      const body = DONE.mergedBody(owner, r.moves)
      return merged.length === 1 ? body : `${ownById.get(r.ownChildId)?.firstName}: ${body.charAt(0).toLowerCase()}${body.slice(1)}`
    })
    return (
      <MergeFrame
        bare
        title={DONE.merged(names)}
        actionsAlign="start"
        actions={
          <Link to="/home" replace className={solidButton}>
            {DONE.home}
          </Link>
        }
      >
        {() => <MergedCard names={names} lines={lines} failedLine={failed.length ? DONE.someFailed(firstNames(failed.map((r) => r.ownChildId))) : null} />}
      </MergeFrame>
    )
  }
  if (step.kind === 'failed') {
    return (
      <MergeFrame
        bare
        title={DONE.failedTitle}
        actionsAlign="start"
        actions={
          <>
            <button type="button" onClick={onRetry} className={solidButton}>
              {DONE.retry}
            </button>
            <button type="button" onClick={() => setStep({ kind: 'summary' })} className={outlineButton}>
              {DONE.backToSummary}
            </button>
          </>
        }
      >
        {() => <FailedCard />}
      </MergeFrame>
    )
  }

  // ---- the steps with a header
  const loadState = (
    <>
      {options.isPending && (
        <p role="status" className="text-[15px] font-semibold text-action">
          {HOW.loading}
        </p>
      )}
      {options.isError && (
        <div role="alert" className="flex flex-col items-start gap-3 text-[15px] text-body">
          <p>{HOW.loadFailed}</p>
          <button type="button" onClick={() => void options.refetch()} className={outlineButton}>
            {HOW.retry}
          </button>
        </div>
      )}
    </>
  )

  if (step.kind === 'pairs' || !data) {
    const pairs = pairList.length
    const unpaired = data ? data.ownChildren.length - pairs : 0
    return (
      <MergeFrame
        back={{ label: PAIRS.back, to: '/familia/como-seguir' }}
        eyebrow={PAIRS.eyebrow}
        title={PAIRS.title}
        wide
        status={data ? (pairs === 0 ? PAIRS.pickOne : PAIRS.summary(pairs, unpaired)) : undefined}
        actions={
          <button type="button" disabled={!data || pairs === 0 || preview.isPending} onClick={onContinuePairs} className={solidButton}>
            {preview.isPending ? PAIRS.checking : PAIRS.next}
          </button>
        }
      >
        {(variant) => (
          <>
            {loadState}
            {data && (
              <PairsStep
                options={data}
                selection={sel}
                variant={variant}
                onChange={(own, fam) => setSelection({ ...sel, [own]: fam })}
              />
            )}
            {previewError && (
              <p role="alert" className="text-[15px] font-semibold text-ink">
                {previewError}
              </p>
            )}
          </>
        )}
      </MergeFrame>
    )
  }

  if (step.kind === 'diff') {
    const pv = diffPairs[step.index]
    const own = pv && ownById.get(pv.ownChildId)
    const family = pv && familyById.get(pv.familyChildId)
    if (!pv || !own || !family) return <Navigate to="/familia" replace />
    const fields = pv.differences.filter(isField)
    const mine = choices[pv.ownChildId] ?? {}
    const done = fields.filter((f) => mine[f]).length
    const ready = done === fields.length
    const goNext = () => setStep(step.index + 1 < diffPairs.length ? { kind: 'diff', index: step.index + 1 } : { kind: 'summary' })
    const goBack = () => (step.index === 0 ? toPairs() : setStep({ kind: 'diff', index: step.index - 1 }))
    return (
      <MergeFrame
        key={pv.ownChildId}
        back={{ label: step.index === 0 ? DIFF.back : DIFF.backPrev, to: '#', onClick: (e) => { e.preventDefault(); goBack() } }}
        eyebrow={DIFF.eyebrow(own.firstName)}
        title={DIFF.title}
        status={ready ? undefined : diffStatus(done, fields.length)}
        actions={
          <button type="button" disabled={!ready} onClick={goNext} className={solidButton}>
            {DIFF.next}
          </button>
        }
      >
        {(variant) => (
          <DifferencesStep
            own={own}
            family={family}
            fields={fields}
            choices={mine}
            variant={variant}
            showListsNote={own.record.exists && family.record.exists}
            onChoose={(field: DifferenceField, side: Side) => setChoices({ ...choices, [pv.ownChildId]: { ...mine, [field]: side } })}
          />
        )}
      </MergeFrame>
    )
  }

  // summary
  const summaryPairs: SummaryPair[] = previews.flatMap((p) => {
    const own = ownById.get(p.ownChildId)
    const family = familyById.get(p.familyChildId)
    return own && family ? [{ preview: p, own, family }] : []
  })
  const pairedIds = new Set(previews.map((p) => p.ownChildId))
  const unpairedChildren: MergeChild[] = data.ownChildren.filter((c) => !pairedIds.has(c.id))
  const blocked = previews.some((p) => p.recordTooLong !== null)
  const working = download.state === 'working'
  const goBackFromSummary = () => (diffPairs.length > 0 ? setStep({ kind: 'diff', index: diffPairs.length - 1 }) : toPairs())
  return (
    <MergeFrame
      back={{ label: diffPairs.length > 0 ? SUMMARY.back : SUMMARY.backPairs, to: '#', onClick: (e) => { e.preventDefault(); goBackFromSummary() } }}
      eyebrow={SUMMARY.eyebrow}
      title={SUMMARY.title}
      actions={
        <>
          <button type="button" disabled={working} onClick={() => void download.start()} className={`${outlineButton} max-sm:px-3.5`}>
            {working ? SUMMARY.downloading : SUMMARY.download}
          </button>
          <button type="button" disabled={blocked} onClick={onUnir} className={`${solidButton} sm:min-w-[110px] max-sm:!flex-none max-sm:min-w-[110px] max-sm:px-5`}>
            {SUMMARY.merge}
          </button>
        </>
      }
    >
      {() => <SummaryStep pairs={summaryPairs} unpaired={unpairedChildren} ownerFirstName={owner} download={download} />}
    </MergeFrame>
  )
}
