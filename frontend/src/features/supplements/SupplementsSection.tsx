import { Link } from 'react-router-dom'
import { useLocalDay } from '../../shared/useLocalDay'
import { dayKey } from '../consultations/treatmentDays'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useChildAccess } from '../family/useChildAccess'
import { PlanAvisoCompacto } from '../plans/PlanAvisoCompacto'
import { RoutineCard } from './RoutineCard'
import { useRoutineAccess, useRoutines } from './hooks'

const sectionButton =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'

/**
 * The «Suplementos» section of the child's detail (mock SuplementosSeccion), under «Tomas de hoy» and before «Consultas», in
 * both designs. The routines are the parent's own words: nothing here suggests a supplement, a dose or a time (Principio I).
 * Who sees what: a Tutor creates (with the paid plan: otherwise the plan card; with 10 active, the cap block), a Caregiver sees,
 * marks and chooses their own reminders. What was already created is always shown and markable, whatever the plan.
 */
export function SupplementsSection({ childId, childName }: { childId: string; childName: string }) {
  const day = useLocalDay()
  const today = dayKey(day.from)
  const accountQuery = useCurrentAccount()
  const query = useRoutines(childId, day)
  const list = query.data
  const access = useRoutineAccess(accountQuery.data, childId, list?.paidPlan)
  const childAccess = useChildAccess(accountQuery.data, childId)
  const newPath = `/children/${childId}/suplementos/nueva`

  if (query.isPending) {
    return (
      <section aria-labelledby="supplements-title" className="flex flex-col gap-4">
        <h2 id="supplements-title" className="text-xl font-black tracking-[-0.02em] text-ink">
          Suplementos
        </h2>
        <p className="text-[15px] text-slate-600">Cargando…</p>
      </section>
    )
  }
  if (query.isError || !list) {
    return (
      <section aria-labelledby="supplements-title" className="flex flex-col gap-4">
        <h2 id="supplements-title" className="text-xl font-black tracking-[-0.02em] text-ink">
          Suplementos
        </h2>
        <p className="text-[15px] text-slate-600">No se pudieron cargar los suplementos.</p>
      </section>
    )
  }

  const active = list.routines.filter((r) => r.status === 'active')
  const inactive = list.routines.filter((r) => r.status !== 'active')
  const atCap = list.activeCount >= list.limit
  const canManage = childAccess.canAdd

  return (
    <section aria-labelledby="supplements-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="supplements-title" className="text-xl font-black tracking-[-0.02em] text-ink">
          Suplementos
        </h2>
        {list.activeCount > 0 && (
          <span className="text-sm font-bold text-slate-600">
            {list.activeCount} {list.activeCount === 1 ? 'activa' : 'activas'}
          </span>
        )}
      </div>

      {access.isViewer && list.routines.length > 0 && (
        <p className="-mt-1.5 text-[15px] leading-normal text-body">
          Las rutinas las crea y edita un Tutor. Tú puedes marcar tomas y elegir tus avisos.
        </p>
      )}

      {access.canCreate && !atCap && list.routines.length > 0 && (
        <Link
          to={newPath}
          className="inline-flex min-h-14 cursor-pointer items-center justify-center rounded-[22px] border-2 border-dashed border-hint-border text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
        >
          + Nueva rutina
        </Link>
      )}

      {list.routines.length === 0 && !access.showPlan && (
        <div className="flex flex-col items-start gap-2.5 rounded-[22px] border-2 border-dashed border-hint-border px-[22px] py-6">
          <h3 className="text-lg font-black tracking-[-0.02em] text-ink">Aún no hay rutinas</h3>
          <p className="text-[15px] leading-relaxed text-body">
            {access.canCreate
              ? `Si ${childName} toma algo de forma regular, regístralo con su horario. Cada toma aparece en «Tomas de hoy» para marcarla, y cada persona de la familia puede recibir sus avisos.`
              : 'Un Tutor puede registrar lo que toma de forma regular, con su horario. Cada toma aparece en «Tomas de hoy» para marcarla.'}
          </p>
          {access.canCreate && (
            <Link to={newPath} className={`mt-1 ${sectionButton}`}>
              Crear la primera rutina
            </Link>
          )}
        </div>
      )}

      {access.canCreate && atCap && (
        <div role="status" className="flex flex-col items-start gap-2 rounded-[22px] border-[1.5px] border-hint-border bg-hint px-5 py-[18px]">
          <p className="text-[17px] font-extrabold text-ink">Ya tienes {list.limit} rutinas activas</p>
          <p className="text-[15px] leading-relaxed text-body">
            Es el máximo para {childName}. Para agregar otra, pausa o finaliza una de las de abajo; las pausadas no cuentan.
          </p>
          <a
            href="#suplementos-activas"
            className="mt-1 inline-flex min-h-11 items-center rounded-2xl border-2 border-action px-[18px] text-[15px] font-extrabold text-action hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            Ir a las rutinas activas
          </a>
        </div>
      )}

      {access.showPlan && (
        <PlanAvisoCompacto
          title="Rutinas de suplemento"
          text={`Registra lo que ${childName} toma de forma regular, con su horario. Cada toma se marca como las de medicamento, con avisos para la familia.`}
        />
      )}

      {active.length > 0 && (
        <div id="suplementos-activas" className="flex scroll-mt-4 flex-col gap-4">
          <p className="mt-1 text-xs font-extrabold tracking-[0.1em] text-action uppercase">Activas</p>
          {active.map((r) => (
            <RoutineCard key={r.id} routine={r} today={today} canManage={canManage} />
          ))}
        </div>
      )}
      {inactive.length > 0 && (
        <div className="flex flex-col gap-4">
          <p className="mt-2 text-xs font-extrabold tracking-[0.1em] text-action uppercase">Pausadas y terminadas</p>
          {inactive.map((r) => (
            <RoutineCard key={r.id} routine={r} today={today} canManage={canManage} />
          ))}
        </div>
      )}
    </section>
  )
}
