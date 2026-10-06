import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Logo } from '../../shared/ui/Logo'
import { FormField } from '../../shared/ui/FormField'
import { fieldBorder, fieldCompact } from '../../shared/ui/formStyles'
import { Notice } from '../../shared/ui/Notice'
import { formatDayMonth } from '../../shared/date'
import { MeApiError } from '../auth/api'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useLogout } from '../auth/useLogout'
import { createAccount } from '../account-signup/api'
import { NAME_MAX_LENGTH, NAME_PATTERN } from '../account-signup/types'
import { acceptInvitation, declineInvitation, FamilyApiError, previewInvitation } from './api'
import { clearPendingInvitation, readPendingInvitation, savePendingInvitation, tokenFromHash } from './pendingInvitation'
import { ROLE_DESCRIPTION, ROLE_LABEL } from './roles'

/**
 * `/familia/invitacion#<token>` (specs/032-compartir-con-familia): what a person sees when they open an invitation. The
 * token is in the `#`, which a browser never sends to a server; it goes to the API only in the body of a request. The
 * route is public so the person can arrive without a session — it then asks them to log in or sign up with the invited
 * e-mail and, once in, the home brings them back (`pendingInvitation`).
 *
 * Only the account whose verified e-mail is the invited one can accept; anyone else is told how to enter with the right
 * one. A person with no PediTrack account yet gives their name and gets one with no children.
 */
export function InvitationPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const [token] = useState(() => tokenFromHash(window.location.hash) || readPendingInvitation() || '')

  if (!token) {
    return (
      <Shell title="Esta liga no sirve">
        <p className="text-base leading-relaxed text-body">
          Falta la invitación en la liga. Pídele a quien te invitó que te la envíe de nuevo.
        </p>
        <HomeLink />
      </Shell>
    )
  }
  if (!isLoaded) {
    return (
      <Shell title="Invitación">
        <p className="text-base font-semibold text-action">Cargando…</p>
      </Shell>
    )
  }
  if (!isSignedIn) return <SignedOut token={token} />
  return <WithSession token={token} />
}

function SignedOut({ token }: { token: string }) {
  useEffect(() => savePendingInvitation(token), [token])
  return (
    <Shell title="Te invitaron a una familia en PediTrack">
      <p className="text-base leading-relaxed text-body">
        Para ver la invitación y aceptarla, entra a tu cuenta —o crea una— con <strong>el correo al que te llegó</strong>.
        Después te traemos de vuelta aquí.
      </p>
      <div className="flex flex-col gap-3">
        <Link
          to="/login"
          className="min-h-11 cursor-pointer rounded-2xl bg-confirmed px-6 py-3.5 text-center text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800"
        >
          Iniciar sesión
        </Link>
        <Link
          to="/signup"
          className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-6 py-3 text-center text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint"
        >
          Crear cuenta
        </Link>
      </div>
    </Shell>
  )
}

function WithSession({ token }: { token: string }) {
  // Back from logging in or signing up: the way back has done its job (otherwise the home would send the person here again).
  useEffect(() => clearPendingInvitation(), [])
  const account = useCurrentAccount()
  const noAccount = account.isError && account.error instanceof MeApiError && account.error.kind === 'not_found_for_session'

  if (account.isPending) {
    return (
      <Shell title="Invitación">
        <p className="text-base font-semibold text-action">Cargando…</p>
      </Shell>
    )
  }
  if (noAccount) return <CreateAccount />
  if (account.isError) {
    return (
      <Shell title="No pudimos cargar tu cuenta">
        <p className="text-base leading-relaxed text-body">Revisa tu conexión e inténtalo de nuevo. La invitación sigue vigente.</p>
        <button
          type="button"
          onClick={() => void account.refetch()}
          className="min-h-11 cursor-pointer rounded-2xl bg-confirmed px-6 py-3.5 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800"
        >
          Reintentar
        </button>
      </Shell>
    )
  }
  return <Offer token={token} />
}

