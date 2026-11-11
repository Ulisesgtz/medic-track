import type { PropsWithChildren } from 'react'
import { useConnectivity } from './connectivity'
import { OfflineMissing } from './OfflineMissing'

/**
 * A screen that always needs the server (specs/067): the history's search, growth, the plans, the family. Without a connection it
 * says so instead of loading or failing; with one, the screen as before.
 */
export function RequireConnection({ children }: PropsWithChildren) {
  return useConnectivity() === 'offline' ? <OfflineMissing /> : children
}
