import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLogout } from '../auth/useLogout'
import { ROLE_LABEL } from '../family/roles'
import { useFamily } from '../family/useFamily'
import { RemindersCardView } from '../reminders/RemindersCard'
import { useReminders } from '../reminders/useReminders'
import { HOME, caregiverOf, familyMembers, familyOf, planLabel } from './homeText'
import type { Account } from './types'

type Variant = 'phone' | 'desktop'

/**
 * «Lo demás» at the bottom of the home (specs/055, US3): Familia, Planes, Recordatorios and Cerrar sesión, with their value, with
 * less weight than the day — rows of 52 px on the phone, a strip of four on the web. «Recordatorios» opens the reminders card
 * right under it (there is no page for them: activating asks the browser for permission from that card). A Caregiver has no
 * «Planes»: the family's plan is somebody else's.
 */
export function MoreLinks({ account, variant }: { account: Account; variant: Variant }) {
  const desktop = variant === 'desktop'
  const logout = useLogout()
  const reminders = useReminders(account)
  const family = useFamily().data
  const [remindersOpen, setRemindersOpen] = useState(false)
  const panelId = useId()

  const caregiver = account.family?.role === 'caregiver'
  const people = family && Array.isArray(family.members) ? family.members.length + 1 : 1
  const familyValue = account.family ? caregiverOf(familyOf(account.family.ownerName), ROLE_LABEL[account.family.role]) : familyMembers(people)
  const remindersValue = reminders.state === 'on' ? HOME.remindersOn : HOME.remindersOff

  const row = desktop
    ? 'flex min-h-16 cursor-pointer flex-col justify-center gap-0.5 px-4 py-2.5 text-left hover:bg-hint'
    : 'flex min-h-[52px] cursor-pointer items-center justify-between gap-3 border-b border-hint-edge text-left'
  const title = (color: string) => `text-[15px] font-bold ${color}`
  const value = `text-body ${desktop ? 'text-[13px]' : 'text-sm'}`

  return (
    <div className="flex flex-col gap-4">
      <nav
        aria-label={HOME.more}
        className={desktop ? 'grid grid-cols-4 border-y border-hint-edge' : 'mt-2 flex flex-col border-t border-hint-edge'}
      >
        <Link to="/familia" className={row}>
          <span className={title('text-ink')}>{HOME.family}</span>
          <span className={value}>{familyValue}</span>
        </Link>
        {!caregiver && (
          <Link to="/planes" className={row}>
            <span className={title('text-ink')}>{HOME.plans}</span>
            <span className={value}>{planLabel(account)}</span>
          </Link>
        )}
        <button type="button" aria-expanded={remindersOpen} aria-controls={panelId} onClick={() => setRemindersOpen((v) => !v)} className={row}>
          <span className={title('text-ink')}>{HOME.reminders}</span>
          <span className={value}>{remindersValue}</span>
        </button>
        <button type="button" onClick={logout} className={row}>
          <span className={title('text-action')}>{HOME.logout}</span>
          {desktop && <span className={value} />}
        </button>
      </nav>
      <div id={panelId} hidden={!remindersOpen}>
        {remindersOpen && <RemindersCardView account={account} reminders={reminders} />}
      </div>
    </div>
  )
}
