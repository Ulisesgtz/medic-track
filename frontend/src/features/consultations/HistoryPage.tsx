import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatAgeLong } from '../../shared/age'
import { Notice } from '../../shared/ui/Notice'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { AppShell } from '../home/AppShell'
import { useSidebarSession } from '../home/useSidebarSession'
import { ActiveCriteria } from './ActiveCriteria'
import { ConsultationApiError } from './api'
import { ConsultationCard } from './ConsultationCard'
import { HistoryFilterFields, HistorySearchField } from './HistoryFilters'
import { filterCount, isEmpty } from './historyCriteria'
import { useHistoryCriteria, useHistoryOptions, useHistorySearch } from './useHistory'

const isPlanLimit = (error: unknown) => error instanceof ConsultationApiError && error.kind === 'plan_limit_history_search'

const countText = (n: number) => `${n} ${n === 1 ? 'consulta' : 'consultas'}`

/**
 * `/children/:childId/historial` — the paid plan's history of one child (specs/031): a search box and filters over the
 * consultations already registered, with the same cards and the same detail as the plain list. It only finds; it never
 * ranks, compares or suggests anything (Principio I). There is no mock for it: it is built from the visual system, one
 * design for the phone and another for the web (never mixed).
 *
 * A free account doesn't get the search: it sees the plan notice (decided by the account's plan, and by the server's
 * 422 if the plan was not known yet) and goes back to its list, which is untouched.
 */
export function HistoryPage() {
  const { childId = '' } = useParams<{ childId: string }>()
  // The criteria belong to one child: a different child is a different screen (its criteria are read again).
  return <HistoryScreen key={childId} childId={childId} />
}

