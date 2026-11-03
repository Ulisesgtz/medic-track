import { Link } from 'react-router-dom'
import type { Account } from '../home/types'
import { PROFILE, sharedEntry } from './profileText'

/**
 * The home's way to somebody of the family who shares their own consultations with the session (specs/058, US2): one row per
 * person, to their shared profile. Nothing when nobody shares (the usual case).
 */
export function SharedProfilesLinks({ account, variant }: { account: Account; variant: 'phone' | 'desktop' }) {
  const people = account.sharedProfiles ?? []
  if (people.length === 0) return null
  const desktop = variant === 'desktop'
  return (
    <nav aria-label={PROFILE.sharedTitle} className="flex flex-col gap-2.5">
      <h2 className={`font-extrabold text-ink ${desktop ? 'text-[19px]' : 'text-[18px]'}`}>{PROFILE.sharedTitle}</h2>
      <div className="overflow-hidden rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
        {people.map((p) => (
          <Link
            key={p.accountId}
            to={`/personas/${p.accountId}`}
            className="flex min-h-[56px] items-center justify-between gap-3 border-b border-hint-edge px-4 last:border-b-0 hover:bg-canvas"
          >
            <span className="text-[16px] font-extrabold text-ink">{sharedEntry(p.firstName)}</span>
            <span aria-hidden="true" className="text-[22px] text-action">
              ›
            </span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
