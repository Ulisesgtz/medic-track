import type { Font as FontApi } from '@react-pdf/renderer'

// Figtree, the app's typeface, embedded in the PDF from the app's own files (never a font service: the document is made on the phone,
// Principio II). The «latin» files carry accents, «ñ», «« »» and «·»; the arrow and the check mark are drawn as shapes (Marks.tsx).

export type FontWeight = 400 | 600 | 700 | 800 | 900

/** Where each weight's file is: the app's build URLs by default; tests pass file paths. */
export type FontSources = Record<FontWeight, string>

export const FONT_FAMILY = 'Figtree'

/**
 * Registers Figtree with the PDF library and turns word hyphenation off (Spanish words must never be split with a dash). `italic` is
 * the 400 italic, the one the card's «Corregida el …» uses.
 */
export function registerFonts(Font: typeof FontApi, sources: FontSources, italic?: string) {
  const fonts: { src: string; fontWeight: number; fontStyle?: 'italic' }[] = (Object.entries(sources) as [string, string][]).map(
    ([weight, src]) => ({ src, fontWeight: Number(weight) }),
  )
  if (italic) fonts.push({ src: italic, fontWeight: 400, fontStyle: 'italic' })
  Font.register({ family: FONT_FAMILY, fonts })
  Font.registerHyphenationCallback((word) => [word])
}
