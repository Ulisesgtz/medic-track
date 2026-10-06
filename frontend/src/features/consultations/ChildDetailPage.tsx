import { useParams, Link } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { formatAgeLong } from '../../shared/age'
import { formatDateShort, formatDayMonth } from '../../shared/date'
import { useLocalDay } from '../../shared/useLocalDay'
import { AppShell } from '../home/AppShell'
import { useSidebarSession } from '../home/useSidebarSession'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useChildAccess } from '../family/useChildAccess'
import { fetchChildOverview, fetchConsultations, ConsultationApiError } from './api'
import { ConsultationCard } from './ConsultationCard'
import { HistoryEntry } from './HistoryEntry'
import { NewConsultationEntry } from './NewConsultationEntry'
import { SummaryCard } from './SummaryCard'
import { TodayDosesBlock } from './TodayDosesBlock'
import { TodayDosesPanel } from './TodayDosesPanel'
import { DOSE_REFETCH_MS, isUnmarked, isUnregistered, unregisteredText } from './doseStatus'

/**
 * A child's detail page: their consultations (FR-001) with an empty state
 * (FR-002) and the entry to register a new one (FR-003, now the page at
 * `/children/:id/consultations/new`). Two layouts, both from the delivered
 * mockups: on the phone (mock 02) the child's header, the amber "Tomas de hoy"
 * block and the list; on the web (board screen 6) the header row with
 * "Nueva consulta", three summary cards, the list and the "Tomas de hoy"
 * panel (plus the children sidebar when there is an account).
 */
