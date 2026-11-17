import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useReverification } from '@clerk/react'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { RoutinePageFrame } from '../supplements/RoutineFormPage'
import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { fieldRoutine, labelClass } from '../../shared/ui/formStyles'
import { Notice } from '../../shared/ui/Notice'
import { DELETE, longDate } from './accountText'
import { DeletionError, downloadMyData, requestDeletion } from './api'
import { cardClass, DownloadReadyActions, DownloadStatus } from './DownloadCard'
import { useDownload } from './useDownload'

const GRACE_DAYS = 30

function Block({ title, children }: { title: string; children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[16px] font-black text-ink">{title}</h2>
      <p className="text-[15px] leading-relaxed text-body">{children}</p>
    </div>
  )
}

/**
 * `/cuenta/eliminar` (specs/070, contracts/ui.md): what is deleted, when, what happens meanwhile, the family and the
 * subscription, «Descargar mis datos primero», the word ELIMINAR and the button — which Clerk may follow by asking for the
 * password or code (`useReverification`: the server answers «verify it's you» when the sign-in is older than 10 minutes).
 * On success the account reads itself again and the whole app becomes the paused screen.
 */
export function DeleteAccountPage() {
  const { isDesktop } = useSidebarSession()
  const variant = isDesktop ? 'desktop' : 'phone'
  const account = useCurrentAccount().data
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const download = useDownload((token) => downloadMyData(account?.id ?? '', token))
  const ask = useReverification(async () => requestDeletion(account?.id ?? '', await getToken(), word.trim().toUpperCase()))

  const matches = word.trim().toUpperCase() === 'ELIMINAR'
  const [date] = useState(() =>
    longDate(new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()),
  )

  async function submit() {
    if (!account || !matches || busy) return
    setBusy(true)
    setError(null)
    try {
      await ask()
      await queryClient.invalidateQueries({ queryKey: ['accounts', 'me'] })
    } catch (e) {
      if (e instanceof DeletionError && e.kind === 'pending') {
        await queryClient.invalidateQueries({ queryKey: ['accounts', 'me'] })
      } else if (e instanceof DeletionError && e.kind === 'subscription') {
        setError(DELETE.failedSubscription)
      } else if (e instanceof DeletionError) {
        setError(DELETE.failed)
      }
      // Closing Clerk's «verify it's you» is the person's choice: nothing to say.
    } finally {
      setBusy(false)
    }
  }

  return (
    <RoutinePageFrame
      isDesktop={isDesktop}
      childId={undefined}
      backLabel={DELETE.back}
      backTo="/cuenta"
      title={DELETE.title}
      maxWidth="max-w-[720px]"
    >
      <section className={cardClass}>
        <Block title={DELETE.whatTitle}>{DELETE.what}</Block>
        <Block title={DELETE.whenTitle}>{DELETE.when(date)}</Block>
        <Block title={DELETE.meanwhileTitle}>{DELETE.meanwhile}</Block>
        <Block title={DELETE.familyTitle}>
          {account?.family ? DELETE.familyMember(account.family.ownerName) : DELETE.familyOwner}
        </Block>
        <Block title={DELETE.subscriptionTitle}>{DELETE.subscription}</Block>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={download.state === 'working'}
            onClick={() => void download.start()}
            className={`${pageHeaderButton('secondary', variant)} disabled:cursor-wait disabled:opacity-60`}
          >
            {DELETE.downloadFirst}
          </button>
          <DownloadReadyActions download={download} variant={variant} />
        </div>
        <DownloadStatus download={download} />
      </section>

      <section className={cardClass}>
        <label htmlFor="confirm-word" className={labelClass}>
          {DELETE.confirmLabel}
        </label>
        <input
          id="confirm-word"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={word}
          onChange={(e) => setWord(e.target.value)}
          className={`${fieldRoutine} border-slate-300`}
        />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            autoFocus
            onClick={() => navigate('/cuenta')}
            className={pageHeaderButton('secondary', variant)}
          >
            {DELETE.cancel}
          </button>
          <button
            type="button"
            disabled={!matches || busy || !account}
            onClick={() => void submit()}
            className="inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border-2 border-red-700 px-[18px] text-[15px] font-extrabold text-red-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? DELETE.submitting : DELETE.submit}
          </button>
        </div>
      </section>
    </RoutinePageFrame>
  )
}
