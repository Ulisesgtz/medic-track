import { useRef, useState } from 'react'

/** A word read from a photo: its text, the engine's confidence (0-100), the letter height in pixels and the line it sits on. */
export interface OcrWord {
  text: string
  confidence: number
  height: number
  line: number
}

interface RunOptions {
  /** Also keep the per-word data (size and confidence). Only the cabinet asks; everybody else keeps the plain reading. */
  words?: boolean
}

type Logger = (message: { status: string; progress: number }) => void
type Block = { paragraphs: { lines: { words: { text: string; confidence: number; bbox: { y0: number; y1: number } }[] }[] }[] }

function wordsOf(blocks: Block[] | null | undefined): OcrWord[] {
  const out: OcrWord[] = []
  let line = 0
  for (const block of blocks ?? [])
    for (const paragraph of block.paragraphs)
      for (const l of paragraph.lines) {
        for (const w of l.words) out.push({ text: w.text, confidence: w.confidence, height: w.bbox.y1 - w.bbox.y0, line })
        line++
      }
  return out
}

/**
 * Runs OCR on a prescription photo entirely in the browser via tesseract.js
 * (research.md — the photo never reaches any third-party service). Exposes
 * the extracted text as an editable suggestion and the reading progress
 * (0–1) for the "Leyendo receta" bar; a failed or empty result never blocks
 * the rest of the form (FR-007). `runOcr(file, { words: true })` also exposes
 * `words` (tesseract's blocks: needs its own worker, the one-shot `recognize`
 * can't ask for them).
 */
export function useOcrSuggestion() {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [words, setWords] = useState<OcrWord[] | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  // Bumped on every call so a slow, superseded run's result never
  // overwrites a newer one if the parent quickly swaps the selected photo.
  const requestIdRef = useRef(0)

  async function runOcr(file: File, options: RunOptions = {}) {
    const requestId = ++requestIdRef.current
    setIsRunning(true)
    setProgress(0)
    setWords(null)
    try {
      const { default: Tesseract } = await import('tesseract.js')
      const logger: Logger = (message) => {
        if (requestId === requestIdRef.current && message.status === 'recognizing text') {
          setProgress(message.progress)
        }
      }
      let text: string
      let found: OcrWord[] | null = null
      if (options.words) {
        const worker = await Tesseract.createWorker('spa', 1, { logger })
        try {
          const result = await worker.recognize(file, {}, { blocks: true })
          text = result.data.text.trim()
          found = wordsOf(result.data.blocks as Block[] | null)
        } finally {
          await worker.terminate()
        }
      } else {
        const result = await Tesseract.recognize(file, 'spa', { logger })
        text = result.data.text.trim()
      }
      if (requestId !== requestIdRef.current) return // superseded by a newer photo
      setSuggestion(text.length > 0 ? text : null)
      setWords(found)
    } catch {
      // FR-007: OCR failure is not fatal — the form stays fully usable
      // manually, we just have no suggestion to offer.
      if (requestId === requestIdRef.current) {
        setSuggestion(null)
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsRunning(false)
        setProgress(1)
      }
    }
  }

  return { suggestion, words, isRunning, progress, runOcr }
}
