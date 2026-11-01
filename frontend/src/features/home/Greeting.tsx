import type { ReactNode } from 'react'
import { formatWeekdayLong } from '../../shared/date'
import { useLocalDay } from '../../shared/useLocalDay'
import { greeting } from './homeText'
import type { Account } from './types'

/**
 * The top of the home (specs/055): «Hola, Ana» and today's date, which turns at midnight (`useLocalDay`). On the phone it sits on
 * the page itself — the design has no dark band — with the account's initials at the right (`account` slot: the account menu); on
 * the web the account is in the sidebar, so there is nothing at the right.
 */
export function Greeting({ account, variant, accountSlot }: { account: Account; variant: 'phone' | 'desktop'; accountSlot?: ReactNode }) {
  const today = useLocalDay()
  const desktop = variant === 'desktop'
  return (
    <header className={desktop ? 'flex flex-col gap-1' : 'flex items-center justify-between gap-3'}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className={`font-black tracking-[-0.03em] text-ink ${desktop ? 'text-[34px]' : 'text-[28px]'}`}>{greeting(account.firstName)}</h1>
        <span className={`text-body ${desktop ? 'text-base' : 'text-[15px]'}`}>{formatWeekdayLong(today.from)}</span>
      </div>
      {!desktop && accountSlot}
    </header>
  )
}
