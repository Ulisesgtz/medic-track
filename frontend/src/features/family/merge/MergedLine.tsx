import type { Child } from '../../home/types'
import { mergedLine } from './mergeText'

/**
 * «Se unió el 3 dic con el registro de Laura» (specs/074, mock G): a plain gray line, not a card or a chip, at the end of the
 * phone's content and under «Hoy» on the web. Nothing when the child never absorbed another record.
 */
export function MergedLine({ merges }: { merges: Child['merges'] }) {
  if (!merges || merges.length === 0) return null
  return (
    <div className="flex flex-col gap-1 border-t border-hint-edge pt-3.5">
      {merges.map((m) => (
        <p key={`${m.at}-${m.byFirstName}`} className="text-[13px] text-muted">
          {mergedLine(m.at, m.byFirstName)}
        </p>
      ))}
    </div>
  )
}
