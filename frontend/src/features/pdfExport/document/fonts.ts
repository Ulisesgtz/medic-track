import type { Font as FontApi } from '@react-pdf/renderer'

// Figtree, the app's typeface, embedded in the PDF from the app's own files (never a font service: the document is made on the phone,
// Principio II). The «latin» files carry accents, «ñ», «« »» and «·»; the arrow and the check mark are drawn as shapes (Marks.tsx).
// A name or a note with «ł», «ő» or «ş» needs the «latin-ext» files: the library doesn't join two files of one family by character
// range, so they are a second family, the document's fallback (without it those letters came out as other characters).

export type FontWeight = 400 | 600 | 700 | 800 | 900

/** Where each weight's file is: the app's build URLs by default; tests pass file paths. */
export type FontSources = Record<FontWeight, string>

export const FONT_FAMILY = 'Figtree'
export const FONT_FAMILY_EXT = 'FigtreeExt'

/** One family's files: its weights and, optionally, the 400 italic. */
export interface FontSet {
  sources: FontSources
  italic?: string
}

function faces({ sources, italic }: FontSet) {
  const fonts: { src: string; fontWeight: number; fontStyle?: 'italic' }[] = (Object.entries(sources) as [string, string][]).map(
    ([weight, src]) => ({ src, fontWeight: Number(weight) }),
  )
  if (italic) fonts.push({ src: italic, fontWeight: 400, fontStyle: 'italic' })
  return fonts
}

/**
 * Registers Figtree with the PDF library and turns word hyphenation off (Spanish words must never be split with a dash). `italic` is
 * the 400 italic, the one the card's «Corregida el …» uses; `ext` is the «latin-ext» fallback family.
 */
export function registerFonts(Font: typeof FontApi, sources: FontSources, italic?: string, ext?: FontSet) {
  Font.register({ family: FONT_FAMILY, fonts: faces({ sources, italic }) })
  if (ext) Font.register({ family: FONT_FAMILY_EXT, fonts: faces(ext) })
  Font.registerHyphenationCallback((word) => [word])
}