/** A person invited who has no PediTrack account yet: the minimum — their name — and an account with no children. */
function CreateAccount() {
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
    !touched ? undefined : value.trim() === '' ? 'Escribe tu nombre.' : !NAME_PATTERN.test(value.trim()) || value.trim().length > NAME_MAX_LENGTH ? 'Usa solo letras, espacios, guiones o apóstrofes.' : undefined
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
    <Shell title="Un paso antes de ver la invitación">
      <p className="text-base leading-relaxed text-body">
        Ya entraste, pero todavía no tienes tu cuenta en PediTrack. Solo necesitamos tu nombre; no tienes que dar de alta hijos.
      </p>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 text-left">
        <FormField id="invitee-first-name" text="Nombre" error={firstError}>
          <input id="invitee-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" aria-invalid={firstError ? true : undefined} className={`${fieldCompact} ${fieldBorder(!!firstError)}`} />
        </FormField>
        <FormField id="invitee-last-name" text="Apellido" error={lastError}>
          <input id="invitee-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" aria-invalid={lastError ? true : undefined} className={`${fieldCompact} ${fieldBorder(!!lastError)}`} />
        </FormField>
        {failed && <Notice tone="error">No pudimos crear tu cuenta. Revisa tu conexión e inténtalo de nuevo.</Notice>}
        <button
          type="submit"
          disabled={create.isPending}
          className="min-h-11 cursor-pointer rounded-2xl bg-confirmed px-6 py-3.5 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-70"
        >
          {create.isPending ? 'Creando…' : 'Continuar'}
        </button>
      </form>
    </Shell>
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
function Offer({ token }: { token: string }) {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const logout = useLogout()
  const [answerError, setAnswerError] = useState<string | null>(null)

  const preview = useQuery({
    queryKey: ['invitation-preview'],
    queryFn: async () => previewInvitation(token, await getToken()),
    retry: false,
    // The answer is read once per visit and not kept (the token is never in a cache key).
    gcTime: 0,
  })

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

  if (preview.isPending) {
    return (
      <Shell title="Invitación">
        <p className="text-base font-semibold text-action">Cargando…</p>
      </Shell>
    )
  }
  if (preview.isError) {
    const gone = preview.error instanceof FamilyApiError && preview.error.kind === 'invitation_not_found'
    if (gone) clearPendingInvitation()
    return (
      <Shell title={gone ? 'Esta liga ya no sirve' : 'No pudimos abrir la invitación'}>
        <p className="text-base leading-relaxed text-body">
          {gone
            ? 'Se usó, venció o la cancelaron. Pídele a quien te invitó que te la envíe de nuevo.'
            : 'Revisa tu conexión e inténtalo de nuevo.'}
        </p>
        {!gone && (
          <button
            type="button"
            onClick={() => void preview.refetch()}
            className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-6 py-3 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint"
          >
            Reintentar
          </button>
        )}
        <HomeLink />
      </Shell>
    )
  }

  const offer = preview.data
  const busy = accept.isPending || decline.isPending
  return (
    <Shell title={`${offer.ownerName} te invita a su familia`}>
      <p className="text-base leading-relaxed text-body">
        Como <strong>{ROLE_LABEL[offer.role]}</strong>: {ROLE_DESCRIPTION[offer.role].toLowerCase()}
      </p>
      <Notice tone="info">
        Aceptar significa que verás los <strong>datos médicos de los hijos de {offer.ownerName}</strong>: consultas, recetas,
        síntomas y tomas. Acepta solo si los conoces y esta invitación es para ti.
      </Notice>
      <p className="text-sm text-ink-soft">
        La invitación es para <strong>{offer.email}</strong> y vence el {formatDayMonth(offer.expiresAt)}.
      </p>
      {!offer.emailMatches && (
        <Notice tone="error">
          Entraste con otro correo, y solo el correo invitado puede aceptar. Cierra sesión y entra con {offer.email}.
        </Notice>
      )}
      {answerError && <Notice tone="error">{answerError}</Notice>}
      <div className="flex flex-col gap-3">
        {offer.emailMatches ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setAnswerError(null)
                accept.mutate()
              }}
              className="min-h-11 cursor-pointer rounded-2xl bg-confirmed px-6 py-3.5 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-70"
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
              className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-6 py-3 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint disabled:cursor-wait disabled:opacity-70"
            >
              Rechazar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void logout()}
            className="min-h-11 cursor-pointer rounded-2xl bg-confirmed px-6 py-3.5 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </Shell>
  )
}

function HomeLink() {
  return (
    <Link
      to="/home"
      className="min-h-11 cursor-pointer rounded-2xl border-2 border-action px-6 py-3 text-center text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint"
    >
      Ir a mi home
    </Link>
  )
}

/** The card every state of the page sits on: the light logo on the ink background, as the other full-screen notices. */
function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-5 py-10">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-3xl bg-surface p-8 shadow-xl">
        <div className="flex justify-center">
          <Logo size={56} variant="light" />
        </div>
        <h1 className="text-center text-2xl font-black tracking-tight text-ink">{title}</h1>
        {children}
      </div>
    </main>
  )
}
