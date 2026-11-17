import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@clerk/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { acceptDisclaimer } from './api'
import type { Account } from './types'
import { useBodyScrollLock } from '../../shared/ui/useBodyScrollLock'
import { useConnectivity } from '../../shared/offline/connectivity'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'

const para = 'm-0 text-[15px] leading-[1.55] text-body'

/**
 * The "this app only keeps a record" notice shown over the home until the tutor presses
 * "Entendido" (Principio I: PediTrack registers, it never interprets medical data).
 *
 * Pressing it records the acknowledgement in the backend (`disclaimer_acceptances`: account,
 * version of the text, timestamp — specs/010-registro-aceptacion-aviso), so it is auditable, and the
 * notice comes back only for an account that hasn't acknowledged the version the server currently
 * serves: a brand-new account, an account that existed before this notice, or any account after the
 * wording changes (the backend's `CurrentDisclaimerVersion` is bumped with it). If the record can't
 * be saved, the notice stays and says so.
 *
 * Since specs/071 it is a window over the home (a sheet from the bottom on the phone, a 600 px dialog on the web), and it only
 * closes with «Entendido» — that is the confirmation that gets saved —: Escape and the backdrop do nothing; the focus starts on
 * the title and Tab stays inside. Without a connection it isn't shown (it could not be closed).
 *
 * The photo line says what really happens — the text is read in the phone and only when it is
 * printed, not handwritten (otherwise nothing is read or autofilled: PediTrack never interprets),
 * but the photo itself is uploaded to the tutor's own account (Principio II).
 */
export function WelcomeDisclaimer({ account }: { account: Account | undefined }) {
  // Without a connection «Entendido» can't be saved and nothing else closes the window: it would cover the phone's saved home with
  // no way out (specs/067). It is not shown then and comes back on its own when the connection does.
  const connectivity = useConnectivity()
  if (!account || account.disclaimerAccepted !== false || connectivity === 'offline') return null
  return <DisclaimerDialog account={account} />
}

function DisclaimerDialog({ account }: { account: Account }) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const desktop = useIsDesktop()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useBodyScrollLock()

  const mutation = useMutation({
    mutationFn: async ({ accountId, version }: { accountId: string; version: string }) =>
      acceptDisclaimer(accountId, version, await getToken()),
    onSuccess: () => {
      queryClient.setQueryData<Account>(['accounts', 'me'], (current) =>
        current ? { ...current, disclaimerAccepted: true } : current,
      )
    },
  })

  useEffect(() => {
    titleRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return
      const list: (HTMLElement | null)[] = [
        titleRef.current,
        ...Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []),
      ]
      const items = list.filter((el): el is HTMLElement => el !== null)
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!dialogRef.current?.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return createPortal(
    <div className={`fixed inset-0 z-50 flex bg-ink/55 ${desktop ? 'items-center justify-center p-10' : 'flex-col justify-end'}`}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex flex-col bg-surface ${
          desktop
            ? 'max-h-[720px] w-[600px] rounded-3xl shadow-[0_24px_60px_rgba(4,37,43,0.3)]'
            : 'max-h-[88%] rounded-t-[28px] shadow-[0_-12px_40px_rgba(4,37,43,0.25)]'
        }`}
      >
        {!desktop && (
          <div className="flex justify-center pt-2.5">
            <span aria-hidden="true" className="h-[5px] w-10 rounded-full bg-hint-border" />
          </div>
        )}
        <div className={desktop ? 'px-8 pt-7' : 'px-[22px] pt-3.5'}>
          <h2
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
            className={`m-0 font-black tracking-[-0.02em] text-ink focus:outline-none ${desktop ? 'text-[26px]' : 'text-[22px]'}`}
          >
            Antes de empezar
          </h2>
        </div>
        <div className={`flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto ${desktop ? 'px-8 pt-3.5 pb-2' : 'px-[22px] pt-3 pb-1'}`}>
          <p className={para}>
            PediTrack es una bitácora <strong className="text-ink">informativa y de seguimiento</strong>: guarda lo que tu pediatra
            indica y te ayuda a llevar el registro, pero <strong className="text-ink">no sustituye una consulta médica</strong> ni
            interpreta ningún dato. Ante cualquier duda o síntoma, acude siempre a tu médico.
          </p>
          <p className={para}>
            Leemos el texto de tu receta solo cuando está <strong className="text-ink">impresa</strong> (no escrita a mano), y lo que
            leemos te lo proponemos para que lo corrijas. Si una receta no está dentro de lo que podemos leer,{' '}
            <strong className="text-ink">no la interpretamos y no autollenamos ningún campo</strong>: los capturas tú. Así no
            interpretamos nada por ti.
          </p>
          <p className={para}>
            La lectura se hace en tu teléfono; la foto se guarda en tu cuenta y solo la ven las personas a las que tú invites a tu
            familia.
          </p>
          <p className={para}>
            <strong className="text-ink">Compartir significa que otra persona ve los datos médicos del menor</strong>: sus consultas,
            recetas, síntomas y tomas. Compártelos solo con quien cuida de tu hijo y quita el acceso cuando ya no haga falta.
          </p>
          <p className={para}>
            Los suplementos y las actividades que registres <strong className="text-ink">solo repiten lo que tú escribiste</strong>:
            PediTrack no sugiere suplementos, actividades, cantidades ni horarios, y avisa a las personas de tu familia que tengan
            acceso a ese hijo.
          </p>
          <p className={para}>
            Si le das acceso a tu hijo, <strong className="text-ink">verá en su teléfono sus tomas y actividades y podrá marcarlas</strong>;
            no se guarda ningún dato personal suyo y puedes quitar el acceso cuando quieras.
          </p>
          <p className={para}>
            Las vacunas y las fotos de la cartilla de tu hijo son datos de salud: se guardan solo en tu cuenta y las personas que
            invites podrán verlas según su rol.
          </p>
          <p className={para}>
            También puedes registrar <strong className="text-ink">tus propias consultas</strong>. Son tuyas: solo tú las ves, salvo que
            tú decidas compartirlas con los Tutores de tu familia; nunca las ve un Cuidador ni el teléfono de un hijo.
          </p>
        </div>
        <div className={`flex flex-col border-t border-hint-edge ${desktop ? 'items-end px-8 pt-[18px] pb-6' : 'px-[22px] pt-3.5 pb-[30px]'}`}>
          {mutation.isError && (
            <p role="alert" className="mb-2.5 self-stretch text-[13px] font-semibold text-error">
              No pudimos guardar tu confirmación. Revisa tu conexión e inténtalo de nuevo.
            </p>
          )}
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ accountId: account.id, version: account.disclaimerVersion })}
            className={`min-h-[52px] cursor-pointer rounded-2xl bg-confirmed text-[17px] font-extrabold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${desktop ? 'px-8' : 'w-full'}`}
          >
            {mutation.isPending ? 'Guardando…' : 'Entendido'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
