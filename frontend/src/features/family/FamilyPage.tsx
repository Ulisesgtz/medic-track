import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Notice } from '../../shared/ui/Notice'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { PlanAvisoCompacto } from '../plans/PlanAvisoCompacto'
import { AppShell } from '../home/AppShell'
import { useSidebarSession } from '../home/useSidebarSession'
import { cancelInvitation, createInvitation, FamilyApiError, leaveFamily, removeMember, resendInvitation } from './api'
import { ConfirmDialog } from './ConfirmDialog'
import { FamilyCounter } from './FamilyCounter'
import { InvitationsList } from './InvitationsList'
import { InviteForm } from './InviteForm'
import { InviteLink } from './InviteLink'
import { MembersList } from './MembersList'
import { namesText, ROLE_LABEL } from './roles'
import type { CreatedInvitation, FamilyInvitation, FamilyMember, FamilyView, InviteRole } from './types'
import { useFamily } from './useFamily'

/**
 * «Familia» (specs/032-compartir-con-familia), built from the delivered mock `referencia/Familia PediTrack.dc.html`: who has
 * access to the children, the invitations waiting and, to who can do everything, the form to invite someone. Two separate
 * designs chosen with `useIsDesktop`: on the phone a dark header with the counter and one column; on the web the page inside
 * the sidebar shell, the people at the left and the form, the link or the plan at the right.
 *
 * Sharing is the paid plan's. The free plan sees the plan card (and the pop-up); a person invited to a family that stopped
 * paying sees why they can only view and mark doses. The deviations from the mock are listed in the spec.
 */
