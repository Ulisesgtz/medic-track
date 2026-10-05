import { useIsDesktop } from '../ui/useIsDesktop'
import { reloadApp } from './reload'
import { hasUnsavedWork } from './unsavedWork'
import { useNewVersion } from './useNewVersion'

export const UPDATE_CONFIRM = '¿Actualizar ahora? Se perderá lo que capturaste.'

/**
 * "Hay una versión nueva · Actualizar" (specs/017). A quiet bar at the bottom: it never reloads by itself, and if a
 * form holds something typed or a photo it asks first. A spacer keeps it from covering the end of the page. Phone and
 * web are separate designs (bar across the phone; a card in the web's corner).
 */
export function UpdateNotice() {
  const hasNew = useNewVersion()
  const isDesktop = useIsDesktop()
  if (!hasNew) return null

  const update = () => {
    if (hasUnsavedWork() && !window.confirm(UPDATE_CONFIRM)) return
    reloadApp()
  }

  const button = (
    <button
      type="button"
      onClick={update}
      className="min-h-11 shrink-0 cursor-pointer rounded-2xl border-2 border-white px-4 text-[14px] font-extrabold text-white transition-colors duration-200 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
    >
      Actualizar
    </button>
  )

  return (
    <>
      <div aria-hidden="true" className="h-24" />
      {isDesktop ? (
        <div
          role="status"
          className="fixed right-6 bottom-6 z-40 flex max-w-sm items-center gap-4 rounded-2xl bg-ink py-3 pr-3 pl-5 text-[14px] font-bold text-white shadow-xl"
        >
          <span>Hay una versión nueva</span>
          {button}
        </div>
      ) : (
        <div
          role="status"
          className="fixed inset-x-3 z-40 mx-auto flex max-w-[406px] items-center justify-between gap-3 rounded-2xl bg-ink py-2.5 pr-2.5 pl-4 text-[14px] font-bold text-white shadow-xl"
          style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <span>Hay una versión nueva</span>
          {button}
        </div>
      )}
    </>
  )
}