export function ChildDetailPage() {
  const { childId } = useParams<{ childId: string }>()
  const { isDesktop } = useSidebarSession()

  // The child's own data (name, birth date) comes from the same account
  // query the sidebar already uses (`useCurrentAccount`, `GET /accounts/me`)
  // — no separate request. If it hasn't resolved yet (or the child isn't
  // in it), the header falls back to the generic title.
  const accountQuery = useCurrentAccount()
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  // Specs/032: what the session can do with THIS child — the plan is its family's, and a Caregiver can't add.
  const access = useChildAccess(accountQuery.data, childId)

  // "Today" is the parent's local day (it rolls over at midnight, even with the
  // app left open); only the client knows its time zone, so it sends the window.
  const today = useLocalDay()
  const { getToken } = useAuth()
  const overviewQuery = useQuery({
    queryKey: ['overview', childId, today.from.toISOString()],
    queryFn: async () => fetchChildOverview(childId!, today.from, today.to, await getToken()),
    enabled: !!childId,
    retry: false,
    // specs/013: a dose turns "sin registrar" on its own; asking again every minute shows it without reloading.
    refetchInterval: DOSE_REFETCH_MS,
  })

  const query = useQuery({
    queryKey: ['consultations', childId],
    queryFn: async () => fetchConsultations(childId!, await getToken()),
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
  const newConsultationPath = `/children/${childId}/consultations/new`
  // specs/031: searching the history is the paid plan's; the list itself is the same for every plan.
  const historyPath = `/children/${childId}/historial`
  const historyIsFree = access.isFree

  const overviewStatus = overviewQuery.isPending ? 'loading' : overviewQuery.isError ? 'error' : 'ready'
  const overview = overviewQuery.data
  const todayDoses = overview?.doses ?? []
  const unmarked = todayDoses.filter(isUnmarked).length
  const unregistered = todayDoses.filter(isUnregistered).length
  const unregisteredSuffix = unregistered > 0 ? ` · ${unregisteredText(unregistered)}` : ''
  const treatment = overview?.activeTreatment ?? null
  // specs/030: on the free plan a treatment still running means the next consultation has to wait (or the treatment
  // be finished), so the pop-up opens right away instead of a form the server would refuse. Paid accounts: never.
  const newConsultationBlocked = access.isFree && treatment !== null
  const sinceYear = consultations
    .reduce<string | null>((min, c) => (min === null || c.consultDate < min ? c.consultDate : min), null)
    ?.slice(0, 4)
  const placeholder = overviewStatus === 'loading' ? 'cargando…' : 'no disponible'

  const consultationList = (variant: 'phone' | 'desktop') =>
    consultations.length === 0 ? (
      <div className="rounded-3xl bg-surface p-8 text-center shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
        <p className="text-lg font-bold tracking-tight text-ink">Todavía no hay consultas registradas.</p>
        <p className="mt-2 text-base text-slate-600">Registra la primera para empezar.</p>
      </div>
    ) : (
      consultations.map((c, index) => (
        <ConsultationCard key={c.id} consultation={c} isLatest={index === 0} variant={variant} />
      ))
    )

  // ---- Web: header row, three summary cards, list + "Tomas de hoy" panel.
  if (isDesktop) {
    return (
      <AppShell activeChildId={childId}>
        <main className="min-w-0 bg-canvas px-10 pt-9 pb-11">
          <div className="flex flex-col gap-[30px]">
            <div className="flex items-end justify-between gap-6">
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-sm font-bold text-action">
                  {child ? `${child.firstName} ${child.lastName} · ${formatDateShort(child.birthDate)}` : 'Consultas médicas'}
                </p>
                <h1 className="text-[38px] leading-[1.1] font-black tracking-[-0.035em] text-ink">
                  {child ? formatAgeLong(child.birthDate) : 'Consultas médicas'}
                </h1>
              </div>
              {access.canAdd && (
                <NewConsultationEntry
                  to={newConsultationPath}
                  blocked={newConsultationBlocked}
                  className="min-h-12 shrink-0 cursor-pointer rounded-[14px] bg-confirmed px-[22px] py-[15px] text-[15px] font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2"
                >
                  Nueva consulta
                </NewConsultationEntry>
              )}
            </div>

            <div className="grid grid-cols-3 gap-[18px]">
              {overviewStatus !== 'ready' ? (
                <SummaryCard label="Tomas de hoy" value="—" sub={placeholder} />
              ) : todayDoses.length === 0 ? (
                <SummaryCard label="Tomas de hoy" value="0" sub="sin tomas hoy" />
              ) : unmarked > 0 ? (
                <SummaryCard tone="pending" label="Tomas de hoy" value={String(unmarked)} sub={`sin marcar${unregisteredSuffix}`} />
              ) : unregistered > 0 ? (
                <SummaryCard tone="confirmed" label="Tomas de hoy" value="0" sub={`nada por marcar${unregisteredSuffix}`} />
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

            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-[22px]">
              <section className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-black tracking-[-0.02em] text-ink">Consultas</h2>
                  <HistoryEntry
                    to={historyPath}
                    free={historyIsFree}
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border-2 border-action px-4 text-[14px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                  >
                    Buscar en el historial
                  </HistoryEntry>
                </div>
                {consultationList('desktop')}
              </section>
              <TodayDosesPanel doses={todayDoses} status={overviewStatus} />
            </div>
          </div>
        </main>
      </AppShell>
    )
  }

  // ---- Phone (mock 02).
  return (
    <AppShell activeChildId={childId}>
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10">
        <header className="bg-ink px-6 pt-6 pb-7">
          <Link
            to="/home"
            className="-my-3 inline-flex min-h-11 items-center text-sm font-bold text-bright-soft hover:text-white"
          >
            ← Tus hijos
          </Link>
          {child ? (
            <div className="mt-5 flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl bg-bright text-2xl font-black text-ink"
              >
                {child.firstName.charAt(0)}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black tracking-tight text-white">
                  {child.firstName} {child.lastName}
                </h1>
                <p className="mt-1 text-sm font-semibold text-hint-border">
                  {formatAgeLong(child.birthDate)} · {formatDateShort(child.birthDate)}
                </p>
              </div>
            </div>
          ) : (
            <h1 className="mt-5 text-2xl font-black tracking-tight text-white">Consultas médicas</h1>
          )}
        </header>

        <TodayDosesBlock doses={todayDoses} status={overviewStatus} />

        <section className="px-6 pt-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-black tracking-tight text-ink">Consultas</h2>
            {access.canAdd && (
              <NewConsultationEntry
                to={newConsultationPath}
                blocked={newConsultationBlocked}
                className="-my-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-action"
              >
                + Nueva
              </NewConsultationEntry>
            )}
          </div>
          <HistoryEntry
            to={historyPath}
            free={historyIsFree}
            className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-2xl border-[1.5px] border-slate-300 bg-surface px-4 text-sm font-extrabold text-action transition-colors duration-200 hover:border-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            Buscar en el historial
          </HistoryEntry>
          <div className="mt-4 flex flex-col gap-3.5">{consultationList('phone')}</div>
        </section>
      </main>
    </AppShell>
  )
}