export function FamilyPage() {
  const { isDesktop } = useSidebarSession()
  const family = useFamily()
  const account = useCurrentAccount().data
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [link, setLink] = useState<CreatedInvitation | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  // Leaving and removing ask first; each dialog gives the focus back to the button that opened it.
  const [removing, setRemoving] = useState<FamilyMember | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const removeOpener = useRef<HTMLElement | null>(null)
  const leaveOpener = useRef<HTMLButtonElement>(null)
  const closeDialog = useCallback(() => {
    setRemoving(null)
    setLeaving(false)
    setDialogError(null)
  }, [])
  const closePlan = useCallback(() => setPlanOpen(false), [])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['family'] })

  const invite = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: InviteRole }) => createInvitation(email, role, await getToken()),
    onSuccess: (created) => {
      setLink(created)
      void refresh()
    },
    onError: (error) => {
      // The server's word on the plan wins over what the page showed: the pop-up, not a form error.
      if (error instanceof FamilyApiError && error.kind === 'plan_required') {
        setPlanOpen(true)
        void refresh()
      }
    },
  })

  async function onInvite(email: string, role: InviteRole) {
    setActionError(null)
    try {
      await invite.mutateAsync({ email, role })
    } catch (e) {
      if (e instanceof FamilyApiError && e.kind === 'plan_required') return
      throw e
    }
  }

  async function onResend(inv: FamilyInvitation) {
    setActionError(null)
    setBusyId(inv.id)
    try {
      setLink(await resendInvitation(inv.id, await getToken()))
      await refresh()
    } catch (e) {
      if (e instanceof FamilyApiError && e.kind === 'plan_required') setPlanOpen(true)
      else if (e instanceof FamilyApiError && e.kind === 'family_full')
        setActionError('Tu familia ya está completa. Cancela otra invitación para enviar esta de nuevo.')
      else setActionError('No pudimos enviar la invitación de nuevo. Inténtalo otra vez.')
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function onCancel(inv: FamilyInvitation) {
    setActionError(null)
    setBusyId(inv.id)
    try {
      await cancelInvitation(inv.id, await getToken())
      setLink((current) => (current?.id === inv.id ? null : current))
    } catch {
      // Already gone (another device, or it expired and was used): the list below is the truth.
      setActionError('No pudimos cancelar la invitación. Revisa la lista e inténtalo otra vez.')
    } finally {
      setBusyId(null)
      await refresh()
    }
  }

  async function confirmRemove() {
    if (!removing) return
    setBusy(true)
    setDialogError(null)
    try {
      await removeMember(removing.id, await getToken())
      await refresh()
      closeDialog()
    } catch (e) {
      // Already gone (another device): the list is the truth, show it and close.
      if (e instanceof FamilyApiError && e.kind === 'member_not_found') {
        await refresh()
        closeDialog()
      } else if (e instanceof FamilyApiError && e.kind === 'cannot_remove_tutor') {
        setDialogError('Un Tutor no puede ser quitado por otra persona.')
      } else {
        setDialogError('No pudimos quitar el acceso. Revisa tu conexión e inténtalo de nuevo.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function confirmLeave() {
    setBusy(true)
    setDialogError(null)
    try {
      await leaveFamily(await getToken())
      // The children shared with this person are no longer theirs: what was cached about them goes, and "me" is read again.
      for (const key of ['family', 'consultations', 'consultation', 'overview', 'history', 'history-options']) {
        queryClient.removeQueries({ queryKey: [key] })
      }
      await queryClient.invalidateQueries({ queryKey: ['accounts', 'me'] })
      navigate('/home', { replace: true })
    } catch (e) {
      if (e instanceof FamilyApiError && (e.kind === 'member_not_found' || e.kind === 'owner_cannot_leave')) {
        await refresh()
        closeDialog()
      } else {
        setDialogError('No pudimos completar la salida. Revisa tu conexión e inténtalo de nuevo.')
      }
    } finally {
      setBusy(false)
    }
  }

  const variant = isDesktop ? 'desktop' : 'phone'
  const data = family.data
  const ready = !family.isPending && !family.isError && !!data

  // Whom the family looks after: the children of the owner account (the session's own, or the ones shared with it).
  const childNames = data && account ? account.children.filter((c) => (c.accountId ?? account.id) === data.owner.id).map((c) => c.firstName) : []
  const names = namesText(childNames)
  const plural = childNames.length !== 1

  const title = !data ? 'Familia' : data.role === 'owner' ? 'Tu familia' : `Familia de ${data.owner.name}`
  const pendingCount = data ? data.invitations.filter((i) => i.status === 'pending').length : 0
  // The free plan has no places to count (mock F8).
  const showCounter = ready && !(data.role === 'owner' && data.plan !== 'paid')

  const panels = (d: FamilyView) => {
    const full = d.role === 'owner' || d.role === 'tutor'
    const paid = d.plan === 'paid'
    const canInvite = full && paid && !d.readOnly
    return (
      <>
        {actionError && <Notice tone="error">{actionError}</Notice>}
        {link && <InviteLink invitation={link} onDone={() => setLink(null)} variant={variant} />}
        {!link && canInvite && (
          <InviteForm
            onInvite={onInvite}
            pending={invite.isPending}
            full={d.capacity.used >= d.capacity.max}
            names={names}
            plural={plural}
            max={d.capacity.max}
            variant={variant}
          />
        )}
        {full && !paid && !d.readOnly && (
          <PlanAvisoCompacto
            title="Compartir con tu familia"
            text="Hasta 4 personas ven y marcan las tomas, cada una con sus avisos. Quienes invitas quedan incluidos en tu suscripción."
          />
        )}
        {d.role !== 'owner' && (
          <section className={`flex flex-col gap-3 ${isDesktop ? 'rounded-[22px] bg-surface p-6 shadow-[0_8px_20px_rgba(4,37,43,0.07)]' : 'pt-1'}`}>
            <h2 className="text-xl font-black tracking-[-0.02em] text-ink">Tu lugar en esta familia</h2>
            <p className="text-[15px] leading-relaxed text-body">
              Eres {ROLE_LABEL[d.role === 'tutor' ? 'tutor' : d.role === 'child' ? 'child' : 'caregiver']} en la familia de {d.owner.name}. Puedes salir cuando
              quieras: dejas de ver a {names} al instante y no te llevas copia de nada.
            </p>
            <button
              ref={leaveOpener}
              type="button"
              onClick={() => setLeaving(true)}
              className="min-h-11 cursor-pointer self-start rounded-2xl border-2 border-action px-5 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              Salir de esta familia
            </button>
          </section>
        )}
      </>
    )
  }

  const readOnlyNotice = data?.readOnly && (
    <div role="status" className={`flex flex-col gap-1.5 rounded-[22px] border-[1.5px] border-hint-border bg-hint ${isDesktop ? 'px-[22px] py-[18px]' : 'p-[18px]'}`}>
      <p className="text-base font-extrabold text-ink">La familia está en el plan gratuito</p>
      <p className="text-[15px] leading-relaxed text-body">
        Sigues viendo todo y puedes marcar tomas. Por ahora no se pueden agregar consultas ni invitar.
      </p>
    </div>
  )

  const people = (d: FamilyView) => (
    <MembersList
      family={d}
      variant={variant}
      onRemove={(member, button) => {
        removeOpener.current = button
        setRemoving(member)
      }}
    />
  )
  const invitations = (d: FamilyView) =>
    d.role === 'owner' || d.role === 'tutor' ? (
      <InvitationsList invitations={d.invitations} variant={variant} busyId={busyId} onResend={onResend} onCancel={onCancel} />
    ) : null

  const loading = (
    <div aria-busy="true" className="flex flex-col gap-3.5">
      <p role="status" className="text-[15px] font-semibold text-slate-600">
        Cargando tu familia…
      </p>
      {[0, 1].map((n) => (
        <div key={n} className="flex h-[104px] gap-3.5 rounded-[22px] bg-surface p-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
          <span className="h-11 w-11 rounded-full bg-slate-100" />
          <span className="flex flex-1 flex-col gap-2.5">
            <span className="h-3.5 w-1/2 rounded-lg bg-slate-100" />
            <span className="h-3 w-2/5 rounded-lg bg-slate-100" />
          </span>
        </div>
      ))}
    </div>
  )
  const failed = (
    <div className={`flex flex-col gap-3 rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${isDesktop ? 'max-w-[520px] p-[26px]' : 'p-[22px]'}`}>
      <h2 className="text-xl font-black tracking-[-0.02em] text-ink">No pudimos cargar tu familia</h2>
      <p className="text-base leading-relaxed text-body">Revisa tu conexión e intenta de nuevo.</p>
      <button
        type="button"
        onClick={() => void family.refetch()}
        className={`mt-1 min-h-12 cursor-pointer rounded-2xl bg-confirmed text-base font-extrabold text-white transition-colors hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 ${isDesktop ? 'self-start px-6' : ''}`}
      >
        Reintentar
      </button>
    </div>
  )

  const planModal = planOpen && (
    <FreemiumLimitModal reason="family" onStayFree={closePlan} onViewPlans={() => navigate('/planes')} />
  )
  const leavingNames = namesText(childNames)
  const dialogs = (
    <>
      {planModal}
      {removing && (
        <ConfirmDialog
          title={`¿Quitar a ${removing.name} de la familia?`}
          confirmLabel={`Quitar a ${removing.name}`}
          busyLabel="Quitando…"
          tone="danger"
          busy={busy}
          error={dialogError}
          onConfirm={() => void confirmRemove()}
          onCancel={closeDialog}
          opener={removeOpener}
          rows={[
            { k: 'Deja de ver', v: `Las consultas, los medicamentos y las tomas de ${leavingNames}, desde este momento.` },
            { k: 'No se lleva', v: 'Ninguna copia de la información.' },
            { k: 'Se conserva', v: 'Las tomas que marcó, con su nombre. Su lugar queda libre.' },
          ]}
        />
      )}
      {leaving && data && (
        <ConfirmDialog
          title={`¿Salir de la familia de ${data.owner.name}?`}
          confirmLabel="Salir de la familia"
          busyLabel="Saliendo…"
          tone="ink"
          busy={busy}
          error={dialogError}
          onConfirm={() => void confirmLeave()}
          onCancel={closeDialog}
          opener={leaveOpener}
          rows={[
            { k: 'Dejas de ver', v: `Las consultas, los medicamentos y las tomas de ${leavingNames}, desde este momento.` },
            { k: 'No te llevas', v: 'Ninguna copia. La información se queda en la familia.' },
            { k: 'Se conserva', v: `Lo que agregaste y las tomas que marcaste. Para volver, ${data.owner.name} tendría que invitarte de nuevo.` },
          ]}
        />
      )}
    </>
  )

  if (isDesktop) {
    return (
      <AppShell>
        <main className="min-w-0 bg-canvas px-12 pt-11 pb-11">
          <div className="mx-auto flex max-w-[904px] flex-col gap-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                {childNames.length > 0 && <p className="text-sm font-bold text-action">{names}</p>}
                <h1 className="mt-1 text-[38px] leading-[1.1] font-black tracking-[-0.03em] text-ink">{title}</h1>
              </div>
              {showCounter && data && (
                <FamilyCounter people={data.members.length + 1} pending={pendingCount} max={data.capacity.max} variant="desktop" />
              )}
            </div>
            {family.isPending && loading}
            {family.isError && failed}
            {ready && (
              <>
                {readOnlyNotice}
                <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-7">
                  <div className="flex min-w-0 flex-col gap-7">
                    {people(data)}
                    {invitations(data)}
                  </div>
                  <div className="flex min-w-0 flex-col gap-6 pt-[34px]">{panels(data)}</div>
                </div>
              </>
            )}
          </div>
        </main>
        {dialogs}
      </AppShell>
    )
  }

  return (
    <AppShell>
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10">
        <header className="bg-ink px-6 pt-6 pb-[26px]">
          <BackLink className="-my-3 inline-flex min-h-11 items-center text-sm font-bold text-bright-soft hover:text-white" />
          <h1 className="mt-[18px] text-[30px] font-black tracking-[-0.03em] text-white">{title}</h1>
          {childNames.length > 0 && <p className="mt-1 text-sm font-semibold text-hint-border">{names}</p>}
          {showCounter && data && (
            <div className="mt-5">
              <FamilyCounter people={data.members.length + 1} pending={pendingCount} max={data.capacity.max} variant="phone" />
            </div>
          )}
        </header>
        <div className="flex flex-col gap-7 px-6 pt-6 pb-10">
          {family.isPending && loading}
          {family.isError && failed}
          {ready && (
            <>
              {readOnlyNotice}
              {people(data)}
              {invitations(data)}
              {panels(data)}
            </>
          )}
        </div>
      </main>
      {dialogs}
    </AppShell>
  )
}

function BackLink({ className }: { className: string }): ReactNode {
  return (
    <Link to="/home" className={className}>
      ← Tus hijos
    </Link>
  )
}
