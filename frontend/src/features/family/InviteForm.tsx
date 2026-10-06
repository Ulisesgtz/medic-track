import { useState, type FormEvent } from 'react'
import { FormField } from '../../shared/ui/FormField'
import { fieldBorder, fieldModal } from '../../shared/ui/formStyles'
import { Notice } from '../../shared/ui/Notice'
import { FamilyApiError } from './api'
import { ROLE_CHOICE, ROLE_LABEL } from './roles'
import type { InviteRole } from './types'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ROLES: InviteRole[] = ['tutor', 'caregiver']

interface InviteFormProps {
  /** Sends the invitation; rejects with a `FamilyApiError`. */
  onInvite: (email: string, role: InviteRole) => Promise<void>
  pending: boolean
  /** Nothing is left to invite: the family has its maximum of people. */
  full: boolean
  /** «Mateo y Sofía» (or «tus hijos»): whom the invited person will see. */
  names: string
  /** One child → «lo cuida»; several → «los cuidan». */
  plural: boolean
  /** Total places, for the «completa» notice. */
  max: number
  variant: 'phone' | 'desktop'
}

function messageOf(error: unknown): string {
  if (!(error instanceof FamilyApiError)) return 'No pudimos crear la liga. Revisa tu conexión e inténtalo de nuevo.'
  switch (error.kind) {
    case 'already_member':
      return 'Esa persona ya tiene acceso a tu familia.'
    case 'invitation_pending':
      return 'Ya hay una invitación pendiente para ese correo. Puedes enviarla de nuevo desde la lista.'
    case 'family_full':
      return 'Tu familia ya está completa. Cancela una invitación o quita a un cuidador para invitar a alguien más.'
    case 'validation_error':
      return 'Revisa el correo: no parece válido.'
    default:
      return 'No pudimos crear la liga. Inténtalo de nuevo.'
  }
}

const cardOf = (variant: 'phone' | 'desktop') =>
  `flex flex-col gap-[18px] rounded-[22px] bg-surface shadow-[0_8px_20px_rgba(4,37,43,0.07)] ${variant === 'desktop' ? 'p-6' : 'p-[22px]'}`

/**
 * «Invitar a alguien» (mock «Familia»): the e-mail and the role as two cards with their own radio, and «Crear liga» — nothing is
 * e-mailed, the tutor copies the link. When the family is complete the same form shows up disabled (slate, not `opacity`, which
 * would lower the text under 4.5:1) with the reason.
 */
export function InviteForm({ onInvite, pending, full, names, plural, max, variant }: InviteFormProps) {
  const card = cardOf(variant)
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
        ? 'Escribe un correo válido, como nombre@correo.mx.'
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

  if (full) {
    return (
      <section aria-labelledby="invite-title" className={card}>
        <h2 id="invite-title" className="text-xl font-black tracking-[-0.02em] text-ink">
          Invitar a alguien
        </h2>
        <div role="status" className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-hint-border bg-hint p-4">
          <p className="text-[15px] font-extrabold text-ink">Tu familia está completa</p>
          <p className="text-sm leading-relaxed text-body">
            Son {max} de {max} personas, contando invitaciones pendientes. Para invitar a alguien más, cancela una invitación o quita a un cuidador.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="invite-email" className="text-[13px] font-bold text-slate-600">
            Correo
          </label>
          <input
            id="invite-email"
            disabled
            placeholder="nombre@correo.mx"
            className="min-h-12 w-full rounded-[14px] border-[1.5px] border-slate-300 bg-slate-100 px-4 text-base text-slate-600"
          />
        </div>
        <div className={`flex gap-2.5 ${variant === 'desktop' ? '' : 'flex-col'}`}>
          {ROLES.map((r) => (
            <div key={r} className="flex-1 rounded-[14px] bg-slate-100 px-4 py-3.5 text-[15px] font-bold text-slate-600">
              {ROLE_LABEL[r]}
            </div>
          ))}
        </div>
        <button type="button" disabled className="min-h-12 cursor-not-allowed rounded-2xl bg-slate-100 text-base font-extrabold text-slate-600">
          Crear liga
        </button>
      </section>
    )
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby="invite-title" className={card}>
      <div className="flex flex-col gap-2">
        <h2 id="invite-title" className="text-xl font-black tracking-[-0.02em] text-ink">
          Invitar a alguien
        </h2>
        <p className="text-[15px] leading-relaxed text-body">
          Quien invites verá las consultas, los medicamentos y las tomas de {names}. Invita solo a personas que {plural ? 'los cuidan' : 'lo cuidan'}.
        </p>
      </div>

      <FormField id="invite-email" text="Correo" error={emailError}>
        <input
          id="invite-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="nombre@correo.mx"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={emailError ? true : undefined}
          className={`${fieldModal} ${fieldBorder(!!emailError)}`}
        />
      </FormField>

      <fieldset className="flex min-w-0 flex-col gap-2.5">
        <legend className="mb-2 text-[13px] font-bold text-ink">Rol</legend>
        {ROLES.map((r) => {
          const chosen = role === r
          return (
            <label
              key={r}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-[14px] p-4 focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-2 ${
                chosen ? 'border-2 border-ink bg-hint p-[15px]' : 'border-[1.5px] border-slate-300 bg-surface'
              }`}
            >
              <input type="radio" name="invite-role" value={r} checked={chosen} onChange={() => setRole(r)} className="peer sr-only" />
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${chosen ? 'border-ink' : 'border-slate-500'}`}
              >
                {chosen && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-base font-extrabold text-ink">{ROLE_LABEL[r]}</span>
                <span className="text-sm leading-normal text-body">{ROLE_CHOICE[r]}</span>
              </span>
            </label>
          )
        })}
      </fieldset>

      <p className="text-sm leading-relaxed text-slate-600">
        No mandamos correo: copias la liga y la envías tú por mensaje. Sirve una vez, vence en 7 días y solo la acepta quien entre con este correo.
      </p>

      {error && <Notice tone="error">{error}</Notice>}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 cursor-pointer rounded-2xl bg-confirmed text-base font-extrabold text-white transition-colors hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? 'Creando…' : 'Crear liga'}
      </button>
    </form>
  )
}
