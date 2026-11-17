import { pageHeaderButton } from '../../shared/ui/pageHeaderButton'
import { Notice } from '../../shared/ui/Notice'
import { ACCOUNT } from './accountText'
import type { DownloadedFile } from './api'
import { useDownload } from './useDownload'

export const cardClass =
  'flex flex-col gap-3 rounded-[22px] bg-surface px-[22px] py-5 shadow-[0_8px_20px_rgba(4,37,43,0.07)]'

type Download = ReturnType<typeof useDownload>

/** Once the file is ready on a phone that takes files: «Compartir» and «Descargar» (the hand-over is the person's tap). */
export function DownloadReadyActions({ download, variant }: { download: Download; variant: 'phone' | 'desktop' }) {
  if (download.state !== 'ready' || !download.canShare) return null
  return (
    <>
      <button type="button" onClick={() => void download.share()} className={pageHeaderButton('secondary', variant)}>
        {ACCOUNT.share}
      </button>
      <button type="button" onClick={download.save} className={pageHeaderButton('secondary', variant)}>
        {ACCOUNT.save}
      </button>
    </>
  )
}

/** What the download says: «Listo: tu archivo se descargó.» (a plain download) or that it failed. */
export function DownloadStatus({ download }: { download: Download }) {
  return (
    <div aria-live="polite">
      {download.state === 'ready' && !download.canShare && <Notice tone="success">{ACCOUNT.downloaded}</Notice>}
      {download.state === 'error' && <Notice tone="error">{ACCOUNT.downloadFailed}</Notice>}
    </div>
  )
}

/**
 * «Descargar todos mis datos» (specs/070, FR-001): one button, then «Preparando tu archivo…», then the file is handed over (the
 * share sheet on a phone that takes files, else a download). `solid` makes it the screen's one solid button (the paused
 * account's screen); elsewhere it is outlined.
 */
export function DownloadCard({
  variant,
  fetchFile,
  title = ACCOUNT.downloadTitle,
  body = ACCOUNT.downloadBody,
  button = ACCOUNT.downloadButton,
  solid = false,
}: {
  variant: 'phone' | 'desktop'
  fetchFile: (token: string | null) => Promise<DownloadedFile>
  title?: string
  body?: string
  button?: string
  solid?: boolean
}) {
  const download = useDownload(fetchFile)
  const working = download.state === 'working'
  return (
    <section className={cardClass} aria-labelledby="download-title">
      <h2 id="download-title" className="text-[17px] font-black text-ink">
        {title}
      </h2>
      <p className="text-[15px] leading-relaxed text-body">{body}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={working}
          onClick={() => void download.start()}
          className={`${pageHeaderButton(solid ? 'primary' : 'secondary', variant)} disabled:cursor-wait disabled:opacity-60`}
        >
          {working ? ACCOUNT.downloading : button}
        </button>
        <DownloadReadyActions download={download} variant={variant} />
      </div>
      <DownloadStatus download={download} />
    </section>
  )
}
