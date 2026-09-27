import type { ReactNode } from 'react'
import { Logo } from '../../shared/ui/Logo'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'

const CHECKLIST = [
  'El OCR de la receta corre en tu dispositivo.',
  'Tu pediatra sigue siendo la única autoridad médica.',
  'El plan gratuito incluye un hijo.',
]

function Wordmark({ size }: { size: number }) {
  return (
    <div className="flex items-center gap-3">
      <Logo size={size} />
      <span className="text-2xl font-black tracking-tight text-white">
        Pedi<span className="text-[#67e8f9]">Track</span>
      </span>
    </div>
  )
}

/**
 * The frame of the sign-in screens (login, password reset). No mock covers
 * them (spec 007 predates real authentication), so they reuse the signup's
 * two designs — the phone's dark header over the form, and the web's split
 * screen with the dark panel — and never mix them (`useIsDesktop`). `children`
 * is the form itself.
 */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const isDesktop = useIsDesktop()

  if (isDesktop) {
    return (
      <div className="flex min-h-screen flex-col lg:flex-row">
        <section className="flex flex-col justify-between gap-10 bg-ink px-8 py-10 lg:w-[46%] lg:px-16 lg:py-16">
          <Wordmark size={44} />
          <div className="max-w-md">
            <h1 className="text-4xl leading-[1.05] font-black tracking-tight text-white lg:text-5xl">
              La bitácora médica de tus hijos, en un solo lugar.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-[#a5f3fc]">
              Registra consultas, recetas y tomas de medicamento. La app registra datos, nunca los interpreta.
            </p>
          </div>
          <ul className="flex flex-col gap-3.5">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-[#cffafe]">
                <span className="mt-0.5 text-bright" aria-hidden="true">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <main className="flex flex-1 items-center justify-center bg-surface px-6 py-12 lg:px-16">
          <div className="flex w-full max-w-[520px] flex-col gap-6">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-ink">{title}</h2>
              <p className="mt-2 text-base text-slate-600">{subtitle}</p>
            </div>
            {children}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px] bg-surface">
      <header className="bg-ink px-6 pt-6 pb-8">
        <Wordmark size={44} />
        <h1 className="mt-6 text-3xl leading-tight font-black tracking-tight text-white">{title}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-[#a5f3fc]">{subtitle}</p>
      </header>
      <main className="flex flex-col gap-6 px-6 pt-7 pb-9">{children}</main>
    </div>
  )
}
