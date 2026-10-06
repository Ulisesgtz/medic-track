import type { ReactNode } from 'react'
import { formatDayMonth } from '../../shared/date'
import { RoleChip } from './RoleChip'
import { OWNER_DESCRIPTION, ROLE_DESCRIPTION } from './roles'
import type { FamilyMember, FamilyView } from './types'

interface MembersListProps {
  family: FamilyView
  /** `phone`: the person's card stacks its description and «Quitar»; `desktop`: «Quitar» sits at the right. */
  variant: 'phone' | 'desktop'
  /** The «Quitar» of a person: only offered where `canRemove` says so. */
  onRemove?: (member: FamilyMember, button: HTMLButtonElement) => void
}

const card = 'flex rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
const removeButton =
  'min-h-11 shrink-0 cursor-pointer rounded-2xl border-2 border-red-700 px-5 text-[15px] font-extrabold text-red-700 transition-colors duration-200 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2'

/** «Personas»: the owner first (always there), then whoever joined, each with their role chip and what they can do. */
export function MembersList({ family, variant, onRemove }: MembersListProps) {
  const desktop = variant === 'desktop'
  const youOwner = family.role === 'owner'
  const cardLayout = desktop ? 'items-start gap-4 p-[22px]' : 'flex-col gap-3 p-5'
  return (
    <section aria-labelledby="family-people-title" className="flex flex-col gap-3.5">
      <h2 id="family-people-title" className="text-xl font-black tracking-[-0.02em] text-ink">
        Personas
      </h2>
      <ul aria-label="Personas de la familia" className="flex flex-col gap-3.5">
        <li className={`${card} ${cardLayout}`}>
          <Person
            desktop={desktop}
            initial={family.owner.name}
            tone="ink"
            name={`${family.owner.name}${youOwner ? ' (tú)' : ''}`}
            chip={<RoleChip role="owner" />}
            description={OWNER_DESCRIPTION}
          />
        </li>
        {family.members.map((m) => (
          <li key={m.id} className={`${card} ${cardLayout}`}>
            <Person
              desktop={desktop}
              initial={m.name}
              tone="action"
              name={`${m.name}${m.you ? ' (tú)' : ''}`}
              chip={<RoleChip role={m.role} />}
              since={`desde el ${formatDayMonth(m.since)}`}
              description={ROLE_DESCRIPTION[m.role]}
              action={
                m.canRemove && onRemove ? (
                  <button
                    type="button"
                    aria-label={`Quitar a ${m.name}`}
                    onClick={(e) => onRemove(m, e.currentTarget)}
                    className={`${removeButton} ${desktop ? '' : 'self-start'}`}
                  >
                    Quitar
                  </button>
                ) : null
              }
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

interface PersonProps {
  desktop: boolean
  initial: string
  tone: 'ink' | 'action'
  name: string
  chip: ReactNode
  since?: string
  description: string
  action?: ReactNode
}

/**
 * The person's avatar (a circle: a person, never confused with a child's rounded square), name, chips and description. On the
 * phone the description and the action go under the header row; on the web they stay in the text column and the action at the
 * right.
 */
function Person({ desktop, initial, tone, name, chip, since, description, action }: PersonProps) {
  const avatar = (
    <span
      aria-hidden="true"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[17px] font-extrabold text-white ${tone === 'ink' ? 'bg-ink' : 'bg-action'}`}
    >
      {initial.charAt(0).toUpperCase()}
    </span>
  )
  const text = (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <p className={`font-extrabold tracking-[-0.01em] text-ink [overflow-wrap:anywhere] ${desktop ? 'text-lg' : 'text-[17px]'}`}>{name}</p>
      <div className="flex flex-wrap items-center gap-2">
        {chip}
        {since && <span className="text-[13px] font-semibold text-slate-600">{since}</span>}
      </div>
      {desktop && <p className="mt-1 text-[15px] leading-normal text-body">{description}</p>}
    </div>
  )
  if (desktop) {
    return (
      <>
        {avatar}
        {text}
        {action}
      </>
    )
  }
  return (
    <>
      <div className="flex items-start gap-3.5">
        {avatar}
        {text}
      </div>
      <p className="text-[15px] leading-normal text-body">{description}</p>
      {action}
    </>
  )
}
