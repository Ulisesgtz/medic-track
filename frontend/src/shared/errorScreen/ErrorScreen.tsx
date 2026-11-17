import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@clerk/react'
import { useConnectivity } from '../offline/connectivity'
import { Logo } from '../ui/Logo'
import { useIsDesktop } from '../ui/useIsDesktop'
import {
  EXITS,
  RELOAD_LABEL,
  screenContent,
  type ErrorContext,
  type ErrorState,
} from './errorScreenText'
import { goTo, reloadPage } from './navigate'
import { rememberReload, reloadedRecently } from './reloadMemory'

// specs/072, contracts/ui-error-screen.md: the screen that replaces a blank page. Built from the delivered mock
// (referencia/Pantalla de error PediTrack.dc.html, states A–F). Two designs by `useIsDesktop`, never mixed; the child's phone (C) has
// no web design of its own and uses the phone's one centered. The content comes before the frame in the DOM and is moved with CSS
// `order`, so a screen reader starts at the title.

interface ErrorScreenProps {
  /** `shell` = inside `AppShell` (the sidebar or the screen's own frame stay: A); `page` = the whole page (B, C, D). */
  frame: 'shell' | 'page'
  pathname: string
}

function contextOf(pathname: string, signedIn: boolean): ErrorContext {
  if (pathname === '/hijo' || pathname.startsWith('/hijo/')) return 'child'
  return signedIn ? 'person' : 'visitor'
}

function Wordmark({ className, tone }: { className: string; tone: 'light' | 'dark' }) {
  return (
    <span
      className={`${className} font-black tracking-[-0.03em] ${tone === 'dark' ? 'text-white' : 'text-ink'}`}
    >
      Pedi<span className={tone === 'dark' ? 'text-bright-soft' : 'text-action'}>Track</span>
    </span>
  )
}

function ReloadIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="stroke-action"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      <path d="M20 12a8 8 0 1 1-2.7-6" />
      <path d="M20 4.5V9h-4.5" />
    </svg>
  )
}

function SignalIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="stroke-action"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      <path d="M3 9.5a14 14 0 0 1 18 0" strokeDasharray="1.5 3.5" />
      <path d="M6.5 13a9 9 0 0 1 11 0" />
      <path d="M10 16.4a4 4 0 0 1 4 0" />
      <circle cx="12" cy="20" r="1.2" className="fill-action" />
    </svg>
  )
}

/** The frame that goes around the card on a whole page (B, C, D). It sits after the content in the DOM. */
function PageFrame({ context, desktop }: { context: ErrorContext; desktop: boolean }) {
  if (context === 'visitor') {
    return (
      <div
        aria-hidden="true"
        className={`order-1 flex items-center gap-2.5 bg-ink ${desktop ? 'h-[72px] px-12' : 'min-h-[60px] px-5 py-4'}`}
      >
        <Logo size={34} variant="dark" />
        <Wordmark className="text-lg" tone="dark" />
      </div>
    )
  }
  if (context === 'child') {
    return (
      <div aria-hidden="true" className="order-1 flex items-center gap-2.5 px-5 pt-2.5">
        <Logo size={36} variant="light" />
        <Wordmark className="text-[20px]" tone="light" />
      </div>
    )
  }
  return (
    <div
      aria-hidden="true"
      className={`order-1 flex flex-col items-center ${desktop ? 'gap-3.5 px-12 pt-20' : 'gap-3 px-5 pt-7'}`}
    >
      <Logo size={desktop ? 64 : 60} variant="light" />
      <Wordmark className={desktop ? 'text-[30px]' : 'text-[28px]'} tone="light" />
    </div>
  )
}

