import { useLocation, useNavigate } from 'react-router-dom'

/**
 * The "this app only keeps a record" notice shown once, on the home a tutor lands on right after
 * creating their account (Principio I: PediTrack registers, it never interprets medical data).
 *
 * It lives in the navigation state, not in storage: signing in later doesn't bring it back, and
 * "Entendido" clears the state (`replace`) so a reload doesn't bring it back either. The photo line
 * says what really happens — the text is read in the phone, but the photo itself is uploaded to the
 * tutor's own account (Principio II).
 */
export function WelcomeDisclaimer() {
  const location = useLocation()
  const navigate = useNavigate()
  const shown = (location.state as { welcome?: boolean } | null)?.welcome === true
  if (!shown) return null

  return (
    <section
      role="region"
      aria-labelledby="welcome-disclaimer-title"
      className="flex flex-col gap-3 rounded-2xl border border-hint-border bg-hint p-5 text-sm leading-relaxed text-ink"
    >
      <h2 id="welcome-disclaimer-title" className="text-base font-extrabold tracking-tight">
        Antes de empezar
      </h2>
      <p>
        PediTrack es una bitácora <strong>informativa y de seguimiento</strong>: guarda lo que tu pediatra indica y te
        ayuda a llevar el registro, pero <strong>no sustituye una consulta médica</strong> ni interpreta ningún dato.
        Ante cualquier duda o síntoma, acude siempre a tu médico.
      </p>
      <p>
        El texto de la foto de la receta se lee en tu teléfono; la foto se guarda solo en tu cuenta y no se comparte con
        nadie.
      </p>
      <button
        type="button"
        onClick={() => navigate(location.pathname, { replace: true, state: null })}
        className="min-h-11 self-start cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors hover:bg-white"
      >
        Entendido
      </button>
    </section>
  )
}
