import { useAuth } from '@clerk/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { acceptDisclaimer } from './api'
import type { Account } from './types'

/**
 * The "this app only keeps a record" notice shown at the top of the home until the tutor presses
 * "Entendido" (Principio I: PediTrack registers, it never interprets medical data).
 *
 * Pressing it records the acknowledgement in the backend (`disclaimer_acceptances`: account,
 * version of the text, timestamp — specs/010-registro-aceptacion-aviso), so it is auditable, and the
 * notice comes back only for an account that hasn't acknowledged the version the server currently
 * serves: a brand-new account, an account that existed before this notice, or any account after the
 * wording changes (the backend's `CurrentDisclaimerVersion` is bumped with it). If the record can't
 * be saved, the notice stays and says so.
 *
 * The photo line says what really happens — the text is read in the phone and only when it is
 * printed, not handwritten (otherwise nothing is read or autofilled: PediTrack never interprets),
 * but the photo itself is uploaded to the tutor's own account (Principio II).
 */
export function WelcomeDisclaimer({ account }: { account: Account | undefined }) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ accountId, version }: { accountId: string; version: string }) =>
      acceptDisclaimer(accountId, version, await getToken()),
    onSuccess: () => {
      queryClient.setQueryData<Account>(['accounts', 'me'], (current) =>
        current ? { ...current, disclaimerAccepted: true } : current,
      )
    },
  })

  if (!account || account.disclaimerAccepted !== false) return null

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
        Leemos el texto de tu receta solo cuando está <strong>impresa</strong> (no escrita a mano), y lo que leemos te
        lo proponemos para que lo corrijas. Si una receta no está dentro de lo que podemos leer,{' '}
        <strong>no la interpretamos y no autollenamos ningún campo</strong>: los capturas tú. Así no interpretamos nada
        por ti.
      </p>
      <p>La lectura se hace en tu teléfono; la foto se guarda solo en tu cuenta y no se comparte con nadie.</p>
      {mutation.isError && (
        <p role="alert" className="font-semibold text-red-700">
          No pudimos guardar tu confirmación. Revisa tu conexión e inténtalo de nuevo.
        </p>
      )}
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ accountId: account.id, version: account.disclaimerVersion })}
        className="min-h-11 self-start cursor-pointer rounded-2xl border-2 border-action px-5 py-2.5 text-[15px] font-extrabold text-action transition-colors hover:bg-white disabled:cursor-wait disabled:opacity-70"
      >
        {mutation.isPending ? 'Guardando…' : 'Entendido'}
      </button>
    </section>
  )
}