export function ErrorScreen({ frame, pathname }: ErrorScreenProps) {
  const { isSignedIn } = useAuth()
  const desktop = useIsDesktop()
  const offline = useConnectivity() === 'offline'
  const [again] = useState(() => reloadedRecently())
  const heading = useRef<HTMLHeadingElement>(null)

  const context = contextOf(pathname, isSignedIn !== false)
  const state: ErrorState = offline ? 'offline' : again ? 'again' : 'base'
  const content = screenContent(state, context)
  const exit = EXITS[context]

  useEffect(() => {
    heading.current?.focus()
  }, [])

  // The child's phone has no web design: it keeps the phone's, centered.
  const web = desktop && context !== 'child'
  const child = context === 'child'
  const withFrame = frame === 'page' || context !== 'person'
  const wide = web
  const frameB = context === 'person' && frame === 'page'

  const reload = () => {
    rememberReload()
    reloadPage()
  }
  const leave = () => goTo(exit.to)

  const solidClass = wide
    ? 'min-h-[52px] min-w-[200px] cursor-pointer rounded-2xl bg-confirmed px-7 text-base font-extrabold text-white transition-colors hover:bg-confirmed-strong'
    : `w-full cursor-pointer rounded-2xl bg-confirmed text-[17px] font-extrabold text-white transition-colors hover:bg-confirmed-strong ${child ? 'min-h-14' : 'min-h-[52px]'}`
  const outlineClass = wide
    ? 'min-h-[52px] cursor-pointer rounded-2xl border-2 border-action bg-transparent px-6 text-base font-extrabold text-action transition-colors hover:bg-hint'
    : 'min-h-12 w-full cursor-pointer rounded-2xl border-2 border-action bg-transparent text-base font-extrabold text-action transition-colors hover:bg-hint'

  const buttons: ReactNode[] =
    content.solid === 'reload'
      ? [
          <button key="a" type="button" className={solidClass} onClick={reload}>
            {RELOAD_LABEL}
          </button>,
          <button key="b" type="button" className={outlineClass} onClick={leave}>
            {exit.label}
          </button>,
        ]
      : [
          <button key="a" type="button" className={solidClass} onClick={leave}>
            {exit.label}
          </button>,
          <button key="b" type="button" className={outlineClass} onClick={reload}>
            {RELOAD_LABEL}
          </button>,
        ]

  const card = (
    <div
      className={
        wide
          ? 'flex w-full max-w-[600px] flex-col gap-[18px] rounded-3xl bg-surface px-11 py-10 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
          : 'flex w-full flex-col gap-4 rounded-3xl bg-surface px-6 pb-6 pt-7 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'
      }
    >
      <span
        aria-hidden="true"
        className={`flex flex-none items-center justify-center rounded-full border-[1.5px] border-hint-border bg-hint ${wide ? 'size-[72px]' : 'size-16'}`}
      >
        {state === 'offline' ? (
          <SignalIcon size={wide ? 36 : 32} />
        ) : (
          <ReloadIcon size={wide ? 36 : 32} />
        )}
      </span>
      <h1
        ref={heading}
        tabIndex={-1}
        className={`m-0 font-black leading-[1.15] tracking-[-0.03em] text-ink outline-none ${wide ? 'text-[34px]' : child ? 'text-[30px]' : 'text-[28px]'}`}
      >
        {content.title}
      </h1>
      <p
        className={`m-0 leading-[1.55] text-body ${wide ? 'text-[17px]' : child ? 'text-lg' : 'text-base'}`}
      >
        {content.text}
      </p>
      {content.note && <p className="m-0 text-sm leading-[1.5] text-muted">{content.note}</p>}
      <div
        className={
          wide ? 'mt-2.5 flex flex-row flex-wrap items-center gap-3' : 'mt-2 flex flex-col gap-3'
        }
      >
        {buttons}
      </div>
    </div>
  )

  const padding = wide
    ? frameB
      ? 'px-12 pb-20 pt-11'
      : 'px-12 pb-14 pt-24'
    : child || context === 'visitor'
      ? 'px-5 pb-8 pt-9'
      : 'px-5 pb-8 pt-7'

  const main = (
    <main className={`order-2 flex flex-1 flex-col items-center ${padding}`}>
      <div className={child && desktop ? 'w-full max-w-[430px]' : 'contents'}>{card}</div>
    </main>
  )

  if (!withFrame) return <div className="flex min-h-full flex-1 flex-col">{main}</div>
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {main}
      <PageFrame context={context} desktop={web} />
    </div>
  )
}
