/**
 * The `tel:` address of a phone number written freely («+52 (33) 1234-5678»): only the digits and a leading «+» are kept. Null when
 * there are no digits, so the screen shows the number but no «Llamar».
 */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null
  const trimmed = phone.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits === '') return null
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`
}
