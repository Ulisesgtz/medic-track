import { formatDayMonth } from '../../shared/date'
import { ROLE_DESCRIPTION, ROLE_LABEL } from './roles'
import type { FamilyView } from './types'

/** The people of the family: who owns it first (always there), then whoever joined. */
export function MembersList({ family }: { family: FamilyView }) {
  return (
    <ul aria-label="Personas de la familia" className="flex flex-col gap-3">
      <li className="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
        <Avatar name={family.owner.name} />
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-ink">{family.owner.name}</p>
          <p className="text-sm font-semibold text-ink-soft">Cuenta de la familia</p>
        </div>
      </li>
      {family.members.map((m) => (
        <li key={m.id} className="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
          <Avatar name={m.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-ink">{m.name}</p>
            <p className="text-sm font-semibold text-ink-soft">
              {ROLE_LABEL[m.role]} · desde el {formatDayMonth(m.since)}
            </p>
            <p className="mt-0.5 text-[13px] text-body">{ROLE_DESCRIPTION[m.role]}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-hint text-base font-black text-action"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
