import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Logo } from '../../shared/ui/Logo'
import { FormField } from '../../shared/ui/FormField'
import { fieldBorder, fieldModal } from '../../shared/ui/formStyles'
import { Notice } from '../../shared/ui/Notice'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { MeApiError } from '../auth/api'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useLogout } from '../auth/useLogout'
import { createAccount } from '../account-signup/api'
import { NAME_MAX_LENGTH, NAME_PATTERN } from '../account-signup/types'
import { acceptInvitation, declineInvitation, FamilyApiError, previewInvitation } from './api'
import { clearPendingInvitation, readPendingInvitation, savePendingInvitation, tokenFromHash } from './pendingInvitation'
import { formatInstant, namesText, ROLE_CAN, ROLE_CANNOT } from './roles'
import { RoleChip } from './RoleChip'
import type { InvitationPreview } from './types'

const solid =
  'flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-confirmed px-6 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70'
const outline =
  'flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 border-action px-6 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70'

/**
 * `/familia/invitacion#<token>` (specs/032-compartir-con-familia), built from the delivered mock `referencia/Familia
 * PediTrack.dc.html` + `InvitacionTarjeta.dc.html`: what a person sees when they open an invitation — the logo on the `ink`
 * background and one card. The token is in the `#`, which a browser never sends to a server; it goes to the API only in the
 * body of a request. The route is public so the person can arrive without a session — it then asks them to log in or sign up
 * with the invited e-mail and, once in, the home brings them back (`pendingInvitation`).
 *
 * Only the account whose verified e-mail is the invited one can accept; anyone else is told how to enter with the right one. A
 * person with no PediTrack account yet gives their name and gets one with no children.
 */
export function InvitationPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const [token] = useState(() => tokenFromHash(window.location.hash) || readPendingInvitation() || '')

  if (!token) {
    return (
      <Card overline="Invitación" title="Esta liga no sirve">
        <p className="text-base leading-relaxed text-body">Falta la invitación en la liga. Pídele a quien te invitó que te la envíe de nuevo.</p>
        <HomeLink />
      </Card>
    )
  }
  if (!isLoaded) return <Loading />
  if (!isSignedIn) return <SignedOut token={token} />
  return <WithSession token={token} />
}

/** The logo on the dark background and the card, in the phone or the web layout. */
function Card({ overline, title, children }: { overline: string; title: string; children: ReactNode }) {
  const desktop = useIsDesktop()
  return (
    <main
      className={`flex min-h-screen flex-col items-center bg-ink ${desktop ? 'justify-center gap-8 px-12 py-16' : 'gap-7 px-5 py-10'}`}
    >
      <div className="flex items-center gap-2.5">
        <Logo size={desktop ? 44 : 40} />
        <span className={`font-black tracking-[-0.02em] text-white ${desktop ? 'text-2xl' : 'text-[22px]'}`}>
          Pedi<span className="text-bright-soft">Track</span>
        </span>
      </div>
      <div className="flex w-full max-w-[480px] flex-col gap-[18px] rounded-3xl bg-surface px-6 py-7 shadow-[0_24px_60px_rgba(0,0,0,0.3)]">
        <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">{overline}</p>
        <h1 className="-mt-2 text-[28px] leading-[1.15] font-black tracking-[-0.03em] text-ink [text-wrap:balance]">{title}</h1>
        {children}
      </div>
    </main>
  )
}

function Loading() {
  return (
    <Card overline="Invitación" title="Invitación">
      <p className="text-base font-semibold text-action">Cargando…</p>
    </Card>
  )
}

function HomeLink() {
  return (
    <Link to="/home" className={outline}>
      Ir a PediTrack
    </Link>
  )
}

function SignedOut({ token }: { token: string }) {
  useEffect(() => savePendingInvitation(token), [token])
  return (
    <Card overline="Invitación" title="Te invitaron a una familia en PediTrack">
      <p className="text-base leading-relaxed text-body">
        Inicia sesión o crea tu cuenta con el correo al que te llegó esta liga. Con otro correo no se puede aceptar.
      </p>
      <div className="flex flex-col gap-3">
        <Link to="/login" className={solid}>
          Iniciar sesión
        </Link>
        <Link to="/signup" className={outline}>
          Crear cuenta
        </Link>
      </div>
    </Card>
  )
}

