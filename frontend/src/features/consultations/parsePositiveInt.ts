/** The first whole number in what the parent typed ("8", "c/8 h", "7 días"), or null. */
export function parsePositiveInt(text: string): number | null {
  const match = /\d+/.exec(text)
  if (!match) return null
  const value = Number(match[0])
  return value > 0 ? value : null
}
