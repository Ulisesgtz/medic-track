/** The longest side a prescription photo keeps: a page of text is still read well and a phone's 12 MP shot weighs a tenth. */
export const MAX_PHOTO_SIDE = 2000
const JPEG_QUALITY = 0.85

/**
 * The prescription photo as it is sent to the server: scaled down to `MAX_PHOTO_SIDE` on its longest side and saved as a
 * JPEG (specs/043). It runs in the browser, after the OCR read the original, and nothing leaves the phone. A JPEG is shown
 * by any browser as it is, so reading it back needs no step.
 *
 * It never gets in the way of saving: when the browser can't decode the file (a HEIC on a browser without support, no
 * canvas) or the result isn't smaller, the original is returned untouched.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}
