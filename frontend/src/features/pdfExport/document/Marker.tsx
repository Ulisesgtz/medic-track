import { View } from '@react-pdf/renderer'
import type { PageLog } from './pageLog'

/** An invisible marker that writes in the log the page it ends up on (see pageLog.ts). It takes no room. */
export function Marker({ log, name, edge }: { log: PageLog; name: string; edge: 'start' | 'end' }) {
  return (
    <View
      render={({ pageNumber }) => {
        log.at(name, edge, pageNumber)
        return null
      }}
    />
  )
}
