/** The secret of a pasted link: what comes after the `#`, or the whole text if it has none. */
export function tokenFromPasted(text: string): string {
  const trimmed = text.trim()
  const hash = trimmed.lastIndexOf('#')
  return (hash >= 0 ? trimmed.slice(hash + 1) : trimmed).trim()
}
