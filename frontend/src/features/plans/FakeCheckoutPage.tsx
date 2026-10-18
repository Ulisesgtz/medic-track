import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

const button =
  'min-h-12 cursor-pointer rounded-2xl border-2 border-action px-5 text-base font-extrabold text-action hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:opacity-60'

/**
 * The payment page of the **fake provider** (`PAYMENTS_DRIVER=fake`, `VITE_PAYMENTS_FAKE=true`): the stand-in for Mercado Pago's page in
 * the E2E and in development. Its buttons move the fake's state through the API's helper routes and go back to the return page. The
 * route only exists when the build says so; it never exists in production.
 */
export function FakeCheckoutPage() {
  const [params] = useSearchParams()
  const subscription = params.get('sub') ?? ''
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function act(action: 'approve' | 'reject' | 'cancel') {
    setBusy(true)
    try {
      await fetch(`${API_BASE_URL}/payments/fake/${encodeURIComponent(subscription)}/${action}`, { method: 'POST' })
    } finally {
      setBusy(false)
      navigate('/planes/regreso', { replace: true })
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-black text-ink">Pago de prueba</h1>
      <p className="text-base text-body">Esta página simula la del proveedor de pagos. No se cobra nada.</p>
      <button type="button" className={button} disabled={busy} onClick={() => void act('approve')}>
        Aprobar el pago
      </button>
      <button type="button" className={button} disabled={busy} onClick={() => void act('reject')}>
        Rechazar el pago
      </button>
      <button type="button" className={button} disabled={busy} onClick={() => void act('cancel')}>
        Cancelar
      </button>
    </main>
  )
}
