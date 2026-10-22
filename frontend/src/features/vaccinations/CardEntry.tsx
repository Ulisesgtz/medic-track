import { Link } from 'react-router-dom'
import { usePhotos, useVaccinations } from './hooks'
import { TEXT, entrySummary } from './vaccineText'

/**
 * The card of the child's detail that leads to the vaccination card (specs/046): a heading, how many doses and photos are recorded and
 * a link. Just a count of what was recorded: no judgement. It draws nothing if the card can't be read, so the child's page never breaks.
 */
export function CardEntry({ childId }: { childId: string }) {
  const doses = useVaccinations(childId)
  const photos = usePhotos(childId)
  if (doses.isError || doses.isPending) return null
  return (
    <section aria-label={TEXT.title} className="flex flex-col gap-2 rounded-[22px] bg-surface px-[22px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
      <h3 className="text-lg font-black tracking-[-0.02em] text-ink">{TEXT.title}</h3>
      <p className="text-[15px] text-body">{entrySummary(doses.data?.length ?? 0, photos.data?.photos.length ?? 0)}</p>
      <Link
        to={`/children/${childId}/cartilla`}
        className="inline-flex min-h-11 items-center self-start text-[15px] font-extrabold text-action hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
      >
        {TEXT.entry.link}
      </Link>
    </section>
  )
}
