import type { RefObject } from 'react'
import { ChildDayCard } from './ChildDayCard'
import { HOME, familyOf, sharedSubtitle } from './homeText'
import type { Account } from './types'

type Variant = 'phone' | 'desktop'

interface ChildrenSectionProps {
  account: Account
  variant: Variant
  canAddChild: boolean
  /** The free plan with its one child: «Tu plan incluye un hijo» under «+ Agregar hijo». */
  planNote: boolean
  onAddChild: () => void
  addChildButton: RefObject<HTMLButtonElement | null>
}

/**
 * The children of the home (specs/055, US1): the title, one `ChildDayCard` per child (a column on the phone, two columns on the
 * web), «+ Agregar hijo» for whoever may add, and the first-child block of a new account — the only solid button of the screen.
 */
export function ChildrenSection({ account, variant, canAddChild, planNote, onAddChild, addChildButton }: ChildrenSectionProps) {
  const desktop = variant === 'desktop'
  const children = account.children
  // Every child is somebody else's: the session only sees them through a family.
  const sharedOnly = children.length > 0 && children.every((c) => c.role !== undefined && c.role !== 'owner')
  const caregiver = sharedOnly && children.every((c) => c.role === 'caregiver')
  const title = sharedOnly ? HOME.sharedTitle : HOME.childrenTitle

  const addMore = canAddChild && children.length > 0 && (
    <button
      ref={addChildButton}
      type="button"
      onClick={onAddChild}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-hint-border text-[16px] font-extrabold text-action hover:bg-hint ${desktop ? 'min-h-[120px] gap-1' : 'min-h-14 gap-0.5 p-2'}`}
    >
      {HOME.addChildMore}
      {planNote && <span className="text-[13px] font-semibold text-body">{HOME.planIncludesOne}</span>}
    </button>
  )

  const firstChild = children.length === 0 && (
    <div
      className={`rounded-[22px] border-2 border-dashed border-hint-border ${desktop ? 'col-span-2 flex items-center gap-6 p-7' : 'flex flex-col gap-3 px-5 py-[22px]'}`}
    >
      <span className="flex flex-1 flex-col gap-1.5">
        <span className={`font-extrabold text-ink ${desktop ? 'text-[18px]' : 'text-[17px]'}`}>{HOME.noChildrenTitle}</span>
        <span className="text-[15px] leading-normal text-body">{HOME.noChildrenBody}</span>
      </span>
      {canAddChild && (
        <button
          ref={addChildButton}
          type="button"
          onClick={onAddChild}
          className={`min-h-[52px] shrink-0 cursor-pointer rounded-2xl bg-confirmed text-[17px] font-extrabold text-white hover:bg-emerald-800 ${desktop ? 'px-7' : ''}`}
        >
          {HOME.addChild}
        </button>
      )}
    </div>
  )

  return (
    <section aria-labelledby="home-children-title" className={`flex flex-col ${desktop ? 'gap-3.5' : 'gap-3'}`}>
      <div className={desktop ? 'flex items-baseline gap-3' : 'flex flex-col gap-0.5'}>
        <h2 id="home-children-title" className={`font-extrabold text-ink ${desktop ? 'text-[19px]' : 'text-[18px]'}`}>
          {title}
        </h2>
        {caregiver && account.family && (
          <span className={`text-body ${desktop ? 'text-[15px]' : 'text-[14px]'}`}>{sharedSubtitle(familyOf(account.family.ownerName))}</span>
        )}
      </div>
      <div className={desktop ? 'grid grid-cols-2 items-start gap-5' : 'flex flex-col gap-3'}>
        {children.map((child, index) => (
          <ChildDayCard key={child.id} child={child} variant={variant} index={index} />
        ))}
        {firstChild}
        {addMore}
      </div>
    </section>
  )
}

/** «Solo lectura.» for a Tutor of a family that stopped paying (specs/032): above the greeting, marking still works. */
export function ReadOnlyNote({ variant }: { variant: Variant }) {
  return (
    <div
      role="note"
      className={`rounded-2xl border-[1.5px] border-hint-border bg-surface text-body ${variant === 'desktop' ? 'px-[18px] py-3.5 text-[15px]' : 'px-4 py-3.5 text-[14px] leading-normal'}`}
    >
      <strong className="text-ink">{HOME.readOnlyLead}</strong> {HOME.readOnlyRest}
    </div>
  )
}
