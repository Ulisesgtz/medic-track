import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { isInstalled, isIOS } from '../../reminders/deviceSupport'
import { PHONE } from '../childText'
import { redeemLink } from './api'
import { tokenFromPasted, useChildManifest } from './childManifest'
import { readCredential, writeCredential } from './storage'

const main = 'mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center gap-4 bg-canvas px-6 py-10'
const solid =
  'min-h-12 w-full cursor-pointer rounded-2xl bg-confirmed px-5 text-base font-extrabold text-white transition-colors hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-confirmed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const outline =
  'min-h-12 w-full cursor-pointer rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action transition-colors hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2'
const field =
  'min-h-12 w-full min-w-0 rounded-[14px] border-[1.5px] border-hint-border bg-surface px-4 py-3 text-base text-ink focus:border-2 focus:border-ink focus:outline-none'

/**
 * `/hijo#<token>` (specs/047): the child's phone opens the link a parent made. The token is in the `#` — which a browser never sends to
 * a server — and is taken out of the address bar at once; it goes to the API only in the BODY of the one request. It is redeemed ONCE
 * (also under StrictMode); the credential that comes back is kept in this phone's own storage and the phone goes on to `/hijo/hoy`.
 *
 * On an iPhone outside the installed app the link is NOT spent: the app added to the home screen keeps its storage apart from Safari,
 * so a credential saved here would not be there. The page says to install first and paste the link inside the app (or to use it here
 * anyway). Without a token, an installed app with no access offers to paste the link. The page points to the child's manifest, so the
 * installed app starts here and not at the parents' login.
 */
export function RedeemPage() {
  useChildManifest()
  const navigate = useNavigate()
  const started = useRef(false)
  // Read once, on the first render: the effect below takes the secret out of the address bar.
  const [token] = useState(() => window.location.hash.replace(/^#/, ''))
  const [installFirst] = useState(() => token !== '' && isIOS() && !isInstalled())
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(() => token !== '' && !installFirst)
  // A pasted link keeps its form on screen while it is checked (and after a failure, with what was pasted).
  const [pasted, setPasted] = useState(false)

  // Only sets state once the answer arrives, so the effect can call it; the buttons set `busy` themselves first.
  const run = useCallback(
    (secret: string) => {
      redeemLink(secret)
        .then((got) => {
          if (!writeCredential(got.credential)) throw new Error('storage')
          navigate('/hijo/hoy', { replace: true })
        })
        .catch(() => {
          setFailed(true)
          setBusy(false)
        })
    },
    [navigate],
  )

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (token === '') {
      if (readCredential()) navigate('/hijo/hoy', { replace: true })
      return
    }
    // The secret leaves the address bar before anything else happens.
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    if (!installFirst) run(token)
  }, [navigate, token, installFirst, run])

  function redeem(secret: string, fromPaste = false) {
    setPasted(fromPaste)
    setBusy(true)
    setFailed(false)
    run(secret)
  }

  if (installFirst && !busy && !failed) return <InstallFirst token={token} onUseHere={() => redeem(token)} />
  if (busy && !pasted) {
    return (
      <main className={main}>
        <p role="status" aria-live="polite" className="text-[17px] font-semibold text-action">
          {PHONE.redeeming}
        </p>
      </main>
    )
  }
  return <PasteLink failed={failed} busy={busy} onSubmit={(secret) => redeem(secret, true)} />
}

/** An iPhone outside the installed app: install first, then paste the link inside the app. */
function InstallFirst({ token, onUseHere }: { token: string; onUseHere: () => void }) {
  const text = PHONE.installFirst
  const link = `${window.location.origin}/hijo#${token}`
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied('yes')
    } catch {
      setCopied('no')
    }
  }
  return (
    <main className={main}>
      <h1 className="text-2xl leading-[1.2] font-black tracking-[-0.02em] text-ink">{text.title}</h1>
      <p className="text-[15px] leading-relaxed text-body">{text.why}</p>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-base leading-relaxed text-ink">
        {text.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <label htmlFor="child-link" className="text-[13px] font-bold text-ink">
        {text.linkLabel}
      </label>
      <input id="child-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={field} />
      <button type="button" onClick={() => void copy()} className={solid}>
        {copied === 'yes' ? text.copied : text.copy}
      </button>
      <p role="status" aria-live="polite" className="text-sm font-semibold text-body">
        {copied === 'no' ? text.copyFailed : ''}
      </p>
      <button type="button" onClick={onUseHere} className={outline}>
        {text.useHere}
      </button>
    </main>
  )
}

/** No access yet (typically the installed app on an iPhone): paste the link to get in. */
function PasteLink({ failed, busy, onSubmit }: { failed: boolean; busy: boolean; onSubmit: (token: string) => void }) {
  const text = PHONE.paste
  const [value, setValue] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    const secret = tokenFromPasted(value)
    if (secret) onSubmit(secret)
  }
  return (
    <main className={main}>
      <h1 className="text-2xl leading-[1.2] font-black tracking-[-0.02em] text-ink">{text.title}</h1>
      <p className="text-[15px] leading-relaxed text-body">{failed ? PHONE.redeemFailed : text.help}</p>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <label htmlFor="paste-link" className="text-[13px] font-bold text-ink">
          {text.label}
        </label>
        <input id="paste-link" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} className={field} />
        <button type="submit" disabled={busy || value.trim() === ''} className={solid}>
          {busy ? text.opening : text.submit}
        </button>
      </form>
    </main>
  )
}
