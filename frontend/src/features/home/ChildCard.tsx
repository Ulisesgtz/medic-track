import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatAgeLong } from '../../shared/age'
import { useLocalDay } from '../../shared/useLocalDay'
import { fetchChildOverview, fetchConsultations } from '../consultations/api'
import type { Child } from './types'

interface ChildCardProps {
  child: Child
  /** 'phone' = the list card with its two status chips (board screen 2), 'desktop' = the plain grid card (mock 15). */
  variant?: 'phone' | 'desktop'
  /** Position in the list: the phone design alternates the avatar colour (cyan, then mint). */
  index?: number
}

const chip = 'rounded-[10px] px-3 py-2 text-[13px] font-bold'

/**
 * The two chips under a child on the phone home: how many consultations they
 * have and what is pending today — amber "N tomas hoy" while doses are still
 * unmarked, mint "Sin tomas pendientes" otherwise. Amber only ever means "the
 * parent hasn't marked it", never a medical warning (Principio I). Reads the
 * same queries as the child detail, so both screens share one cache.
 */
function ChildStatusChips({ childId }: { childId: string }) {
  const today = useLocalDay()
  const consultations = useQuery({
    queryKey: ['consultations', childId],
    queryFn: () => fetchConsultations(childId),
    retry: false,
  })
  const overview = useQuery({
    queryKey: ['overview', childId, today.from.toISOString()],
    queryFn: () => fetchChildOverview(childId, today.from, today.to),
    retry: false,
  })

  const count = consultations.data?.length
  const unmarked = overview.data?.doses.filter((d) => !d.taken).length

  // The row keeps its height while loading (or if a request fails) so the list doesn't jump.
  return (
    <div className="mt-[18px] flex min-h-[34px] flex-wrap gap-2.5">
      {count !== undefined && (
        <span className={`${chip} bg-hint text-action`}>
          {count} {count === 1 ? 'consulta' : 'consultas'}
        </span>
      )}
      {unmarked !== undefined &&
        (unmarked > 0 ? (
          <span className={`${chip} bg-pending-soft text-[#92400e]`}>
            {unmarked} {unmarked === 1 ? 'toma' : 'tomas'} hoy
          </span>
        ) : (
          <span className={`${chip} bg-confirmed-soft text-[#065f46]`}>Sin tomas pendientes</span>
        ))}
    </div>
  )
}

/**
 * One child's card on the home page: initial, name and age ("5 años 6 meses"),
 * as in the mockups. Clicking it opens that child's detail (FR-005).
 */
export function ChildCard({ child, variant = 'phone', index = 0 }: ChildCardProps) {
  const phone = variant === 'phone'
  const mint = phone && index % 2 === 1
  return (
    <Link
      to={`/children/${child.id}`}
      className={`block min-w-0 cursor-pointer rounded-3xl bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] transition-transform duration-200 hover:-translate-y-0.5 ${phone ? 'p-5' : 'p-6'}`}
    >
      <span className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-black ${mint ? 'bg-[#a7f3d0] text-[#065f46]' : 'bg-bright text-ink'}`}
        >
          {child.firstName.charAt(0)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xl font-extrabold tracking-tight text-ink">
            {child.firstName} {child.lastName}
          </span>
          <span className="mt-1 block text-sm font-semibold text-action">{formatAgeLong(child.birthDate)}</span>
        </span>
      </span>
      {phone && <ChildStatusChips childId={child.id} />}
    </Link>
  )
}
