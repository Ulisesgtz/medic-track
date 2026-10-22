import { PHONE } from '../childText'
import { NoAccess } from './NoAccess'
import { readCredential } from './storage'

/** `/hijo/hoy`: the child's own screen (specs/047). Its content arrives with the routes of the child's phone. */
export function ChildTodayPage() {
  if (!readCredential()) return <NoAccess />
  return (
    <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas px-6 py-10">
      <h1 className="text-2xl font-black tracking-[-0.02em] text-ink">{PHONE.greeting('')}</h1>
    </main>
  )
}
