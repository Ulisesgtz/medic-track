import { useRef, useState } from 'react'

/**
 * Runs OCR on a prescription photo entirely in the browser via tesseract.js
 * (research.md — the photo never reaches any third-party service). Exposes
 * the extracted text as an editable suggestion and the reading progress
 * (0–1) for the "Leyendo receta" bar; a failed or empty result never blocks
 * the rest of the form (FR-007).
 */
export function useOcrSuggestion() {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  // Bumped on every call so a slow, superseded run's result never
  // overwrites a newer one if the parent quickly swaps the selected photo.
  const requestIdRef = useRef(0)

  async function runOcr(file: File) {
    const requestId = ++requestIdRef.current
    setIsRunning(true)
    setProgress(0)
    try {
      const { default: Tesseract } = await import('tesseract.js')
      const result = await Tesseract.recognize(file, 'spa', {
        logger: (message: { status: string; progress: number }) => {
          if (requestId === requestIdRef.current && message.status === 'recognizing text') {
            setProgress(message.progress)
          }
        },
      })
      if (requestId !== requestIdRef.current) return // superseded by a newer photo
      const text = result.data.text.trim()
      setSuggestion(text.length > 0 ? text : null)
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

  return { suggestion, isRunning, progress, runOcr }
}
