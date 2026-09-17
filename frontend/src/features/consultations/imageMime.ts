/**
 * Sniffs an image's MIME type from its base64-encoded bytes' magic number,
 * instead of assuming JPEG — the upload input accepts any `image/*` (PNG,
 * WEBP, etc.), and a wrong MIME in a data URI can make some
 * browsers/webviews refuse to decode it.
 */
export function sniffImageMimeType(base64: string): string {
  const binary = atob(base64.slice(0, 16))
  const bytes = Array.from(binary, (c) => c.charCodeAt(0))

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif'
  }
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  return 'image/jpeg' // reasonable fallback for unrecognized/truncated headers
}