function HistoryScreen({ childId }: { childId: string }) {
  const navigate = useNavigate()
  const { isDesktop } = useSidebarSession()
  const accountQuery = useCurrentAccount()
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const free = accountQuery.data?.plan === 'free'
  // Nothing is asked of the server until the plan is known (a free account is never asked); if the account itself can't
  // be read the server decides, with its 422.
  const canSearch = !free && (accountQuery.isSuccess || accountQuery.isError)

  const { criteria, applied, update, clear } = useHistoryCriteria(childId)
  const search = useHistorySearch(childId, applied, canSearch)
  const options = useHistoryOptions(childId, canSearch)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const childPath = `/children/${childId}`
  const planNotice = free || isPlanLimit(search.error) || isPlanLimit(options.error)
  const variant = isDesktop ? 'desktop' : 'phone'
  const childLabel = child ? `${child.firstName} ${child.lastName}` : undefined

  if (!childId) return null

  if (planNotice) {
    return (
      <AppShell activeChildId={childId}>
        <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas px-6 py-10 lg:max-w-3xl">
          <Link to={childPath} className="inline-flex min-h-11 items-center text-sm font-bold text-action">
            ← Consultas
          </Link>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-ink">Historial</h1>
          <p className="mt-2 text-base text-body">Buscar y filtrar el historial es parte del plan completo.</p>
        </main>
        <FreemiumLimitModal reason="history_search" onStayFree={() => navigate(childPath)} onViewPlans={() => navigate('/planes')} />
      </AppShell>
    )
  }

  const consultations = search.data
  const hasCriteria = !isEmpty(criteria)

  const results = (
    <section aria-label="Resultados" aria-busy={search.isFetching} className="flex min-w-0 flex-col gap-4">
      {search.isPending && !search.isError && <p className="text-base font-semibold text-action">Cargando…</p>}
      {search.isError && (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="error">No pudimos cargar el historial. Revisa tu conexión e inténtalo de nuevo.</Notice>
          <button
            type="button"
            onClick={() => void search.refetch()}
            className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            Reintentar
          </button>
        </div>
      )}
      {consultations && (
        <>
          <p className="text-sm font-extrabold text-ink-soft" aria-live="polite">
            {countText(consultations.length)}
          </p>
          {consultations.length === 0 ? (
            <div className="rounded-3xl bg-surface p-8 text-center shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
              {hasCriteria ? (
                <>
                  <p className="text-lg font-bold tracking-tight text-ink">Ninguna consulta coincide con tu búsqueda.</p>
                  <button
                    type="button"
                    onClick={clear}
                    className="mt-4 min-h-11 cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
                  >
                    Limpiar filtros
                  </button>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold tracking-tight text-ink">Todavía no hay consultas registradas.</p>
                  <p className="mt-2 text-base text-slate-600">Cuando registres la primera, la podrás buscar aquí.</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {consultations.map((c, index) => (
                <ConsultationCard key={c.id} consultation={c} isLatest={index === 0 && !hasCriteria} variant={variant} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )

  const active = <ActiveCriteria criteria={criteria} onChange={update} onClear={clear} />
  const fields = (
    <HistoryFilterFields
      variant={variant}
      criteria={criteria}
      onChange={update}
      options={options.data}
      optionsFailed={options.isError}
    />
  )

  // ---- Web: a header and two columns — the filters at the left, the results at the right.
  if (isDesktop) {
    return (
      <AppShell activeChildId={childId}>
        <main className="min-w-0 bg-canvas px-10 pt-9 pb-11">
          <div className="flex flex-col gap-[26px]">
            <div className="flex min-w-0 flex-col gap-2">
              <Link to={childPath} className="-my-3 inline-flex min-h-11 items-center text-sm font-bold text-action">
                ← {childLabel ? `Consultas de ${child?.firstName}` : 'Consultas'}
              </Link>
              <h1 className="text-[38px] leading-[1.1] font-black tracking-[-0.035em] text-ink">Historial</h1>
              {child && <p className="text-sm font-bold text-action">{`${childLabel} · ${formatAgeLong(child.birthDate)}`}</p>}
            </div>

            <div className="grid grid-cols-[minmax(280px,340px)_minmax(0,1fr)] items-start gap-[22px]">
              <aside aria-label="Filtros" className="sticky top-6 flex min-w-0 flex-col gap-5 rounded-3xl bg-surface p-6 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
                <HistorySearchField variant="desktop" criteria={criteria} onChange={update} />
                {fields}
              </aside>
              <div className="flex min-w-0 flex-col gap-4">
                {active}
                {results}
              </div>
            </div>
          </div>
        </main>
      </AppShell>
    )
  }

  // ---- Phone: dark header, the search box, a "Filtros" toggle for the rest, the active pills and the cards.
  const filters = filterCount(criteria)
  return (
    <AppShell activeChildId={childId}>
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10">
        <header className="bg-ink px-6 pt-6 pb-7">
          <Link to={childPath} className="-my-3 inline-flex min-h-11 items-center text-sm font-bold text-bright-soft hover:text-white">
            ← Consultas
          </Link>
          <h1 className="mt-5 text-2xl font-black tracking-tight text-white">Historial</h1>
          {child && <p className="mt-1 text-sm font-semibold text-hint-border">{`${childLabel} · ${formatAgeLong(child.birthDate)}`}</p>}
        </header>

        <div className="flex flex-col gap-4 px-6 pt-6">
          <HistorySearchField variant="phone" criteria={criteria} onChange={update} />
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="history-filters"
            onClick={() => setFiltersOpen((open) => !open)}
            className="inline-flex min-h-11 cursor-pointer items-center justify-between rounded-2xl border-[1.5px] border-slate-300 bg-surface px-4 text-[15px] font-extrabold text-ink transition-colors duration-200 hover:border-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            <span>{filters > 0 ? `Filtros (${filters})` : 'Filtros'}</span>
            <span aria-hidden="true" className="text-action">
              {filtersOpen ? '▴' : '▾'}
            </span>
          </button>
          {filtersOpen && (
            <div id="history-filters" className="rounded-3xl bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
              {fields}
            </div>
          )}
          {active}
          {results}
        </div>
      </main>
    </AppShell>
  )
}
