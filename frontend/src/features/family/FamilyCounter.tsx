/**
 * «3 de 4 personas» with one bar per place (mock «Familia»): a person = `bright`, a pending invitation = dashed `bright-soft`,
 * a free place = `ink-edge`. The bars are decoration (`aria-hidden`); the text is the information. It sits on `ink`: in the
 * phone header, and in a dark card at the right of the title on the web.
 */
export function FamilyCounter({
  people,
  pending,
  max,
  variant,
}: {
  people: number
  pending: number
  max: number
  variant: 'phone' | 'desktop'
}) {
  const bar = variant === 'phone' ? 'h-2.5 w-11 rounded-full' : 'h-2.5 flex-1 rounded-full'
  const used = people + pending
  return (
    <div className={variant === 'desktop' ? 'flex min-w-[260px] flex-col gap-2.5 rounded-[22px] bg-ink px-[22px] py-[18px]' : 'flex flex-col gap-2.5'}>
      <p className="flex items-baseline gap-2 text-white">
        <span className="text-[34px] font-black tracking-[-0.03em]">{`${used} de ${max}`}</span>
        <span className="text-lg font-extrabold">personas</span>
      </p>
      <div aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: max }, (_, n) =>
          n < people ? (
            <span key={n} className={`${bar} bg-bright`} />
          ) : n < used ? (
            <span key={n} className={`${bar} border-2 border-dashed border-bright-soft`} />
          ) : (
            <span key={n} className={`${bar} bg-ink-edge`} />
          ),
        )}
      </div>
      {pending > 0 && <p className="text-[13px] font-semibold text-bright-soft">contando invitaciones pendientes</p>}
    </div>
  )
}
