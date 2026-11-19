import type { ActivityType } from '../../shared/catalog/api'
import type { Routine } from './types'

/** One segment of «Actividades»: the type's name and the routines that have it, in the order they came. */
export interface ActivityTypeSegment {
  code: string
  name: string
  routines: Routine[]
}

/**
 * Splits a list of activities into segments by type (specs/075), in the catalog's order — a retired type keeps its place by its
 * `sortOrder` position in the list the server sent —, with no empty segment, and keeping inside each one the order received. A code
 * the catalog doesn't know goes to the end under its own code. With no catalog (it didn't load and there is no copy) it returns
 * `null`: the caller shows the list with no segments, as before.
 */
export function groupByActivityType(routines: Routine[], catalog: ActivityType[] | undefined): ActivityTypeSegment[] | null {
  if (!Array.isArray(catalog)) return null
  const known = new Map(catalog.map((type, index) => [type.code, { name: type.name, index }]))
  const buckets = new Map<string, Routine[]>()
  for (const routine of routines) {
    const code = routine.activityType ?? ''
    const list = buckets.get(code)
    if (list) list.push(routine)
    else buckets.set(code, [routine])
  }
  const segments: ActivityTypeSegment[] = []
  for (const type of catalog) {
    const list = buckets.get(type.code)
    if (list) segments.push({ code: type.code, name: type.name, routines: list })
  }
  for (const [code, list] of buckets) {
    if (!known.has(code)) segments.push({ code, name: code, routines: list })
  }
  return segments
}

/**
 * The types the form offers: the active ones in the catalog's order, plus the one the activity already has when it was retired
 * (it stays visible and chosen so it can be kept or changed to an active one; it can't be picked for any other activity).
 */
export function offeredTypes(catalog: ActivityType[], current: string): ActivityType[] {
  return catalog.filter((type) => type.active || type.code === current)
}
