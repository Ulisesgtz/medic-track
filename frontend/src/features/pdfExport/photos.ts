import { fetchCardPhoto, fetchConsultationPhoto } from './api'
import type { ExportPhotos } from './types'

// specs/050 (T023): the photos of the annex, asked one by one (each can weigh megabytes) and redrawn on this device as a JPEG of
// 1600 px on the long side, like `shrinkPhoto`, so the PDF stays light. A photo the browser can't decode (a HEIC outside Safari)
// or that couldn't be fetched is not left out silently: it is drawn as «Foto que no se pudo incluir en el PDF».

export const ANNEX_PHOTO_SIDE = 1600
const JPEG_QUALITY = 0.8

/** Each photo as a JPEG data URL, or null when it couldn't be included. Keyed by card photo id and by consultation id. */
export interface PreparedPhotos {
  card: Record<string, string | null>
  consultations: Record<string, string | null>
}

export const NO_PHOTOS: PreparedPhotos = { card: {}, consultations: {} }

/** How many photos the annex will try to include. */
export const photoCount = (photos: ExportPhotos | null) => (photos ? photos.card.length + photos.consultations.length : 0)

function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** A photo's base64 redrawn as a JPEG data URL; null when the browser can't decode it. */
export async function toAnnexJpeg(base64: string): Promise<string | null> {
  if (!base64) return null
  try {
    const bitmap = await createImageBitmap(new Blob([bytesOf(base64)]))
    const scale = Math.min(1, ANNEX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return null
    // A transparent PNG would turn black in a JPEG.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const url = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    return url.startsWith('data:image/jpeg') ? url : null
  } catch {
    return null
  }
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

/**
 * Fetches and redraws every photo, the card's first, telling each step (`onProgress(3, 7)`). «Cancelar» (the signal) stops it;
 * any other failure of one photo only leaves that photo out.
 */
export async function preparePhotos(
  childId: string,
  photos: ExportPhotos,
  token: string | null,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<PreparedPhotos> {
  const prepared: PreparedPhotos = { card: {}, consultations: {} }
  const jobs: { save: (url: string | null) => void; fetch: () => Promise<string> }[] = [
    ...photos.card.map((p) => ({ save: (url: string | null) => (prepared.card[p.id] = url), fetch: () => fetchCardPhoto(childId, p.id, token, signal) })),
    ...photos.consultations.map((p) => ({
      save: (url: string | null) => (prepared.consultations[p.consultationId] = url),
      fetch: () => fetchConsultationPhoto(p.consultationId, token, signal),
    })),
  ]
  for (const [i, job] of jobs.entries()) {
    onProgress(i + 1, jobs.length)
    try {
      job.save(await toAnnexJpeg(await job.fetch()))
    } catch (error) {
      if (isAbort(error) || signal.aborted) throw error
      job.save(null)
    }
  }
  return prepared
}
