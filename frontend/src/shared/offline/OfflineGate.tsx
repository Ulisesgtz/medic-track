import { Logo } from '../ui/Logo'
import { reloadApp } from '../appVersion/reload'
import { isInstalledPhone } from './device'
import { GATE_BODY_COMPUTER, GATE_BODY_PHONE, GATE_TITLE, RETRY } from './offlineText'

/**
 * «Necesitas conexión para abrir PediTrack» (specs/067, contracts/ui.md §2): no network and no copy on this device — the first time,
 * after a logout, after 7 days, or on a computer (which never keeps data, FR-012). The same card as `MessagePage`, one for both
 * designs (a full-screen notice has no phone or web layout of its own); «Reintentar» loads the app again.
 */
export function OfflineGate() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-5 py-10">
      <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-xl">
        <div className="flex justify-center">
          <Logo size={56} variant="light" />
        </div>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-ink">{GATE_TITLE}</h1>
        <p className="mt-3 text-base leading-relaxed text-body">{isInstalledPhone() ? GATE_BODY_PHONE : GATE_BODY_COMPUTER}</p>
        <button
          type="button"
          onClick={reloadApp}
          className="mt-7 block min-h-11 w-full cursor-pointer rounded-2xl bg-confirmed px-6 py-3.5 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          {RETRY}
        </button>
      </div>
    </main>
  )
}
