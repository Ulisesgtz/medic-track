import figtree400 from '@fontsource/figtree/files/figtree-latin-400-normal.woff?url'
import figtree400Italic from '@fontsource/figtree/files/figtree-latin-400-italic.woff?url'
import figtree600 from '@fontsource/figtree/files/figtree-latin-600-normal.woff?url'
import figtree700 from '@fontsource/figtree/files/figtree-latin-700-normal.woff?url'
import figtree800 from '@fontsource/figtree/files/figtree-latin-800-normal.woff?url'
import figtree900 from '@fontsource/figtree/files/figtree-latin-900-normal.woff?url'
import ext400 from '@fontsource/figtree/files/figtree-latin-ext-400-normal.woff?url'
import ext400Italic from '@fontsource/figtree/files/figtree-latin-ext-400-italic.woff?url'
import ext600 from '@fontsource/figtree/files/figtree-latin-ext-600-normal.woff?url'
import ext700 from '@fontsource/figtree/files/figtree-latin-ext-700-normal.woff?url'
import ext800 from '@fontsource/figtree/files/figtree-latin-ext-800-normal.woff?url'
import ext900 from '@fontsource/figtree/files/figtree-latin-ext-900-normal.woff?url'
import { registerFonts } from './fonts'

// The PDF library is large: it is fetched only when somebody taps «Generar PDF» (its own chunk), and its fonts are registered once.

type Renderer = typeof import('@react-pdf/renderer')

let loading: Promise<Renderer> | null = null

export function loadRenderer(): Promise<Renderer> {
  if (!loading) {
    loading = import('@react-pdf/renderer').then((renderer) => {
      registerFonts(renderer.Font, { 400: figtree400, 600: figtree600, 700: figtree700, 800: figtree800, 900: figtree900 }, figtree400Italic, {
        sources: { 400: ext400, 600: ext600, 700: ext700, 800: ext800, 900: ext900 },
        italic: ext400Italic,
      })
      return renderer
    })
    // A failed download can be tried again later.
    loading.catch(() => {
      loading = null
    })
  }
  return loading
}
