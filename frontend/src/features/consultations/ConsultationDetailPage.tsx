import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppHeader } from '../../shared/ui/AppHeader'
import { AppShell } from '../home/AppShell'
import { fetchConsultationDetail, ConsultationApiError } from './api'
import { DoseCheckbox } from './DoseCheckbox'
import { sniffImageMimeType } from './imageMime'

const cardClass = 'rounded-3xl bg-surface p-6 shadow-[0_8px_20px_rgba(4,37,43,0.07)] md:p-7'
const overlineClass = 'text-xs font-extrabold uppercase tracking-[0.1em] text-action'

/**
 * Full-screen viewer for the prescription photo. Rendered in-app instead of
 * opening the image in a new tab: browsers block top-level navigation to
 * `data:` URLs (the tab would just be blank), and a new tab is awkward in an
 * installed PWA anyway. Tapping the image toggles between "fit to screen"
 * and actual size (scrollable) so small print stays readable.
 */
function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
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

/** Detail of a single consultation: photo, doctor, date, medications with
 * their markable doses (if any), and symptoms (FR-013). */
export function ConsultationDetailPage() {
  const { consultationId } = useParams<{ consultationId: string }>()
  const [viewerOpen, setViewerOpen] = useState(false)

  const query = useQuery({
    queryKey: ['consultation', consultationId],
    queryFn: () => fetchConsultationDetail(consultationId!),
    enabled: !!consultationId,
    retry: false,
  })

  if (query.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <p className="text-base font-semibold text-action">Cargando…</p>
      </main>
    )
  }

  if (query.isError) {
    const notFound =
      query.error instanceof ConsultationApiError && query.error.kind === 'consultation_not_found'
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
          <p className="text-lg font-bold tracking-tight text-ink">
            {notFound ? 'No se encontró esta consulta.' : 'Ocurrió un error al cargar la consulta.'}
          </p>
        </div>
      </main>
    )
  }

  const consultation = query.data!
  const photoSrc = `data:${sniffImageMimeType(consultation.photoBase64)};base64,${consultation.photoBase64}`

  return (
    <AppShell activeChildId={consultation.childId}>
    <main className="min-h-screen bg-canvas pb-16">
      <AppHeader
        eyebrow={
          <Link to={`/children/${consultation.childId}`} className="-my-3 inline-flex min-h-11 items-center hover:underline">
            ← Volver al reporte de consultas
          </Link>
        }
        title={consultation.doctorName}
      >
        <p className="text-base font-semibold text-white/80">{consultation.consultDate}</p>
      </AppHeader>

      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-7 md:px-10 md:py-9">
        <section className={cardClass}>
          <h2 className={overlineClass}>Receta</h2>
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            aria-label="Abrir la foto de la receta en tamaño completo"
            className="mt-4 block w-full cursor-zoom-in"
          >
            <img
              src={photoSrc}
              alt="Foto de la receta médica"
              className="max-h-[32rem] w-full rounded-2xl bg-hint object-contain sm:max-h-[42rem]"
            />
          </button>
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-2xl border-2 border-action px-5 py-2.5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint"
          >
            Ver completa
          </button>
        </section>

        {consultation.symptoms && (
          <section className={cardClass}>
            <h2 className={overlineClass}>Síntomas</h2>
            <p className="mt-3 text-base leading-relaxed text-ink">{consultation.symptoms}</p>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className={`${overlineClass} px-1`}>Medicamentos</h2>
          {consultation.medications.map((med) => (
            <div key={med.id} className={cardClass}>
              <p className="text-xl font-extrabold tracking-tight text-ink">{med.name}</p>
              <p className="mt-1 text-sm font-semibold text-action">
                Cada {med.frequencyHours}h, por {med.durationDays} días
                {med.startTime && ` — inicio ${med.startTime}`}
              </p>

              {med.doses.length > 0 && (
                <div className="mt-5 grid gap-2.5 md:grid-cols-2">
                  {med.doses.map((dose) => (
                    <DoseCheckbox key={dose.id} consultationId={consultation.id} dose={dose} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>

      {viewerOpen && <PhotoViewer src={photoSrc} onClose={() => setViewerOpen(false)} />}
    </main>
    </AppShell>
  )
}
