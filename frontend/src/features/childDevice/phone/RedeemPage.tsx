import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PHONE } from '../childText'
import { redeemLink } from './api'
import { NoAccess } from './NoAccess'
import { readCredential, writeCredential } from './storage'

/**
 * `/hijo#<token>` (specs/047): the child's phone opens the link a parent made. The token is in the `#` — which a browser never sends to
 * a server — and is taken out of the address bar at once; it goes to the API only in the BODY of the one request. It is redeemed ONCE
 * (also under StrictMode); the credential that comes back is kept in this phone's own storage and the phone goes on to `/hijo/hoy`.
 * Whatever goes wrong, the phone reads one sentence: the link no longer works. Without a token but with a working credential it just
 * goes in.
 */
export function RedeemPage() {
  const navigate = useNavigate()
  const started = useRef(false)
  // Read once, on the first render: the effect below takes the secret out of the address bar.
  const [token] = useState(() => window.location.hash.replace(/^#/, ''))
  const [failed, setFailed] = useState<string | null>(() => (token === '' && !readCredential() ? PHONE.noLink : null))

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (token === '') {
      if (readCredential()) navigate('/hijo/hoy', { replace: true })
      return
    }
    // The secret leaves the address bar before anything else happens.
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    redeemLink(token)
      .then((got) => {
        if (!writeCredential(got.credential)) {
          setFailed(PHONE.redeemFailed)
          return
        }
        navigate('/hijo/hoy', { replace: true })
      })
      .catch(() => setFailed(PHONE.redeemFailed))
  }, [navigate, token])

  if (failed) return <NoAccess message={failed} />
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col justify-center gap-3 bg-canvas px-6 py-10">
      <p role="status" aria-live="polite" className="text-[17px] font-semibold text-action">
        {PHONE.redeeming}
      </p>
    </main>
  )
}
