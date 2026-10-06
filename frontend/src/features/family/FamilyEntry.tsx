import { Link } from 'react-router-dom'
import { useFamily } from './useFamily'

/**
 * The way into «Familia» (specs/032-compartir-con-familia) from the home, built from the mock `referencia/Familia
 * PediTrack.dc.html` (E1): a card under the children with the people's initials (circles: people, never mixed up with a
 * child's rounded square; a pending invitation is dashed) and «3 de 4 personas · 1 pendiente». It reads the same `['family']`
 * query as the page; while that isn't there (or if it fails) the card is still a plain link to «Familia».
 */
export function FamilyEntry({ variant }: { variant: 'phone' | 'desktop' }) {
  const family = useFamily().data
  // Defensive: only a real family answer is drawn (anything else leaves the plain card).
  const ready = !!family && Array.isArray(family.members) && Array.isArray(family.invitations) && !!family.capacity
  const desktop = variant === 'desktop'

  const people = ready ? [family.owner.name, ...family.members.map((m) => m.name)] : []
  const pending = ready ? family.invitations.filter((i) => i.status === 'pending') : []
  const used = ready ? people.length + pending.length : 0
  const alone = ready && people.length === 1 && pending.length === 0

  let sub = 'Quién ve y marca las tomas de tus hijos'
  if (ready) {
    sub = alone
      ? 'Invita a tu pareja o a quien cuida a tus hijos'
      : `${used} de ${family.capacity.max} personas${
          pending.length > 0 ? ` · ${pending.length} ${desktop ? (pending.length === 1 ? 'invitación pendiente' : 'invitaciones pendientes') : pending.length === 1 ? 'pendiente' : 'pendientes'}` : ''
        }`
  }

  const size = desktop ? 'h-10 w-10 text-[15px]' : 'h-9 w-9 text-sm'
  return (
    <Link
      to="/familia"
      className={`flex min-h-11 items-center rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 ${
        desktop ? 'gap-[18px] p-6' : 'gap-4 p-5'
      }`}
    >
      {ready && (
        <span aria-hidden="true" className="flex">
          {people.slice(0, 4).map((name, n) => (
            <span
              key={`p${n}`}
              className={`${size} flex items-center justify-center rounded-full border-2 border-surface font-extrabold text-white ${n === 0 ? 'bg-ink' : 'bg-action'} ${n > 0 ? '-ml-2' : ''}`}
            >
              {name.charAt(0).toUpperCase()}
            </span>
          ))}
          {pending.slice(0, Math.max(0, 4 - people.length)).map((inv, n) => (
            <span key={`i${n}`} className={`${size} -ml-2 flex items-center justify-center rounded-full border-2 border-dashed border-action bg-hint font-extrabold text-action`}>
              {inv.email.charAt(0).toUpperCase()}
            </span>
          ))}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`font-extrabold tracking-[-0.02em] text-ink ${desktop ? 'text-xl' : 'text-[19px]'}`}>Familia</span>
        <span className="text-sm font-semibold text-action">{sub}</span>
      </span>
      <span aria-hidden="true" className={`shrink-0 font-extrabold text-action ${desktop ? 'text-[15px]' : 'text-xl'}`}>
        {desktop ? 'Ver familia →' : '→'}
      </span>
    </Link>
  )
}
