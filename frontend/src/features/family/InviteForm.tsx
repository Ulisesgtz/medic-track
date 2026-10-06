import { useState, type FormEvent } from 'react'
import { FormField } from '../../shared/ui/FormField'
import { fieldBorder, fieldCompact } from '../../shared/ui/formStyles'
import { Notice } from '../../shared/ui/Notice'
import { FamilyApiError } from './api'
import { ROLE_DESCRIPTION, ROLE_LABEL } from './roles'
import type { InviteRole } from './types'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ROLES: InviteRole[] = ['tutor', 'caregiver']

interface InviteFormProps {
  /** Sends the invitation; rejects with a `FamilyApiError`. */
  onInvite: (email: string, role: InviteRole) => Promise<void>
  pending: boolean
  /** Nothing is left to invite: the family has its maximum of people. */
  full: boolean
}

function messageOf(error: unknown): string {
  if (!(error instanceof FamilyApiError)) return 'No pudimos crear la invitación. Revisa tu conexión e inténtalo de nuevo.'
  switch (error.kind) {
    case 'already_member':
      return 'Esa persona ya tiene acceso a tu familia.'
    case 'invitation_pending':
      return 'Ya hay una invitación pendiente para ese correo. Puedes enviarla de nuevo desde la lista.'
    case 'family_full':
      return 'Tu familia ya tiene el máximo de personas. Cancela una invitación pendiente para invitar a alguien más.'
    case 'validation_error':
      return 'Revisa el correo: no parece válido.'
    default:
      return 'No pudimos crear la invitación. Inténtalo de nuevo.'
  }
}

/** Invite an e-mail as a Tutor or a Caregiver. Only offered to who can do everything, on the paid plan. */
export function InviteForm({ onInvite, pending, full }: InviteFormProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('tutor')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = email.trim()
  const emailError = !touched
    ? undefined
    : trimmed === ''
      ? 'Escribe el correo de la persona.'
      : !EMAIL.test(trimmed)
        ? 'Escribe un correo válido, como nombre@correo.com.'
        : undefined

  async function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    setError(null)
    if (!EMAIL.test(trimmed)) return
    try {
      await onInvite(trimmed, role)
      setEmail('')
      setTouched(false)
    } catch (e) {
      setError(messageOf(e))
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="invite-title"
      className="flex flex-col gap-5 rounded-3xl bg-surface p-6 shadow-[0_8px_20px_rgba(4,37,43,0.07)]"
    >
      <div>
        <h2 id="invite-title" className="text-xl font-black tracking-tight text-ink">
          Invitar a alguien
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-body">
          La persona verá los datos médicos de tus hijos según el rol que le des.
        </p>
      </div>

      <FormField id="invite-email" text="Correo de la persona" error={emailError}>
        <input
          id="invite-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={emailError ? true : undefined}
          className={`${fieldCompact} ${fieldBorder(!!emailError)}`}
        />
      </FormField>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-3 text-[13px] font-bold text-ink-soft">Rol</legend>
        {ROLES.map((r) => (
          <label
            key={r}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border-[1.5px] p-4 ${role === r ? 'border-ink bg-hint' : 'border-slate-300'}`}
          >
            <input
              type="radio"
              name="invite-role"
              value={r}
              checked={role === r}
              onChange={() => setRole(r)}
              className="mt-1 h-4 w-4 accent-action"
            />
            <span className="min-w-0">
              <span className="block text-base font-extrabold text-ink">{ROLE_LABEL[r]}</span>
              <span className="block text-[13px] leading-snug text-body">{ROLE_DESCRIPTION[r]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {full && <Notice tone="info">Tu familia ya tiene el máximo de personas (contando invitaciones pendientes).</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <button
        type="submit"
        disabled={pending || full}
        className="min-h-11 cursor-pointer self-start rounded-2xl bg-confirmed px-6 py-3 text-[15px] font-extrabold text-white transition-colors hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Creando…' : 'Crear invitación'}
      </button>
    </form>
  )
}
