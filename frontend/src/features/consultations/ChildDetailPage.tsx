import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatAgeLong } from '../../shared/age'
import { formatDateShort } from '../../shared/date'
import { AppHeader } from '../../shared/ui/AppHeader'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { AppShell } from '../home/AppShell'
import { fetchAccount } from '../home/api'
import { useAccountSession } from '../home/useAccountSession'
import { fetchConsultations, ConsultationApiError } from './api'
import { ConsultationCard } from './ConsultationCard'
import { ConsultationForm } from './ConsultationForm'
import { SummaryCard } from './SummaryCard'

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
  const isDesktop = useIsDesktop()
  const { getAccountId } = useAccountSession()
  const [accountId] = useState<string | null>(() => getAccountId())

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
  // Same condition AppShell uses to show the sidebar.
  const hasSidebar = isDesktop && accountId !== null

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

  const doctorCount = new Set(consultations.map((c) => c.doctorName)).size

  const registerButton = (
    <button
      type="button"
      onClick={() => setShowForm(true)}
      className={`min-h-12 w-full cursor-pointer rounded-2xl bg-confirmed px-6 py-3 text-[15px] font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        hasSidebar
          ? 'focus-visible:ring-confirmed md:-mb-1.5 md:w-[151px] md:px-0'
          : 'focus-visible:ring-bright focus-visible:ring-offset-ink md:w-auto md:self-start'
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
        action={hasSidebar ? registerButton : undefined}
      >
        {hasSidebar ? null : registerButton}
      </AppHeader>

      <div className="mx-auto max-w-5xl px-5 py-7 md:px-10 md:py-9">
        {consultations.length > 0 && (
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Consultas" value={String(consultations.length)} />
            <SummaryCard label="Última consulta" value={formatDateShort(consultations[0].consultDate)} />
            <SummaryCard label="Doctores" value={String(doctorCount)} />
          </div>
        )}
        {consultations.length === 0 ? (
          <div className="rounded-3xl bg-surface p-8 text-center shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
            <p className="text-lg font-bold tracking-tight text-ink">
              Todavía no hay consultas registradas.
            </p>
            <p className="mt-2 text-base text-slate-600">Registra la primera para empezar.</p>
          </div>
        ) : (
          <>
            <h2 className="mb-4 text-xl font-black tracking-tight text-ink">Consultas</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {consultations.map((c, index) => (
                <ConsultationCard key={c.id} consultation={c} isLatest={index === 0} />
              ))}
            </div>
          </>
        )}
      </div>

      {showForm && childId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-x-hidden overflow-y-auto rounded-3xl bg-surface p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <h2 className="text-2xl font-black tracking-tight text-ink">Registrar consulta</h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
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
              onCancel={() => setShowForm(false)}
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
