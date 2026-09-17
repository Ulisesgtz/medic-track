import { Link } from 'react-router-dom'
import { computeAge } from '../../shared/age'
import type { Child } from './types'

interface ChildCardProps {
  child: Child
}

/** One child's card on the home page: name + calculated age (FR-001). Clicking
 * the name navigates to that child's placeholder detail route (FR-005). */
export function ChildCard({ child }: ChildCardProps) {
  const age = computeAge(child.birthDate)

  return (
    <Link
      to={`/children/${child.id}`}
      className="block cursor-pointer rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-colors duration-200 hover:border-cyan-300 hover:bg-cyan-50/40"
    >
      <p className="text-base font-semibold text-slate-900">
        {child.firstName} {child.lastName}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {age.value} {age.unit}
      </p>
    </Link>
  )
}
