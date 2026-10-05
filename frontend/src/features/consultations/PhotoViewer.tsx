import { useEffect, useRef, useState } from 'react'

/**
 * Full-screen viewer for the prescription photo. Rendered in-app instead of
 * opening the image in a new tab: browsers block top-level navigation to
 * `data:` URLs (the tab would just be blank), and a new tab is awkward in an
 * installed PWA anyway. Tapping the image toggles between "fit to screen"
 * and actual size (scrollable) so small print stays readable.
 */
export function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [actualSize, setActualSize] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Focus management for a real modal: move focus in on open, keep it on the
  // only control while open (Tab would otherwise reach the page behind the
  // overlay), and give it back to whatever opened the viewer on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => opener?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        event.preventDefault()
        closeButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto de la receta en tamaño completo"
      className="fixed inset-0 z-50 flex flex-col bg-ink"
    >
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
        <p className="text-sm font-semibold text-white/80">
          {actualSize ? 'Tamaño real — toca la imagen para ajustar' : 'Toca la imagen para ampliar'}
        </p>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="min-h-11 cursor-pointer rounded-2xl border-2 border-bright px-5 py-2 text-base font-extrabold text-bright transition-colors duration-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-bright"
        >
          Cerrar
        </button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-auto p-4">
        <img
          src={src}
          alt="Foto de la receta médica en tamaño completo"
          onClick={() => setActualSize((v) => !v)}
          className={
            actualSize
              ? 'm-auto max-w-none cursor-zoom-out'
              : 'm-auto h-[calc(100dvh-7.5rem)] w-full cursor-zoom-in object-contain'
          }
        />
      </div>
    </div>
  )
}
