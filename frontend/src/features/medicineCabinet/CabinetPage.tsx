import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { cabinetAccess } from './cabinetAccess'
import { fold } from './cabinetForm'
import { CABINET, listCount, noResults } from './cabinetText'
import { BoxIcon, CabinetRow, CaregiverNote, card } from './CabinetParts'
import { useCabinet } from './hooks'
import { needsConnection } from '../../shared/offline/queryView'
import { SCREEN_NEEDS_CONNECTION } from '../../shared/offline/offlineText'

/**
 * `/botiquin` (specs/062, mock pantalla 2): the family's medicine cabinet, alphabetical (the server's order), with a search by name
 * that filters in the phone. «+ Agregar al botiquín» is the one solid button; a Caregiver only sees. With the family's plan not paid
 * the button opens the plan notice (what was saved stays seen, edited and removed).
 */
export function CabinetPage() {
  const { isDesktop } = useSidebarSession()
  const desktop = isDesktop
  const variant = desktop ? 'desktop' : 'phone'
  const navigate = useNavigate()
  const accountQuery = useCurrentAccount()
  const access = cabinetAccess(accountQuery.data)
  const query = useCabinet(access.ownerId, access.canView)
  const [q, setQ] = useState('')
  const [planOpen, setPlanOpen] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)

  const items = query.data?.items ?? []
  const searching = q.trim() !== ''
  const shown = searching ? items.filter((it) => fold(it.name).includes(fold(q.trim()))) : items
  const canAdd = query.data?.canAdd ?? access.canAdd
  const canEdit = query.data?.canEdit ?? access.canEdit
  const empty = query.isSuccess && items.length === 0

  const addButton = (full: boolean) =>
    canAdd ? (
      <Link to="/botiquin/nuevo" className={`${pageHeaderButton('primary', variant)} ${full ? 'w-full' : ''}`}>
        {CABINET.add}
      </Link>
    ) : canEdit ? (
      <button ref={addRef} type="button" onClick={() => setPlanOpen(true)} className={`${pageHeaderButton('primary', variant)} ${full ? 'w-full' : ''}`}>
        {CABINET.add}
      </button>
    ) : null


  const loading = (
    <div aria-busy="true" aria-label={CABINET.loading} className={`${card} overflow-hidden`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`flex items-center gap-3.5 px-4 py-3 ${desktop ? 'min-h-[76px]' : 'min-h-[84px]'} ${i ? 'border-t border-hint-edge' : ''}`}>
          <span className="h-14 w-14 flex-none rounded-xl bg-skel" />
          <span className="flex flex-1 flex-col gap-[7px]">
            <span className="h-4 w-40 rounded-[5px] bg-skel" />
            <span className="h-3 w-[120px] rounded-[5px] bg-skel" />
            <span className="h-3 w-[100px] rounded-[5px] bg-skel" />
          </span>
        </div>
      ))}
    </div>
  )

  const content = !access.canView ? null : needsConnection(query) ? (
    <p className="text-base font-bold text-ink">{SCREEN_NEEDS_CONNECTION}</p>
  ) : query.isPending ? (
    loading
  ) : empty ? (
    <div className="flex flex-col items-center gap-4 rounded-[22px] border-[1.5px] border-dashed border-hint-border px-5 py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-hint text-action">
        <BoxIcon size={28} />
      </span>
      <span className="text-[17px] font-extrabold text-ink">{CABINET.emptyTitle}</span>
      {addButton(true) && <div className="w-full [&>*]:w-full">{addButton(true)}</div>}
    </div>
  ) : query.isSuccess ? (
    <>
      <div className={`relative ${desktop ? 'w-[420px] max-w-full' : ''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="absolute top-3.5 left-3.5 text-muted">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          type="search"
          aria-label={CABINET.searchPlaceholder}
          placeholder={CABINET.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-12 w-full rounded-[14px] border-[1.5px] border-calendar-muted bg-surface pr-3.5 pl-11 text-base text-ink placeholder:text-calendar-muted focus:border-2 focus:border-ink focus:outline-none"
        />
      </div>
      {shown.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-muted">{listCount(shown.length, items.length, searching)}</span>
          <div className={`${card} overflow-hidden`}>
            {shown.map((it, i) => (
              <CabinetRow key={it.id} item={it} desktop={desktop} first={i === 0} />
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-[22px] border-[1.5px] border-dashed border-hint-border p-5 text-[15px] leading-normal text-body">{noResults(q.trim())}</p>
      )}
    </>
  ) : null

  return (
    <RoutinePageFrame
      isDesktop={desktop}
      childId={undefined}
      backLabel={CABINET.backHome}
      backTo="/home"
      title={CABINET.title}
      subtitle={CABINET.subtitle}
      actions={!empty && query.isSuccess ? addButton(!desktop) ?? undefined : undefined}
      state={query.isError && query.data === undefined && !needsConnection(query) ? 'error' : undefined}
      errorWhat={CABINET.loadFailed}
      onRetry={() => void query.refetch()}
    >
      {accountQuery.data && !access.canView && (
        <p className={`${card} p-6 text-base leading-relaxed text-body`}>
          {CABINET.notAvailable}{' '}
          <Link to="/home" className="font-bold text-action hover:underline">
            {CABINET.backHome.replace('← ', '')}
          </Link>
        </p>
      )}
      {access.canView && !canEdit && query.isSuccess && <CaregiverNote desktop={desktop} />}
      {content}
      {planOpen && <FreemiumLimitModal reason="medicine_cabinet" opener={addRef} onStayFree={() => setPlanOpen(false)} onViewPlans={() => navigate('/planes')} />}
    </RoutinePageFrame>
  )
}
