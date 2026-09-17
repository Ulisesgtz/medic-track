import { useState } from 'react'

/**
 * Runs OCR on a prescription photo entirely in the browser via tesseract.js
 * (research.md — the photo never reaches any third-party service). Exposes
 * the extracted text as an editable suggestion; a failed or empty result
 * never blocks the rest of the form (FR-007).
 */
export function useOcrSuggestion() {
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  async function runOcr(file: File) {
    setIsRunning(true)
    try {
      const { default: Tesseract } = await import('tesseract.js')
      const result = await Tesseract.recognize(file, 'spa')
      const text = result.data.text.trim()
      setSuggestion(text.length > 0 ? text : null)
    } catch {
      // FR-007: OCR failure is not fatal — the form stays fully usable
      // manually, we just have no suggestion to offer.
      setSuggestion(null)
    } finally {
      setIsRunning(false)
    }
  }

  return { suggestion, isRunning, runOcr }
}
