import { useNavigate } from 'react-router-dom'
import { BACK, SCREEN_NEEDS_CONNECTION } from './offlineText'

/**
 * «Esta pantalla necesita conexión.» (specs/067, FR-003, contracts/ui.md §4): without a connection, a screen this phone never saw,
 * or one that always needs the server (history, PDF, growth, plans, family). «← Volver» goes back, or to the home with no history.
 * One quiet block for both designs, on the page's canvas.
 */
export function OfflineMissing() {
  const navigate = useNavigate()
  const back = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/home')
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-5 py-10 text-center">
      <p className="text-lg font-extrabold text-ink">{SCREEN_NEEDS_CONNECTION}</p>
      <button
        type="button"
        onClick={back}
        className="min-h-11 cursor-pointer rounded-xl px-4 text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
      >
        {BACK}
      </button>
    </main>
  )
}
