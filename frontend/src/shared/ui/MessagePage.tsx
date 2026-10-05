import { Link } from 'react-router-dom'
import { Logo } from './Logo'

interface MessagePageProps {
  title: string
  message: string
  /** Where the single button goes. */
  to?: string
  linkLabel?: string
}

/**
 * A full-screen notice with one way out — used where there is nothing else to
 * show (a route that doesn't exist, the plans page that isn't built yet), so
 * the app never lands on a blank screen. Same card as the home's "no account"
 * state: light logo on the ink background, one solid button (design-tokens).
 */
export function MessagePage({ title, message, to = '/home', linkLabel = 'Volver a mi home' }: MessagePageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-5 py-10">
      <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-xl">
        <div className="flex justify-center">
          <Logo size={56} variant="light" />
        </div>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-ink">{title}</h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">{message}</p>
        <Link
          to={to}
          className="mt-7 block min-h-11 cursor-pointer rounded-2xl bg-confirmed px-6 py-3.5 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800"
        >
          {linkLabel}
        </Link>
      </div>
    </main>
  )
}
