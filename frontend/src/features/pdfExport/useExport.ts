import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/react'
import { ExportApiError, fetchExportData } from './api'
import { fileName } from './document/model'
import { NO_PHOTOS, photoCount, preparePhotos } from './photos'
import type { ExportData, ExportRequest } from './types'

// specs/050: the panel's states. «Generar PDF» asks the server for the data, then builds the document on this device (the
// library is fetched only now, its own chunk) and hands over a file. Nothing is kept anywhere: the file lives while the panel does.

/** What is being done while generating: asking for the data, the photos (one by one), then laying out the document. */
export type ExportStage = 'data' | 'photos' | 'document'

export const STAGES: readonly ExportStage[] = ['data', 'photos', 'document']

export interface ExportResult {
  file: File
  pages: number
  /** Bytes. */
  size: number
  request: ExportRequest
}

export type ExportState =
  | { status: 'options' }
  | { status: 'generating'; stage: ExportStage; photo?: { done: number; total: number } }
  | ({ status: 'ready' } & ExportResult)
  | { status: 'error' }
  /** Nothing registered in the chosen period. */
  | { status: 'empty'; request: ExportRequest }
  /** The family doesn't have the paid plan (the account said so, or the server's 422). */
  | { status: 'plan' }

interface UseExportOptions {
  childId: string
  /** Start on the plan notice: the account is known to be on the free plan, so nothing is asked of the server. */
  free?: boolean
  /** The catalog's names of the symptoms, for the cover's «Filtros». */
  symptomNames?: Record<string, string>
}

const nothingRegistered = (data: ExportData) => data.consultations.length === 0 && data.vaccinations.length === 0

export function useExport({ childId, free = false, symptomNames }: UseExportOptions) {
  const { getToken } = useAuth()
  const [state, setState] = useState<ExportState>(free ? { status: 'plan' } : { status: 'options' })
  const run = useRef<AbortController | null>(null)
  const last = useRef<ExportRequest | null>(null)

  // Leaving the panel stops whatever was being done.
  useEffect(() => () => run.current?.abort(), [])

  const generate = useCallback(
    async (request: ExportRequest) => {
      run.current?.abort()
      const controller = new AbortController()
      run.current = controller
      last.current = request
      const still = () => !controller.signal.aborted
      setState({ status: 'generating', stage: 'data' })
      try {
        const data = await fetchExportData(childId, request, await getToken(), controller.signal)
        if (!still()) return
        if (nothingRegistered(data)) {
          setState({ status: 'empty', request })
          return
        }
        let photos = NO_PHOTOS
        if (request.sections.photos && data.photos && photoCount(data.photos) > 0) {
          photos = await preparePhotos(childId, data.photos, await getToken(), controller.signal, (done, total) => {
            if (still()) setState({ status: 'generating', stage: 'photos', photo: { done, total } })
          })
          if (!still()) return
        }
        setState({ status: 'generating', stage: 'document' })
        const { renderHistoryPdf } = await import('./document/render')
        const now = new Date()
        const icon = new URL('/icon-192.png', window.location.origin).href
        const { blob, pages } = await renderHistoryPdf({ request, data, now, icon, symptomNames, photos })
        // The library can't be stopped halfway: a cancelled run just drops what it made.
        if (!still()) return
        const file = new File([blob], fileName(data.child, now), { type: 'application/pdf' })
        setState({ status: 'ready', file, pages, size: file.size, request })
      } catch (error) {
        if (!still()) return
        if (error instanceof ExportApiError && error.kind === 'plan_required') setState({ status: 'plan' })
        else setState({ status: 'error' })
      } finally {
        if (run.current === controller) run.current = null
      }
    },
    [childId, getToken, symptomNames],
  )

  /** «Cancelar»: stops the run and goes back to the options, with no file. */
  const cancel = useCallback(() => {
    run.current?.abort()
    run.current = null
    setState({ status: 'options' })
  }, [])

  /** «Cambiar periodo»: back to the options. */
  const back = useCallback(() => setState({ status: 'options' }), [])

  /** «Intentar de nuevo»: the same request again. */
  const retry = useCallback(() => {
    if (last.current) void generate(last.current)
    else setState({ status: 'options' })
  }, [generate])

  return { state, generate, cancel, back, retry }
}
