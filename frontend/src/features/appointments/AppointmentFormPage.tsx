import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { formatDateLong } from '../../shared/date'
import { Notice } from '../../shared/ui/Notice'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { fetchConsultationDetail } from '../consultations/api'
import { useChildAccess } from '../family/useChildAccess'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { AppointmentApiError } from './api'
import { AppointmentFields } from './AppointmentFields'
import {
  emptyAppointmentValues,
  hasAppointment,
  toAppointmentInput,
  validateAppointment,
  valuesOfAppointment,
  type AppointmentErrors,
  type AppointmentValues,
} from './appointmentValues'
import { useAppointment, useConsultationAppointment, useCreateAppointment, useUpdateAppointment } from './hooks'
import type { AppointmentInput } from './types'

const card = 'rounded-[22px] bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'

/**
 * `/citas/:appointmentId/editar` (mock E1–E4) and `/consultations/:consultationId/cita/nueva` (mock A2): the appointment's fields
 * as a page. Editing changes the date, the note and the notices — what was sent is not sent again, and what moved is made again;
 * adding writes only the appointment, the consultation (shown as a read-only reference) does not change. Leaving with data asks
 * first; the server's 422 opens the plan notice and keeps what was typed.
 */
export function AppointmentFormPage() {
  const params = useParams<{ appointmentId: string; consultationId: string }>()
  const editing = params.appointmentId !== undefined
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const { isDesktop } = useSidebarSession()
  const accountQuery = useCurrentAccount()

  const appointmentQuery = useAppointment(params.appointmentId)
  const consultationQuery = useQuery({
    queryKey: ['consultation', params.consultationId],
    queryFn: async () => fetchConsultationDetail(params.consultationId!, await getToken()),
    enabled: !editing && !!params.consultationId,
    retry: false,
  })
  const existingQuery = useConsultationAppointment(editing ? undefined : params.consultationId)

  const appointment = appointmentQuery.data
  const consultation = consultationQuery.data
  const childId = appointment?.childId ?? consultation?.childId
  const consultationId = params.consultationId ?? appointment?.consultationId
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const access = useChildAccess(accountQuery.data, childId)

  const update = useUpdateAppointment(params.appointmentId ?? '')
  const create = useCreateAppointment(params.consultationId ?? '')

  const [values, setValues] = useState<AppointmentValues | null>(null)
  const [errors, setErrors] = useState<AppointmentErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const closePlan = useCallback(() => setPlanOpen(false), [])
  const dirtyRef = useRef(false)
  const [dirty, setDirty] = useState(false)
  useUnsavedWork(dirty)

  const initial = editing ? (appointment ? valuesOfAppointment(appointment) : null) : emptyAppointmentValues()
  const current = values ?? initial
  const change = (next: AppointmentValues) => {
    setValues(next)
    const isDirty = JSON.stringify(next) !== JSON.stringify(initial)
    dirtyRef.current = isDirty
    setDirty(isDirty)
  }

  const backTo = editing ? `/children/${childId}` : `/consultations/${consultationId}`
  const backLabel = editing ? `← ${child?.firstName ?? 'Volver'}` : consultation ? `← Consulta del ${formatDateLong(consultation.consultDate)}` : '← Volver'
  const eyebrow = editing
    ? `Próxima cita · ${child ? `${child.firstName} ${child.lastName}` : ''}`.trim()
    : consultation
      ? `Consulta del ${formatDateLong(consultation.consultDate)} · ${child ? `${child.firstName} ${child.lastName}` : ''}`.trim()
      : 'Próxima cita'
  const frame = (content: ReactNode) => (
    <RoutinePageFrame
      isDesktop={isDesktop}
      childId={childId}
      backLabel={backLabel}
      backTo={backTo}
      eyebrow={eyebrow}
      title={editing ? 'Editar cita' : 'Agregar próxima cita'}
      maxWidth="max-w-[640px]"
    >
      {content}
    </RoutinePageFrame>
  )
  const message = (text: string) => <p className={`${card} text-base leading-relaxed text-body`}>{text}</p>

  if (editing && appointmentQuery.isPending) return frame(<p className="text-base font-semibold text-action">Cargando…</p>)
  if (editing && (appointmentQuery.isError || !appointment)) return frame(message('No se encontró esta cita.'))
  if (!editing && consultationQuery.isPending) return frame(<p className="text-base font-semibold text-action">Cargando…</p>)
  if (!editing && (consultationQuery.isError || !consultation)) return frame(message('No se encontró esta consulta.'))
  if (accountQuery.data && !access.canAdd) return frame(message('Solo un Tutor puede anotar o editar citas.'))
  if (editing && appointment && appointment.status !== 'scheduled' && appointment.status !== 'unmarked') {
    return frame(message('Esta cita ya está cerrada y no se puede editar. Para otra fecha, anota una cita nueva desde la consulta.'))
  }
  if (!editing && existingQuery.data?.appointment) {
    return frame(message('Esta consulta ya tiene una próxima cita. Para cambiarla, edítala desde su tarjeta.'))
  }
  const paid = editing ? appointment?.canEdit !== false : existingQuery.data?.paidPlan !== false
  const consultDate = editing ? appointment?.consultDate : consultation?.consultDate
  const form = current ?? emptyAppointmentValues()

  const leave = () => {
    if (dirtyRef.current && !window.confirm('¿Descartar la cita? Se perderá lo que capturaste.')) return
    navigate(backTo)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setNotice(null)
    const found = validateAppointment(form, consultDate)
    if (!hasAppointment(form) && !found.date) found.date = 'Elige la fecha de la cita.'
    if (!hasAppointment(form) && !found.time) found.time = 'Escribe la hora de la cita.'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const input: AppointmentInput = toAppointmentInput(form)
    try {
      if (editing) await update.mutateAsync(input)
      else await create.mutateAsync(input)
      dirtyRef.current = false
      // replace: "back" from the result lands on where the parent came from, not on an already-sent form.
      navigate(editing ? `/children/${childId}` : `/consultations/${consultationId}`, { replace: true })
    } catch (error) {
      if (error instanceof AppointmentApiError && error.kind === 'plan_required') setPlanOpen(true)
      else if (error instanceof AppointmentApiError && error.kind === 'exists') setNotice('Esta consulta ya tiene una próxima cita.')
      else if (error instanceof AppointmentApiError && error.kind === 'closed') setNotice('Esta cita ya está cerrada y no se puede editar.')
      else if (error instanceof AppointmentApiError && error.kind === 'validation_error') {
        const field = error.details?.find((d) => d.field === 'startsAt')
        if (field) setErrors({ date: 'La próxima cita no puede ser antes de la consulta.' })
        else setNotice('No se pudo guardar la cita. Revisa los datos e inténtalo de nuevo.')
      } else setNotice('No se pudo guardar la cita. Inténtalo de nuevo.')
    }
  }

  const pending = update.isPending || create.isPending
  return (
    <>
      {frame(
        <form noValidate onSubmit={submit} className={`${card} flex flex-col gap-5`}>
          {editing ? (
            <p role="note" className="rounded-[14px] border-[1.5px] border-hint-border bg-hint px-4 py-3.5 text-sm leading-normal text-body">
              Los cambios los ve toda la familia y los avisos se vuelven a programar.
            </p>
          ) : (
            consultation && (
              <p role="note" className="rounded-[14px] border-[1.5px] border-hint-border bg-hint px-4 py-3.5 text-sm leading-normal text-body">
                Consulta del {formatDateLong(consultation.consultDate)} con {consultation.doctorName}. Solo se agrega la cita; lo demás de la consulta no
                cambia.
              </p>
            )
          )}
          <AppointmentFields value={form} onChange={change} errors={errors} disabled={!paid} />
          {notice && <Notice tone="error">{notice}</Notice>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button
              type="button"
              onClick={leave}
              className="min-h-12 flex-[1_1_120px] cursor-pointer rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
            {paid && (
              <button
                type="submit"
                disabled={pending}
                className="min-h-12 flex-[2_1_180px] cursor-pointer rounded-2xl bg-confirmed px-7 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar cita'}
              </button>
            )}
          </div>
        </form>,
      )}
      {planOpen && <FreemiumLimitModal reason="appointments" onStayFree={closePlan} onViewPlans={() => navigate('/planes')} />}
    </>
  )
}
