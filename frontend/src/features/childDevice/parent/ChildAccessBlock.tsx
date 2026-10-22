import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDayMonth } from '../../../shared/date'
import { FormField } from '../../../shared/ui/FormField'
import { fieldRoutine } from '../../../shared/ui/formStyles'
import { FreemiumLimitModal } from '../../account-signup/FreemiumLimitModal'
import { useCurrentAccount } from '../../auth/useCurrentAccount'
import { useChildAccess } from '../../family/useChildAccess'
import { PlanAvisoCompacto } from '../../plans/PlanAvisoCompacto'
import { PARENT } from '../childText'
import { DeviceLinkError, deviceLinkUrl, type CreatedLink } from './parentApi'
import { useCreateDeviceLink } from './parentHooks'

/**
 * «Acceso del hijo» (specs/047): the parent gives a child's own phone a one-use link; the phone opens it and sees and marks only that
 * child's doses, supplements and activities, with no account. It sits in the child's page (both designs). Who can make a link comes from
 * `useChildAccess(...).canAdd` (the server enforces it); on the free plan the plan notice is shown instead of the form. The link is shown
 * once, in «Liga lista», where «Copiar liga» is the one solid button. The words are in `childText.ts`.
 */
export function ChildAccessBlock({ childId, childName }: { childId: string; childName: string }) {
  const account = useCurrentAccount().data
  const access = useChildAccess(account, childId)
  const navigate = useNavigate()
  const create = useCreateDeviceLink(childId)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<CreatedLink | null>(null)
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const submitRef = useRef<HTMLButtonElement>(null)

  if (!account || !access.canAdd) return null
  if (access.isFree) return <PlanAvisoCompacto title={PARENT.plan.title} text={PARENT.plan.text} />

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    create.mutate(name, {
      onSuccess: (made) => {
        setLink(made)
        setCopied(null)
        setName('')
      },
      onError: (e) => {
        if (e instanceof DeviceLinkError && e.kind === 'plan_required') setPlanOpen(true)
        else if (e instanceof DeviceLinkError && e.kind === 'validation_error') setError(PARENT.errors.name)
        else if (e instanceof DeviceLinkError && e.kind === 'limit') setError(PARENT.errors.limit(e.limit ?? 3))
        else if (e instanceof DeviceLinkError && e.kind === 'forbidden') setError(PARENT.errors.forbidden)
        else setError(PARENT.errors.save)
      },
    })
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied('yes')
    } catch {
      setCopied('no')
    }
  }

  const card = 'flex flex-col gap-4 rounded-[22px] bg-surface px-[22px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
  return (
    <section aria-label={PARENT.title} className="flex flex-col gap-3">
      {link ? (
        <div className={`${card} border-2 border-bright`} role="region" aria-label={PARENT.ready.eyebrow}>
          <p className="text-xs font-extrabold tracking-[0.1em] text-action uppercase">{PARENT.ready.eyebrow}</p>
          <h3 className="-mt-2 text-xl font-black tracking-[-0.02em] text-ink">{PARENT.ready.title(childName)}</h3>
          <p className="text-[15px] leading-normal text-body">
            <strong className="text-ink">{link.name}</strong> · {PARENT.ready.expires(formatDayMonth(link.expiresAt))}
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor="child-device-link" className="text-[13px] font-bold text-ink">
              {PARENT.ready.linkLabel}
            </label>
            <input
              id="child-device-link"
              readOnly
              value={deviceLinkUrl(window.location.origin, link.token)}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-12 w-full min-w-0 rounded-[14px] border-[1.5px] border-hint-border bg-hint px-4 py-3 text-[15px] font-semibold text-ink focus:border-2 focus:border-ink focus:outline-none"
            />
          </div>
          <p className="text-sm leading-relaxed text-slate-600">{PARENT.ready.onlyNow}</p>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => void copy(deviceLinkUrl(window.location.origin, link.token))}
              className={`min-h-12 flex-[1_1_150px] cursor-pointer rounded-2xl text-base font-extrabold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 ${
                copied === 'yes' ? 'bg-emerald-800' : 'bg-confirmed hover:bg-emerald-800'
              }`}
            >
              {copied === 'yes' ? PARENT.ready.copied : PARENT.ready.copy}
            </button>
            <button
              type="button"
              onClick={() => setLink(null)}
              className="min-h-12 flex-[1_1_110px] cursor-pointer rounded-2xl border-2 border-action text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              {PARENT.ready.done}
            </button>
          </div>
          <p role="status" aria-live="polite" className="-mt-1 text-sm font-bold text-confirmed">
            {copied === 'yes' ? PARENT.ready.copiedStatus : ''}
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className={card}>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-black tracking-[-0.02em] text-ink">{PARENT.title}</h2>
            <p className="text-[15px] leading-relaxed text-body">{PARENT.intro(childName)}</p>
          </div>
          <FormField id="child-device-name" text={PARENT.nameLabel} error={error ?? undefined}>
            <input
              id="child-device-name"
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              aria-invalid={!!error}
              className={fieldRoutine}
            />
          </FormField>
          <p className="text-[13px] leading-relaxed text-slate-600">{PARENT.responsibility(childName)}</p>
          <button
            ref={submitRef}
            type="submit"
            disabled={create.isPending || name.trim() === ''}
            className="min-h-12 cursor-pointer self-start rounded-2xl border-2 border-action px-6 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {create.isPending ? PARENT.creating : PARENT.create}
          </button>
        </form>
      )}
      {planOpen && <FreemiumLimitModal reason="child_device" opener={submitRef} onStayFree={() => setPlanOpen(false)} onViewPlans={() => navigate('/planes')} />}
    </section>
  )
}
