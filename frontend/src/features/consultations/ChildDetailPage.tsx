import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatAgeLong } from '../../shared/age'
import { formatDateShort, formatDayMonth } from '../../shared/date'
import { useLocalDay } from '../../shared/useLocalDay'
import { AppHeader } from '../../shared/ui/AppHeader'
import { AppShell } from '../home/AppShell'
import { fetchAccount } from '../home/api'
import { useSidebarSession } from '../home/useSidebarSession'
import { fetchChildOverview, fetchConsultations, ConsultationApiError } from './api'
import { ConsultationCard } from './ConsultationCard'
import { ConsultationForm } from './ConsultationForm'
import { SummaryCard } from './SummaryCard'
import { TodayDosesPanel } from './TodayDosesPanel'

/**
 * A child's detail page: lists their medical consultations (FR-001) with an
 * empty state (FR-002), and a "Registrar consulta" control that opens the
 * registration form (FR-003).
 */
export function ChildDetailPage() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Whether the registration form holds anything (typed fields or a photo).
  const formDirtyRef = useRef(false)
  const handleDirtyChange = useCallback((dirty: boolean) => {
    formDirtyRef.current = dirty
  }, [])

  // Every way of dismissing the form (Escape, backdrop, X, Cancelar) goes
  // through here, so a half-filled form isn't thrown away by accident.
  const requestCloseRef = useRef(requestClose)
  useEffect(() => {
    requestCloseRef.current = requestClose
  })

  function requestClose() {
    if (formDirtyRef.current && !window.confirm('¿Descartar la consulta? Se perderá lo que capturaste.')) return
    formDirtyRef.current = false
    setShowForm(false)
  }

  // Real-modal behavior for the registration form: Escape closes it, focus
  // moves into it on open and returns to "Nueva consulta" on close.
  useEffect(() => {
    if (!showForm) return
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') requestCloseRef.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      opener?.focus()
    }
  }, [showForm])
  const { accountId, hasSidebar } = useSidebarSession()

  // The child's own data (name, birth date) comes from the account the
  // sidebar already loads — same query key, so no extra request. Without a
  // saved account the header just falls back to the generic title.
  const accountQuery = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => fetchAccount(accountId!),
    enabled: accountId !== null,
    retry: false,
  })
  const child = accountQuery.data?.children.find((c) => c.id === childId)

  // "Today" is the parent's local day (it rolls over at midnight, even with the
  // app left open); only the client knows its time zone, so it sends the window.
  const today = useLocalDay()
  const overviewQuery = useQuery({
    queryKey: ['overview', childId, today.from.toISOString()],
    queryFn: () => fetchChildOverview(childId!, today.from, today.to),
    enabled: !!childId,
    retry: false,
  })

  const query = useQuery({
    queryKey: ['consultations', childId],
    queryFn: () => fetchConsultations(childId!),
    enabled: !!childId,
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
    const notFound = query.error instanceof ConsultationApiError && query.error.kind === 'child_not_found'
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
          <p className="text-lg font-bold tracking-tight text-ink">
            {notFound ? 'No se encontró este hijo.' : 'Ocurrió un error al cargar sus consultas.'}
          </p>
          <Link
            to="/home"
            className="mt-6 inline-flex min-h-11 cursor-pointer items-center rounded-2xl border-2 border-action px-5 py-2.5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint"
          >
            Volver a mi home
          </Link>
        </div>
      </main>
    )
  }

  const consultations = query.data ?? []

  // Summary row of the desktop mock: today's unmarked doses (amber), the
  // consultation count, and the treatment still running (dark).
  const overviewStatus = overviewQuery.isPending ? 'loading' : overviewQuery.isError ? 'error' : 'ready'
  const overview = overviewQuery.data
  const todayDoses = overview?.doses ?? []
  const unmarked = todayDoses.filter((d) => !d.taken).length
  const treatment = overview?.activeTreatment ?? null
  const sinceYear = consultations.reduce<string | null>(
    (min, c) => (min === null || c.consultDate < min ? c.consultDate : min),
    null,
  )?.slice(0, 4)
  const placeholder = overviewStatus === 'loading' ? 'cargando…' : 'no disponible'

  // Top-right corner at every width (desktop mock: 151x48, beside the title;
  // without the sidebar it sits opposite the logo).
  const registerButton = (
    <button
      type="button"
      onClick={() => setShowForm(true)}
      className={`min-h-12 w-[151px] shrink-0 cursor-pointer rounded-2xl bg-confirmed px-0 py-3 text-[15px] font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        hasSidebar
          ? '-mb-1.5 focus-visible:ring-confirmed'
          : 'focus-visible:ring-bright focus-visible:ring-offset-ink'
      }`}
    >
      Nueva consulta
    </button>
  )

  return (
    <AppShell activeChildId={childId}>
    <main className="min-h-screen bg-canvas pb-16">
      <AppHeader
        eyebrow={
          <>
            {!hasSidebar && (
              <Link to="/home" className="-my-3 inline-flex min-h-11 items-center hover:underline">
                ← Volver a mi home
              </Link>
            )}
            {child && (
              <span className="block">
                {child.firstName} {child.lastName} · {formatDateShort(child.birthDate)}
              </span>
            )}
          </>
        }
        title={child ? formatAgeLong(child.birthDate) : 'Consultas médicas'}
        action={registerButton}
      />

      <div className="mx-auto max-w-5xl px-5 py-7 md:px-10 md:py-9">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {overviewStatus !== 'ready' ? (
            <SummaryCard label="Tomas de hoy" value="—" sub={placeholder} />
          ) : todayDoses.length === 0 ? (
            <SummaryCard label="Tomas de hoy" value="0" sub="sin tomas hoy" />
          ) : unmarked > 0 ? (
            <SummaryCard tone="pending" label="Tomas de hoy" value={String(unmarked)} sub="sin marcar" />
          ) : (
            <SummaryCard tone="confirmed" label="Tomas de hoy" value="0" sub="todas marcadas" />
          )}
          <SummaryCard
            label="Consultas"
            value={String(consultations.length)}
            sub={sinceYear ? `desde ${sinceYear}` : 'sin consultas'}
          />
          {overviewStatus !== 'ready' ? (
            <SummaryCard tone="ink" size="md" label="Tratamiento activo" value="—" sub={placeholder} />
          ) : treatment ? (
            <SummaryCard
              tone="ink"
              size="md"
              label="Tratamiento activo"
              value={treatment.otherCount > 0 ? `${treatment.medicationName} +${treatment.otherCount}` : treatment.medicationName}
              sub={`termina el ${formatDayMonth(treatment.endsAt)}`}
            />
          ) : (
            <SummaryCard tone="ink" size="md" label="Tratamiento activo" value="Ninguno" sub="sin tomas pendientes" />
          )}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,330px)] lg:items-start">
          <section>
            <h2 className="mb-4 text-xl font-black tracking-tight text-ink">Consultas</h2>
            {consultations.length === 0 ? (
              <div className="rounded-3xl bg-surface p-8 text-center shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
                <p className="text-lg font-bold tracking-tight text-ink">
                  Todavía no hay consultas registradas.
                </p>
                <p className="mt-2 text-base text-slate-600">Registra la primera para empezar.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {consultations.map((c, index) => (
                  <ConsultationCard key={c.id} consultation={c} isLatest={index === 0} />
                ))}
              </div>
            )}
          </section>

          {childId && (
            <TodayDosesPanel
              doses={todayDoses}
              status={overviewStatus}
              className="order-first lg:order-none"
            />
          )}
        </div>
      </div>

      {showForm && childId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
          onClick={requestClose}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-consultation-title"
            tabIndex={-1}
            className="max-h-[85vh] w-full max-w-lg overflow-x-hidden overflow-y-auto rounded-3xl bg-surface p-7 shadow-2xl outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <h2 id="register-consultation-title" className="text-2xl font-black tracking-tight text-ink">
                Registrar consulta
              </h2>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Cerrar"
                className="-mt-2 -mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors duration-200 hover:bg-hint hover:text-ink"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <ConsultationForm
              childId={childId}
              onCancel={requestClose}
              onDirtyChange={handleDirtyChange}
              onSuccess={(consultationId) => {
                setShowForm(false)
                queryClient.invalidateQueries({ queryKey: ['consultations', childId] })
                navigate(`/consultations/${consultationId}`)
              }}
            />
          </div>
        </div>
      )}
    </main>
    </AppShell>
  )
}
