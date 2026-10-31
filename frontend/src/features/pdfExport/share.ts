// specs/050 (research R6): handing the PDF over. «Compartir» uses the phone's (or the browser's) own share sheet when it takes
// files; «Descargar» saves it. The file never leaves the device any other way: the app doesn't upload it anywhere (Principio II).

/** Whether this browser can share this file through its share sheet. */
export function canShareFile(file: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/**
 * Opens the share sheet with the file. Closing the sheet without choosing is the person's choice, not a failure: it resolves
 * `false`. Anything else is thrown.
 */
export async function shareFile(file: File, title: string): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title })
    return true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false
    throw error
  }
}

/** Saves the file through a temporary link, freed right after. */
export function downloadFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Some browsers start the download after the click returns: the address is freed a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
