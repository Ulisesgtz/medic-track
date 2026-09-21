import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatDateLong, formatDayMonth } from '../../shared/date'
import { useLocalDay } from '../../shared/useLocalDay'
import { AppShell } from '../home/AppShell'
import { fetchAccount } from '../home/api'
import { useSidebarSession } from '../home/useSidebarSession'
import { fetchChildOverview, fetchConsultationDetail, ConsultationApiError } from './api'
import { sniffImageMimeType } from './imageMime'
import { MedicationCard } from './MedicationCard'
import { PhotoViewer } from './PhotoViewer'

const overline = 'text-xs font-extrabold uppercase tracking-[0.1em] text-ink-soft'

/**
 * Detail of a single consultation (FR-013), built from the delivered
 * mockups: on the phone (03) the dark header, the prescription photo card,
 * the symptoms and the medications with their dose chips; with the desktop
 * web design (13, with the sidebar when there is an account) the header row with "Nueva consulta", medications and symptoms
 * on the left, the photo and the active treatment on the right.
 */
export function ConsultationDetailPage() {
  const { consultationId } = useParams<{ consultationId: string }>()
  const [viewerOpen, setViewerOpen] = useState(false)
  const { accountId, isDesktop } = useSidebarSession()

  const query = useQuery({
    queryKey: ['consultation', consultationId],
    queryFn: () => fetchConsultationDetail(consultationId!),
    enabled: !!consultationId,
    retry: false,
  })
  const childId = query.data?.childId

  // The back link names the child, and the desktop "Tratamiento activo" card
  // comes from the overview — both share query keys with the other screens.
  const accountQuery = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => fetchAccount(accountId!),
    enabled: accountId !== null,
    retry: false,
  })
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const today = useLocalDay()
  const overviewQuery = useQuery({
    queryKey: ['overview', childId, today.from.toISOString()],
    queryFn: () => fetchChildOverview(childId!, today.from, today.to),
    enabled: !!childId && isDesktop,
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
  const childPath = `/children/${consultation.childId}`
  const backLabel = child ? `← ${child.firstName} ${child.lastName}` : '← Volver al reporte de consultas'
  const date = formatDateLong(consultation.consultDate)
  const treatment = overviewQuery.data?.activeTreatment

  const photoImage = (className: string) => (
    <button
      type="button"
      onClick={() => setViewerOpen(true)}
      aria-label="Abrir la foto de la receta en tamaño completo"
      className={`block cursor-zoom-in overflow-hidden border-[1.5px] border-slate-300 bg-slate-200 ${className}`}
    >
      <img src={photoSrc} alt="Foto de la receta médica" className="h-full w-full object-cover" />
    </button>
  )
  const seeFull = (className: string) => (
    <button
      type="button"
      onClick={() => setViewerOpen(true)}
      className={`min-h-11 cursor-pointer text-[13px] font-bold text-action ${className}`}
    >
      Ver completa
    </button>
  )
  const medications = consultation.medications.map((med) => (
    <MedicationCard
      key={med.id}
      consultationId={consultation.id}
      medication={med}
      variant={isDesktop ? 'desktop' : 'phone'}
    />
  ))

  // ---- Web (mock 13).
  if (isDesktop) {
    return (
      <AppShell activeChildId={consultation.childId}>
        <main className="min-w-0 bg-canvas px-12 py-11">
          <div className="mx-auto flex max-w-4xl flex-col gap-8">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <Link
                  to={childPath}
                  className="-my-3 inline-flex min-h-11 items-center text-sm font-bold text-action"
                >
                  {backLabel}
                </Link>
                <p className="mt-3 text-sm font-bold text-action">{date}</p>
                <h1 className="mt-1 text-4xl font-black tracking-tight text-ink">{consultation.doctorName}</h1>
              </div>
              <Link
                to={`${childPath}/consultations/new`}
                className="min-h-11 rounded-2xl bg-confirmed px-6 py-3.5 text-[15px] font-extrabold text-white transition-colors hover:bg-emerald-800"
              >
                Nueva consulta
              </Link>
            </div>

            <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start gap-6">
              <div className="flex min-w-0 flex-col gap-4">
                <h2 className={overline}>Medicamentos</h2>
                {medications}
                {consultation.symptoms && (
                  <div className="min-w-0 rounded-3xl bg-surface p-6 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
                    <h2 className={overline}>Síntomas registrados</h2>
                    <p className="mt-3 text-base leading-relaxed text-[#1f3d44]">{consultation.symptoms}</p>
                  </div>
                )}
              </div>

              <aside className="flex min-w-0 flex-col gap-4">
                <div className="min-w-0 rounded-3xl bg-surface p-6 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
                  <h2 className={overline}>Foto de la receta</h2>
                  {photoImage('mt-4 h-[200px] w-full rounded-2xl')}
                  <p className="mt-4 text-[13px] leading-relaxed text-slate-500">
                    Leída con OCR en el dispositivo. La imagen no salió de tu equipo.
                  </p>
                  {seeFull('mt-1')}
                </div>

                <div className="min-w-0 rounded-3xl bg-ink p-6">
                  <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#67e8f9]">
                    Tratamiento activo
                  </p>
                  <p className="mt-2.5 text-xl font-black tracking-tight text-white">
                    {treatment ? treatment.medicationName : 'Ninguno'}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#a5f3fc]">
                    {treatment ? `termina el ${formatDayMonth(treatment.endsAt)}` : 'sin tomas pendientes'}
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </main>
        {viewerOpen && <PhotoViewer src={photoSrc} onClose={() => setViewerOpen(false)} />}
      </AppShell>
    )
  }

  // ---- Phone (mock 03).
  return (
    <AppShell activeChildId={consultation.childId}>
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10">
        <header className="bg-ink px-6 pt-6 pb-7">
          <Link
            to={childPath}
            className="-my-3 inline-flex min-h-11 items-center text-sm font-bold text-[#67e8f9] hover:text-white"
          >
            {backLabel}
          </Link>
          <p className="mt-5 text-sm font-bold text-bright">{date}</p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-white">{consultation.doctorName}</h1>
        </header>

        <section className="px-6 pt-6">
          <div className="flex items-center gap-4 rounded-3xl bg-surface p-4 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
            {photoImage('h-[78px] w-16 shrink-0 rounded-xl')}
            <div>
              <p className="text-[15px] font-extrabold text-ink">Foto de la receta</p>
              <p className="mt-1 text-[13px] text-slate-500">Leída con OCR en el dispositivo</p>
              {seeFull('-mt-1.5 -mb-3 inline-block')}
            </div>
          </div>
        </section>

        {consultation.symptoms && (
          <section className="px-6 pt-7">
            <h2 className={overline}>Síntomas registrados</h2>
            <p className="mt-2.5 text-base leading-relaxed text-[#1f3d44]">{consultation.symptoms}</p>
          </section>
        )}

        <section className="px-6 pt-7">
          <h2 className={overline}>Medicamentos</h2>
          <div className="mt-3.5 flex flex-col gap-3.5">{medications}</div>
        </section>
      </main>
      {viewerOpen && <PhotoViewer src={photoSrc} onClose={() => setViewerOpen(false)} />}
    </AppShell>
  )
}
