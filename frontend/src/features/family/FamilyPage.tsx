import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Notice } from '../../shared/ui/Notice'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { AppShell } from '../home/AppShell'
import { useSidebarSession } from '../home/useSidebarSession'
import { cancelInvitation, createInvitation, FamilyApiError, leaveFamily, removeMember, resendInvitation } from './api'
import { ConfirmDialog } from './ConfirmDialog'
import { InvitationsList } from './InvitationsList'
import { InviteForm } from './InviteForm'
import { InviteLink } from './InviteLink'
import { MembersList } from './MembersList'
import type { CreatedInvitation, FamilyInvitation, FamilyMember, InviteRole } from './types'
import { useFamily } from './useFamily'

/**
 * «Familia» (specs/032-compartir-con-familia): who has access to the children, the invitations waiting and, to who can do
 * everything, the form to invite someone. Two layouts, chosen with `useIsDesktop` (no mock was delivered: built from the
 * visual system): on the phone a dark header and one column, on the web the page inside the sidebar shell.
 *
 * Sharing is the paid plan's. On the free plan the page explains it (and opens the plan pop-up); a person invited to a
 * family that stopped paying sees why they can only view and mark doses.
 */
export function FamilyPage() {
  const { isDesktop } = useSidebarSession()
  const family = useFamily()
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [link, setLink] = useState<CreatedInvitation | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const planOpener = useRef<HTMLButtonElement>(null)
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
        setActionError('Tu familia ya tiene el máximo de personas. Cancela otra invitación para enviar esta de nuevo.')
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

  const body = (() => {
    if (family.isPending) return <p className="text-base font-semibold text-action">Cargando…</p>
    if (family.isError || !family.data) {
      return (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="error">No pudimos cargar tu familia. Revisa tu conexión e inténtalo de nuevo.</Notice>
          <button
            type="button"
            onClick={() => void family.refetch()}
            className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            Reintentar
          </button>
        </div>
      )
    }

    const data = family.data
    const full = data.role === 'owner' || data.role === 'tutor'
    const paid = data.plan === 'paid'
    const canInvite = full && paid && !data.readOnly
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm font-extrabold text-ink-soft" aria-live="polite">
          {data.capacity.used} de {data.capacity.max} personas
          {data.capacity.used > data.members.length + 1 ? ' (contando invitaciones pendientes)' : ''}
        </p>

        {data.readOnly && (
          <Notice tone="info">
            El plan de la familia de {data.owner.name} ya no es de pago: puedes ver todo lo registrado y marcar tomas, pero no
            agregar nada. Si prefieres, puedes salir de esta familia.
          </Notice>
        )}

        <MembersList
          family={data}
          onRemove={(member, button) => {
            removeOpener.current = button
            setRemoving(member)
          }}
        />

        {full && !paid && !data.readOnly && (
          <section className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-hint-border p-6">
            <h2 className="text-xl font-black tracking-tight text-ink">Comparte con tu familia</h2>
            <p className="text-sm leading-relaxed text-body">
              Compartir con tu pareja o con quien cuida es parte del plan completo. Todo lo que ya registraste se mantiene.
            </p>
            <button
              ref={planOpener}
              type="button"
              onClick={() => setPlanOpen(true)}
              className="min-h-11 cursor-pointer self-start rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              Ver el plan completo
            </button>
          </section>
        )}

        {actionError && <Notice tone="error">{actionError}</Notice>}
        {link && <InviteLink invitation={link} onDone={() => setLink(null)} />}

        {full && <InvitationsList invitations={data.invitations} busyId={busyId} onResend={onResend} onCancel={onCancel} />}

        {canInvite && (
          <InviteForm
            onInvite={onInvite}
            pending={invite.isPending}
            full={data.capacity.used >= data.capacity.max}
          />
        )}

        {data.role !== 'owner' && (
          <section className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-hint-border p-6">
            <h2 className="text-xl font-black tracking-tight text-ink">Tu lugar en esta familia</h2>
            <p className="text-sm leading-relaxed text-body">
              Puedes salir cuando quieras, sin pedir permiso. Dejarás de ver los hijos de {data.owner.name} y de recibir sus
              avisos; no te llevas una copia de lo registrado y lo que tú registraste se queda en su cuenta.
            </p>
            <button
              ref={leaveOpener}
              type="button"
              onClick={() => setLeaving(true)}
              className="min-h-11 cursor-pointer self-start rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              Salir de esta familia
            </button>
          </section>
        )}
      </div>
    )
  })()

  const planModal = planOpen && (
    <FreemiumLimitModal reason="family" onStayFree={closePlan} onViewPlans={() => navigate('/planes')} opener={planOpener} />
  )

  const dialogs = (
    <>
      {planModal}
      {removing && (
        <ConfirmDialog
          title={`¿Quitar el acceso de ${removing.name}?`}
          confirmLabel="Quitar acceso"
          busyLabel="Quitando…"
          busy={busy}
          error={dialogError}
          onConfirm={() => void confirmRemove()}
          onCancel={closeDialog}
          opener={removeOpener}
        >
          <p>Dejará de ver a tus hijos y de recibir sus avisos, y su acceso termina de inmediato.</p>
          <p>Lo que registró se queda en tu cuenta. Si más adelante quieres darle acceso otra vez, tendrás que invitarla de nuevo.</p>
        </ConfirmDialog>
      )}
      {leaving && (
        <ConfirmDialog
          title="¿Salir de esta familia?"
          confirmLabel="Salir de la familia"
          busyLabel="Saliendo…"
          busy={busy}
          error={dialogError}
          onConfirm={() => void confirmLeave()}
          onCancel={closeDialog}
          opener={leaveOpener}
        >
          <p>Dejarás de ver los hijos de esta familia y de recibir sus avisos, de inmediato.</p>
          <p>No te llevas una copia de lo registrado y lo que tú registraste se queda en la cuenta de la familia.</p>
        </ConfirmDialog>
      )}
    </>
  )

  if (isDesktop) {
    return (
      <AppShell>
        <main className="min-w-0 bg-canvas px-10 pt-9 pb-11">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            <Heading back={<BackLink className="-my-3 inline-flex min-h-11 items-center text-sm font-bold text-action" />}>
              <h1 className="text-[38px] leading-[1.1] font-black tracking-[-0.035em] text-ink">Familia</h1>
              <p className="text-sm font-bold text-action">Quién ve y marca las tomas de tus hijos</p>
            </Heading>
            {body}
          </div>
        </main>
        {dialogs}
      </AppShell>
    )
  }

  return (
    <AppShell>
      <main className="mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10">
        <header className="bg-ink px-6 pt-6 pb-7">
          <BackLink className="-my-3 inline-flex min-h-11 items-center text-sm font-bold text-bright-soft hover:text-white" />
          <h1 className="mt-5 text-2xl font-black tracking-tight text-white">Familia</h1>
          <p className="mt-1 text-sm font-semibold text-hint-border">Quién ve y marca las tomas de tus hijos</p>
        </header>
        <div className="px-6 pt-6">{body}</div>
      </main>
      {dialogs}
    </AppShell>
  )
}

function BackLink({ className }: { className: string }) {
  return (
    <Link to="/home" className={className}>
      ← Tus hijos
    </Link>
  )
}

function Heading({ back, children }: { back: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {back}
      {children}
    </div>
  )
}
