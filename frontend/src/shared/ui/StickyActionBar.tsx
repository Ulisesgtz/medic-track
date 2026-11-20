import type { ReactNode } from 'react'

/**
 * specs/056 (research R3): where a form's «Guardar…» lives. On the phone, a bar pinned to the bottom while the form scrolls
 * (`sticky`, not `fixed`: when the iPhone's keyboard opens, the field being typed stays visible and the bar never floats over
 * it), within reach of the thumb and away from «← Cancelar». On the web the button simply goes at the end of the form.
 */
export function StickyActionBar({ variant, children }: { variant: 'phone' | 'desktop'; children: ReactNode }) {
  if (variant === 'desktop') return <div className="flex justify-end gap-2.5 pt-2">{children}</div>
  return (
    <div
      // `[&>*]:flex-none`: the buttons bring a flex-basis meant for the web's row (`flex-[2_1_180px]`); in this column it would
      // become their height (a 180 px «Guardar»). Here each one keeps its own height.
      className="sticky bottom-0 z-10 -mx-5 mt-2 flex flex-col gap-2 border-t border-hint-edge bg-canvas px-5 pt-3 [&>*]:w-full [&>*]:flex-none"
      style={{ paddingBottom: 'calc(1.625rem + env(safe-area-inset-bottom))' }}
    >
      {children}
    </div>
  )
}
