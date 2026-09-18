import { Link } from 'react-router-dom'
import { computeAge } from '../../shared/age'
import type { Child } from './types'

interface ChildCardProps {
  child: Child
}

/** One child's card on the home page: name + calculated age (FR-001). Clicking
 * the name navigates to that child's detail route (FR-005). */
export function ChildCard({ child }: ChildCardProps) {
  const age = computeAge(child.birthDate)

  return (
    <Link
      to={`/children/${child.id}`}
      className="flex cursor-pointer items-center gap-4 rounded-3xl bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)] transition-transform duration-200 hover:-translate-y-0.5"
    >
      <span
        aria-hidden="true"
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-bright text-2xl font-black text-ink"
      >
        {child.firstName.charAt(0)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xl font-extrabold tracking-tight text-ink">
          {child.firstName} {child.lastName}
        </span>
        <span className="mt-1 block text-sm font-semibold text-action">
          {age.value} {age.unit}
        </span>
      </span>
    </Link>
  )
}
