import { useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useCurrentAccount } from '../../auth/useCurrentAccount'
import { ChoiceCard } from './ChoiceCard'
import { MergeFrame, cardClass, eyebrowClass, outlineButton, solidButton, type MergeVariant } from './MergeFrame'
import { HOW, KEPT } from './mergeText'
import { useMergeOptions, useSetHiddenChildren } from './hooks'
import type { MergeChild } from './types'

type Choice = 'merge' | 'hide' | 'keep'

function Names({ title, children }: { title: string; children: MergeChild[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className={eyebrowClass}>{title}</span>
      {children.map((c) => (
        <span key={c.id} className="text-[15px] font-extrabold text-ink">
          {c.firstName} {c.lastName}
        </span>
      ))}
    </div>
  )
}

/** A card of the kept state: ink circle, title, text and the line about joining later (F). */
function ResultCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className={`${cardClass} flex max-w-[558px] flex-col items-start gap-3.5 px-[22px] py-6`}>
      <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink text-white">
        {icon}
      </span>
      <h1 tabIndex={-1} className="text-2xl leading-[1.2] font-black tracking-[-0.02em] text-ink">
        {title}
      </h1>
      {children}
    </section>
  )
}

/**
 * `/familia/como-seguir` (specs/074, mock A, A2 and F): what a person with children of their own sees right after accepting a
 * family's invitation. Nothing is chosen at first and closing the screen is the same as «Conservar ambas». A Caregiver has no
 * «Unir» (they can't do everything in the family's children).
 */
export function HowToContinuePage() {
  const options = useMergeOptions()
  const account = useCurrentAccount().data
  const navigate = useNavigate()
  const hide = useSetHiddenChildren(account?.id ?? '')
  const [choice, setChoice] = useState<Choice | null>(null)
  const [kept, setKept] = useState(false)
  const [failed, setFailed] = useState(false)

  const data = options.data
  if (data && data.ownChildren.length === 0 && !kept) return <Navigate to="/home" replace />

  const owner = data?.familyOwnerFirstName ?? ''
  const canMerge = data?.canMerge ?? false

  function proceed() {
    if (!data || !choice) return
    setFailed(false)
    if (choice === 'merge') navigate('/familia/unir')
    else if (choice === 'keep') setKept(true)
    else
      hide.mutate(data.ownChildren.map((c) => c.id), {
        onSuccess: () => navigate('/home', { replace: true }),
        onError: () => setFailed(true),
      })
  }

  if (kept) {
    return (
      <MergeFrame
        bare
        title={KEPT.title}
        actionsAlign="start"
        actions={(variant) => (
          <>
            <Link to="/home" replace className={solidButton}>
              {KEPT.home}
            </Link>
            {variant === 'desktop' && (
              <Link to="/familia" className={outlineButton}>
                {KEPT.family}
              </Link>
            )}
          </>
        )}
      >
        {() => (
          <ResultCard
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="5" width="9" height="12" rx="2" />
                <rect x="11" y="8" width="9" height="12" rx="2" />
              </svg>
            }
            title={KEPT.title}
          >
            <p className="text-[15px] leading-[1.55] text-body">{KEPT.body}</p>
            <div className="flex w-full flex-col gap-1 border-t border-hint-edge pt-3">
              <span className="text-[15px] font-extrabold text-ink">{KEPT.laterTitle}</span>
              <span className="text-[15px] leading-normal text-body">{KEPT.later}</span>
            </div>
          </ResultCard>
        )}
      </MergeFrame>
    )
  }

  const options3: { value: Choice; title: string; body: string }[] = [
    ...(canMerge ? [{ value: 'merge' as const, ...HOW.merge }] : []),
    { value: 'hide', ...HOW.hide },
    { value: 'keep', ...(canMerge ? HOW.keep : HOW.keepCaregiver) },
  ]

  const busy = hide.isPending
  const next = (
    <button type="button" disabled={!choice || busy} onClick={proceed} className={solidButton}>
      {busy ? HOW.saving : HOW.next}
    </button>
  )

  return (
    <MergeFrame
      eyebrow={owner ? HOW.eyebrow(owner) : undefined}
      title={HOW.title}
      actions={next}
      status={choice ? undefined : HOW.pickToContinue}
    >
      {(variant: MergeVariant) => (
        <>
          {options.isPending && <p role="status" className="text-[15px] font-semibold text-action">{HOW.loading}</p>}
          {options.isError && (
            <div role="alert" className="flex flex-col items-start gap-3 text-[15px] text-body">
              <p>{HOW.loadFailed}</p>
              <button type="button" onClick={() => void options.refetch()} className={outlineButton}>
                {HOW.retry}
              </button>
            </div>
          )}
          {data && (
            <>
              <p className="max-w-[760px] text-[15px] leading-[1.55] text-body">{HOW.intro(owner)}</p>
              <div className={`${cardClass} ${variant === 'desktop' ? 'max-w-[760px] px-[18px] py-3.5' : 'px-4 py-3.5'}`}>
                <div className="grid grid-cols-2 gap-4">
                  <Names title={HOW.ownTitle}>{data.ownChildren}</Names>
                  <div className="border-l border-hint-edge pl-4">
                    <Names title={HOW.familyTitle(owner)}>{data.familyChildren}</Names>
                  </div>
                </div>
              </div>
              <fieldset className={`flex flex-col gap-3 ${variant === 'desktop' ? 'max-w-[760px]' : ''}`}>
                <legend className="mb-3 p-0 text-[13px] font-bold text-ink">{HOW.legend}</legend>
                {options3.map((o) => (
                  <ChoiceCard key={o.value} name="how-to-continue" checked={choice === o.value} onChange={() => setChoice(o.value)}>
                    <span className="text-[17px] leading-[1.3] font-extrabold text-ink">{o.title}</span>
                    <span className="text-[15px] leading-normal text-body">{o.body}</span>
                  </ChoiceCard>
                ))}
              </fieldset>
              {failed && (
                <p role="alert" className="text-[15px] font-semibold text-ink">
                  {HOW.hideFailed}
                </p>
              )}
            </>
          )}
        </>
      )}
    </MergeFrame>
  )
}
