import { useRef, useState } from 'react'
import { formatDayMonth, formatTime } from '../../../shared/date'
import { fieldRoutine } from '../../../shared/ui/formStyles'
import { ConfirmDialog } from '../../family/ConfirmDialog'
import { PARENT } from '../childText'
import type { DeviceLink } from './parentApi'
import { useRevokeDeviceLink, useSetReminderDetail } from './parentHooks'

/** «hoy 08:05» for today, «12 oct, 08:05» for another day: when a phone was last used. */
function when(instant: string): string {
  const d = new Date(instant)
  const now = new Date()
  const today = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return today ? `hoy ${formatTime(d)}` : `${formatDayMonth(d)}, ${formatTime(d)}`
}

function lastLine(link: DeviceLink): string {
  if (link.status === 'pending' || link.status === 'expired') return PARENT.list.created(formatDayMonth(link.createdAt))
  const since = link.redeemedAt ? PARENT.list.since(formatDayMonth(link.redeemedAt)) : ''
  const seen = link.lastSeenAt ? PARENT.list.lastSeen(when(link.lastSeenAt)) : PARENT.list.neverUsed
  return [since, seen].filter(Boolean).join(' · ')
}

/**
 * The phones of a child (specs/047): each with its name, since when, the last time it was used and its state — only a record, never a
 * judgement. Who can manage can remove one (the family's `ConfirmDialog`, in `ink`, in neutral words) and choose what its reminders say.
 * A caregiver sees the list and nothing more.
 */
export function ChildAccessList({ childId, childName, links, canManage }: { childId: string; childName: string; links: DeviceLink[]; canManage: boolean }) {
  const revoke = useRevokeDeviceLink(childId)
  const setDetail = useSetReminderDetail(childId)
  const [removing, setRemoving] = useState<DeviceLink | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  return (
    <section aria-label={PARENT.list.title(childName)} className="flex flex-col gap-3 rounded-[22px] bg-surface px-[22px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <h3 className="text-lg font-black tracking-[-0.02em] text-ink">{PARENT.list.title(childName)}</h3>
      <ul className="flex flex-col gap-4">
        {links.map((link) => {
          const live = link.status === 'pending' || link.status === 'active'
          return (
            <li key={link.id} className="flex flex-col gap-2 border-t border-hint-edge pt-4 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 text-base font-extrabold text-ink [overflow-wrap:anywhere]">{link.name}</span>
                <span className="rounded-full border border-hint-border bg-hint px-3 py-1 text-[13px] font-bold text-ink">{PARENT.list.status[link.status]}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-body">{lastLine(link)}</p>
              {canManage && live && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex min-w-[170px] flex-1 flex-col gap-1">
                    <label htmlFor={`detail-${link.id}`} className="text-[13px] font-bold text-ink">
                      {PARENT.list.reminderText}
                    </label>
                    <select
                      id={`detail-${link.id}`}
                      value={link.reminderDetail}
                      disabled={setDetail.isPending}
                      onChange={(e) => setDetail.mutate({ linkId: link.id, detail: e.target.value as 'generic' | 'detailed' })}
                      className={fieldRoutine}
                    >
                      <option value="generic">{PARENT.list.generic}</option>
                      <option value="detailed">{PARENT.list.detailed}</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    aria-label={PARENT.list.removeLabel(link.name)}
                    onClick={(e) => {
                      openerRef.current = e.currentTarget
                      setRemoving(link)
                    }}
                    className="min-h-12 cursor-pointer rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                  >
                    {PARENT.list.remove}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {setDetail.isError && (
        <p role="alert" className="text-[13px] font-semibold text-red-700">
          {PARENT.list.saveError}
        </p>
      )}
      {removing && (
        <ConfirmDialog
          title={PARENT.list.confirm.title(removing.name)}
          rows={PARENT.list.confirm.rows(childName)}
          confirmLabel={PARENT.list.confirm.confirm}
          cancelLabel={PARENT.list.confirm.cancel}
          busyLabel={PARENT.list.confirm.busy}
          tone="ink"
          busy={revoke.isPending}
          error={revoke.isError ? PARENT.list.confirm.error : null}
          onConfirm={() => revoke.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
          onCancel={() => {
            if (!revoke.isPending) setRemoving(null)
          }}
          opener={openerRef}
        />
      )}
    </section>
  )
}
