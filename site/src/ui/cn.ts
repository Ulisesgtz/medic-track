/** Une clases de Tailwind ignorando lo que no es texto. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
