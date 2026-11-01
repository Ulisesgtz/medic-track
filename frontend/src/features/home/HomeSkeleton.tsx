// specs/055 (estado 6 del diseño): while the account loads, the home reserves the final height of the greeting, «Tu día» and two
// cards, so nothing jumps when the data arrives. Decoration only: the region says it is loading.

const box = 'rounded-[22px] border-[1.5px] border-hint-edge bg-surface'

export function HomeSkeleton({ variant }: { variant: 'phone' | 'desktop' }) {
  if (variant === 'desktop')
    return (
      <div aria-busy="true" aria-label="Cargando el inicio" className="flex flex-col gap-7">
        <div className="flex min-h-16 flex-col gap-2.5">
          <span className="h-[34px] w-[220px] rounded-lg bg-skel" />
          <span className="h-[18px] w-[200px] rounded-md bg-skel" />
        </div>
        <div className={`${box} grid h-[196px] grid-cols-2 gap-6 p-[22px]`}>
          <span className="rounded-xl bg-skel" />
          <span className="rounded-xl bg-skel" />
        </div>
        <span className="h-5 w-[120px] rounded-md bg-skel" />
        <div className="grid grid-cols-2 gap-5">
          <div className={`${box} h-[280px]`} />
          <div className={`${box} h-[280px]`} />
        </div>
      </div>
    )
  return (
    <div aria-busy="true" aria-label="Cargando el inicio" className="flex flex-col gap-5">
      <div className="flex min-h-14 items-center justify-between">
        <div className="flex flex-col gap-2">
          <span className="h-[26px] w-[140px] rounded-lg bg-skel" />
          <span className="h-4 w-[180px] rounded-md bg-skel" />
        </div>
        <span className="h-11 w-11 rounded-full bg-skel" />
      </div>
      <div className={`${box} flex h-[236px] flex-col gap-3.5 p-[18px]`}>
        <span className="h-[18px] w-20 rounded-md bg-skel" />
        <span className="h-[52px] rounded-xl bg-skel" />
        <span className="h-[52px] rounded-xl bg-skel" />
        <span className="h-11 w-[120px] self-end rounded-[14px] bg-skel" />
      </div>
      <span className="h-[18px] w-[100px] rounded-md bg-skel" />
      <div className={`${box} flex h-[264px] flex-col gap-3.5 p-[18px]`}>
        <span className="flex items-center gap-3">
          <span className="h-11 w-11 rounded-full bg-skel" />
          <span className="h-5 w-40 rounded-md bg-skel" />
        </span>
        <span className="h-11 rounded-xl bg-skel" />
        <span className="h-11 rounded-xl bg-skel" />
        <span className="h-11 rounded-xl bg-skel" />
      </div>
      <div className={`${box} h-[220px]`} />
    </div>
  )
}
