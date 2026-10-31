import type { ReactElement } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import { HistoryDocument, type DocumentInput } from './HistoryDocument'
import { loadRenderer } from './loadRenderer'
import { PageLog } from './pageLog'

// specs/050: making the PDF. This module brings the PDF library with it, so the app only reaches it with `import()` when somebody
// taps «Generar PDF» (it never enters the first download).

/**
 * Lays the document out twice: the first time learns on which pages each section landed, the second writes them in the cover's
 * index. `draw` turns the document into the file (a Blob in the browser, a buffer in tests).
 */
export async function layOut<T>(input: DocumentInput, draw: (document: ReactElement<DocumentProps>) => Promise<T>): Promise<{ file: T; pages: number }> {
  const first = new PageLog()
  await draw(<HistoryDocument input={input} index={null} log={first} />)
  const second = new PageLog()
  const file = await draw(<HistoryDocument input={input} index={first.index()} log={second} />)
  return { file, pages: second.total }
}

/** The history's PDF as a file of the browser, and how many pages it has. */
export async function renderHistoryPdf(input: DocumentInput): Promise<{ blob: Blob; pages: number }> {
  const { pdf } = await loadRenderer()
  const { file, pages } = await layOut(input, (document) => pdf(document).toBlob())
  return { blob: file, pages }
}

export type { DocumentInput }
