import { useState } from 'react'
import { useAuth } from '@clerk/react'
import { canShareFile, downloadFile, shareFile } from '../pdfExport/share'
import type { DownloadedFile } from './api'

export type DownloadState = 'idle' | 'working' | 'ready' | 'error'

/**
 * Downloads a ZIP from the API (specs/070) and hands it over: the phone's share sheet when it takes files, else a plain
 * download — the same way as the history's PDF. Nothing is kept in the app: the file only exists in the browser's memory
 * until it is handed over.
 */
export function useDownload(fetchFile: (token: string | null) => Promise<DownloadedFile>) {
  const { getToken } = useAuth()
  const [state, setState] = useState<DownloadState>('idle')
  const [file, setFile] = useState<File | null>(null)

  async function start() {
    setState('working')
    try {
      const { blob, name } = await fetchFile(await getToken())
      const ready = new File([blob], name, { type: 'application/zip' })
      if (canShareFile(ready)) {
        setFile(ready)
        setState('ready')
      } else {
        downloadFile(blob, name)
        setFile(null)
        setState('ready')
      }
    } catch {
      setState('error')
    }
  }

  async function share() {
    if (!file) return
    try {
      await shareFile(file, file.name)
    } catch {
      downloadFile(file, file.name)
    }
  }

  function save() {
    if (file) downloadFile(file, file.name)
  }

  return { state, start, share, save, canShare: file !== null }
}