function WithSession({ token }: { token: string }) {
  const { getToken } = useAuth()
  // Back from logging in or signing up: the way back has done its job (otherwise the home would send the person here again).
  useEffect(() => clearPendingInvitation(), [])

  const preview = useQuery({
    queryKey: ['invitation-preview'],
    queryFn: async () => previewInvitation(token, await getToken()),
    retry: false,
    // The answer is read once per visit and not kept (the token is never in a cache key).
    gcTime: 0,
  })
  const account = useCurrentAccount()
  const noAccount = account.isError && account.error instanceof MeApiError && account.error.kind === 'not_found_for_session'

  if (preview.isPending) return <Loading />
  if (preview.isError) {
    const gone = preview.error instanceof FamilyApiError && preview.error.kind === 'invitation_not_found'
    if (gone) {
      return (
        <Card overline="Invitación" title="Esta liga ya no sirve">
          <p className="text-base leading-relaxed text-body">
            Puede que ya se haya usado, que haya vencido o que la hayan cancelado. Pídele a quien te invitó que te mande una nueva.
          </p>
          <HomeLink />
        </Card>
      )
    }
    return (
      <Card overline="Invitación" title="No pudimos abrir la invitación">
        <p className="text-base leading-relaxed text-body">Revisa tu conexión e intenta de nuevo.</p>
        <button type="button" onClick={() => void preview.refetch()} className={solid}>
          Reintentar
        </button>
      </Card>
    )
  }

  if (account.isPending) return <Loading />
  if (noAccount) return <CreateAccount offer={preview.data} />
  if (account.isError) {
    return (
      <Card overline="Invitación" title="No pudimos cargar tu cuenta">
        <p className="text-base leading-relaxed text-body">Revisa tu conexión e intenta de nuevo. La invitación sigue vigente.</p>
        <button type="button" onClick={() => void account.refetch()} className={solid}>
          Reintentar
        </button>
      </Card>
    )
  }
  return <Offer token={token} offer={preview.data} sessionEmail={account.data.email} />
}

/** A person invited who has no PediTrack account yet: the minimum — their name — and an account with no children. */
function CreateAccount({ offer }: { offer: InvitationPreview }) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [touched, setTouched] = useState(false)
  const [failed, setFailed] = useState(false)

  const create = useMutation({
    mutationFn: async () => createAccount({ firstName: firstName.trim(), lastName: lastName.trim(), children: [] }, await getToken()),
    onSuccess: (created) => queryClient.setQueryData(['accounts', 'me'], created),
    onError: () => setFailed(true),
  })

  const problem = (value: string) =>
    !touched
      ? undefined
      : value.trim() === ''
        ? 'Escribe tu nombre.'
        : !NAME_PATTERN.test(value.trim()) || value.trim().length > NAME_MAX_LENGTH
          ? 'Usa solo letras, espacios, guiones o apóstrofes.'
          : undefined
  const firstError = problem(firstName)
  const lastError = problem(lastName)

  function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    setFailed(false)
    if (firstName.trim() === '' || lastName.trim() === '') return
    if (!NAME_PATTERN.test(firstName.trim()) || !NAME_PATTERN.test(lastName.trim())) return
    create.mutate()
  }

  return (
    <Card overline="Crear cuenta" title="¿Cómo te llamas?">
      <p className="text-base leading-relaxed text-body">Así te verá {offer.ownerName} en su familia.</p>
      <div className="flex flex-col gap-1 rounded-[14px] bg-hint px-4 py-3.5">
        <span className="text-[13px] font-bold text-ink">Tu correo</span>
        <span className="text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{offer.email}</span>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-[18px] text-left">
        <FormField id="invitee-first-name" text="Nombre" error={firstError}>
          <input id="invitee-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" aria-invalid={firstError ? true : undefined} className={`${fieldModal} ${fieldBorder(!!firstError)}`} />
        </FormField>
        <FormField id="invitee-last-name" text="Apellido" error={lastError}>
          <input id="invitee-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" aria-invalid={lastError ? true : undefined} className={`${fieldModal} ${fieldBorder(!!lastError)}`} />
        </FormField>
        {failed && <Notice tone="error">No pudimos crear tu cuenta. Revisa tu conexión e inténtalo de nuevo.</Notice>}
        <button type="submit" disabled={create.isPending} className={solid}>
          {create.isPending ? 'Creando…' : 'Continuar'}
        </button>
      </form>
    </Card>
  )
}

