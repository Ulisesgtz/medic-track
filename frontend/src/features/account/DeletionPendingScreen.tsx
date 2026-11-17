import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useQueryClient } from '@tanstack/react-query'
import { useLogout } from '../auth/useLogout'
import type { Account } from '../home/types'
import { Logo } from '../../shared/ui/Logo'
import { Notice } from '../../shared/ui/Notice'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { PAUSED, longDate } from './accountText'
import { cancelDeletion, downloadMyData } from './api'
import { markCanceled } from './canceledNotice'
import { DownloadCard, cardClass } from './DownloadCard'

/**
 * The paused account (specs/070, FR-010): while `/accounts/me` says `deletion`, this is the whole app — the date, «Descargar mis
 * datos», «Cancelar la eliminación» and «Cerrar sesión». Nothing else can be reached (the server refuses it too).
 */
export function DeletionPendingScreen({
  account,
  scheduledFor,
}: {
  account: Account
  scheduledFor: string
}) {
  const isDesktop = useIsDesktop()
  const variant = isDesktop ? 'desktop' : 'phone'
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const logout = useLogout()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function cancel() {
    setBusy(true)
    setFailed(false)
    try {
      await cancelDeletion(account.id, await getToken())
      markCanceled()
      await queryClient.invalidateQueries()
      navigate('/home', { replace: true })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-canvas px-5 py-10">
      <div className="mx-auto flex max-w-[560px] flex-col gap-5">
        <Logo />
        <h1 className="text-[26px] font-black leading-tight text-ink">
          {PAUSED.title(longDate(scheduledFor))}
        </h1>
        <p className="text-[16px] leading-relaxed text-body">{PAUSED.body}</p>
        <DownloadCard
          variant={variant}
          fetchFile={(token) => downloadMyData(account.id, token)}
          solid
        />
        <section className={cardClass}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancel()}
            className={`${pageHeaderButton('secondary', variant)} disabled:cursor-wait disabled:opacity-60`}
          >
            {busy ? PAUSED.canceling : PAUSED.cancel}
          </button>
          {failed && <Notice tone="error">{PAUSED.cancelFailed}</Notice>}
          <button
            type="button"
            onClick={() => void logout()}
            className="self-start text-[15px] font-bold text-action underline"
          >
            {PAUSED.signOut}
          </button>
        </section>
      </div>
    </main>
  )
}