function messageOf(error: unknown): string {
  if (!(error instanceof FamilyApiError)) return 'No pudimos completar esto. Revisa tu conexión e inténtalo de nuevo.'
  switch (error.kind) {
    case 'email_mismatch':
      return 'Esta invitación es para otro correo. Entra con el correo al que te llegó.'
    case 'email_not_verified':
      return 'Tu correo todavía no está verificado. Verifícalo e inténtalo de nuevo.'
    case 'already_in_family':
      return 'Ya perteneces a la familia de otra persona. Primero tendrías que salir de ella.'
    case 'family_full':
      return 'La familia ya tiene el máximo de personas.'
    case 'plan_required':
      return 'La cuenta de quien te invitó ya no tiene el plan completo, así que no se puede aceptar ahora.'
    case 'invitation_not_found':
      return 'Esta liga ya no sirve: se usó, venció o la cancelaron. Pídele a quien te invitó que te la envíe de nuevo.'
    case 'account_required':
      return 'Primero necesitas tu cuenta de PediTrack.'
    default:
      return 'No pudimos completar esto. Inténtalo de nuevo.'
  }
}

/** What the invitation offers, and the two answers. */
function Offer({ token, offer, sessionEmail }: { token: string; offer: InvitationPreview; sessionEmail: string }) {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const logout = useLogout()
  const [answerError, setAnswerError] = useState<string | null>(null)

  const accept = useMutation({
    mutationFn: async () => acceptInvitation(token, await getToken()),
    onSuccess: async () => {
      clearPendingInvitation()
      await queryClient.invalidateQueries({ queryKey: ['accounts', 'me'] })
      await queryClient.invalidateQueries({ queryKey: ['family'] })
      navigate('/home', { replace: true })
    },
    onError: (e) => setAnswerError(messageOf(e)),
  })
  const decline = useMutation({
    mutationFn: async () => declineInvitation(token, await getToken()),
    onSuccess: () => {
      clearPendingInvitation()
      navigate('/home', { replace: true })
    },
    onError: (e) => setAnswerError(messageOf(e)),
  })

  if (!offer.emailMatches) {
    return (
      <Card overline="Invitación" title="Esta invitación es para otro correo">
        <p className="text-base leading-relaxed text-body">
          Entraste como <strong className="text-ink [overflow-wrap:anywhere]">{sessionEmail}</strong>. La invitación es para:
        </p>
        <p className="rounded-[14px] bg-hint px-4 py-3.5 text-[15px] font-bold text-ink [overflow-wrap:anywhere]">{offer.email}</p>
        <p className="text-base leading-relaxed text-body">Cierra sesión y vuelve a abrir la liga con ese correo.</p>
        <button type="button" onClick={() => void logout()} className={solid}>
          Cerrar sesión
        </button>
      </Card>
    )
  }

  const busy = accept.isPending || decline.isPending
  // A backend that predates the mock doesn't send the names (both versions are deployed for a while).
  const childNames = offer.childrenFirstNames ?? []
  const names = namesText(childNames, 'los hijos de ' + offer.ownerName)
  const count = childNames.length
  const cannot = ROLE_CANNOT[offer.role]
  return (
    <Card overline="Invitación" title={`${offer.ownerName} te invita a su familia`}>
      <p className="-mt-1.5 text-base leading-relaxed text-body">Para ayudar a cuidar a {names}.</p>
      <div className="flex flex-col gap-2.5">
        <span className="self-start">
          <RoleChip role={offer.role} />
        </span>
        <p className="text-[15px] leading-relaxed text-body">
          <strong className="text-ink">Podrás</strong> {ROLE_CAN[offer.role]}
        </p>
        {cannot && (
          <p className="text-[15px] leading-relaxed text-body">
            <strong className="text-ink">No podrás</strong> {cannot}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-hint-border bg-hint p-4">
        <p className="text-[15px] font-extrabold text-ink">
          {count === 0
            ? 'Vas a ver datos médicos de menores'
            : `Vas a ver datos médicos de ${count === 1 ? 'un menor' : count === 2 ? 'dos menores' : `${count} menores`}`}
        </p>
        <p className="text-sm leading-relaxed text-body">
          {offer.ownerName} {count === 1 ? 'lo comparte' : 'los comparte'} contigo para que puedas cuidar{count === 1 ? 'lo' : 'los'}. Puedes salir de la familia cuando quieras.
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-bold text-ink">Invitación para</span>
          <span className="text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{offer.email}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-bold text-ink">Vence</span>
          <span className="text-[15px] font-semibold text-ink">{formatInstant(offer.expiresAt)}</span>
        </div>
      </div>
      {answerError && <Notice tone="error">{answerError}</Notice>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setAnswerError(null)
            accept.mutate()
          }}
          className={`${solid} flex-[1_1_160px]`}
        >
          {accept.isPending ? 'Aceptando…' : 'Aceptar'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setAnswerError(null)
            decline.mutate()
          }}
          className={`${outline} flex-[1_1_160px]`}
        >
          Rechazar
        </button>
      </div>
    </Card>
  )
}
