// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { Document, Font, Image, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { registerFonts } from './fonts'

// What the mock asks of the PDF library (specs/050, the spike of T004, kept as a guard against a library update) — header and footer on every page, «Página X de Y», and inside ONE
// consultation that crosses a page «Continúa en la página N →» at the bottom and «(continuación)» at the top of the next.

const file = (weight: number) => fileURLToPath(new URL(`../../../../node_modules/@fontsource/figtree/files/figtree-latin-${weight}-normal.woff`, import.meta.url))

registerFonts(Font, { 400: file(400), 600: file(600), 700: file(700), 800: file(800), 900: file(900) })

const long = 'Desde el miércoles 15 tiene fiebre por las noches; la más alta fue 38.6 °C el jueves. Tos seca que aumenta al acostarse. '.repeat(80)

function Spike() {
  return (
    <Document>
      <Page size="LETTER" style={{ fontFamily: 'Figtree', fontSize: 11, paddingTop: 70, paddingBottom: 80, paddingHorizontal: 51 }}>
        <Text fixed style={{ position: 'absolute', top: 30, left: 51, fontWeight: 800 }}>
          PediTrack · Mateo Morales
        </Text>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: 900, fontSize: 20 }}>Consultas</Text>
        </View>
        <View>
          <Text
            fixed
            render={({ subPageNumber }) => (subPageNumber > 1 ? '18 oct 2026 · Dra. Laura Cázares (continuación)' : '18 oct 2026 · Dra. Laura Cázares')}
            style={{ fontWeight: 800 }}
          />
          <Text>{long}</Text>
          <Text
            fixed
            render={({ subPageNumber, subPageTotalPages, pageNumber }) => (subPageNumber < subPageTotalPages ? `Continúa en la página ${pageNumber + 1}` : '')}
            style={{ fontWeight: 700 }}
          />
        </View>
        <Text
          fixed
          style={{ position: 'absolute', bottom: 30, left: 51, fontSize: 9 }}
          render={({ pageNumber, totalPages }) => `Generado con PediTrack el 24 oct 2026 · Página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  )
}

async function pagesText(buffer: Uint8Array): Promise<string[]> {
  const pdf = await getDocument({ data: buffer, useSystemFonts: false, isEvalSupported: false }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent()
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
  }
  return pages
}

describe('the PDF library (spike)', () => {
  it('repeats header and footer, numbers the pages, and says where a crossing consultation continues', async () => {
    const buffer = await renderToBuffer(<Spike />)
    expect(Buffer.from(buffer.subarray(0, 4)).toString()).toBe('%PDF')
    const pages = await pagesText(new Uint8Array(buffer))
    expect(pages.length).toBeGreaterThan(1)
    pages.forEach((text, i) => {
      expect(text).toContain('PediTrack · Mateo Morales')
      expect(text).toContain(`Página ${i + 1} de ${pages.length}`)
    })
    expect(pages[0]).toContain('Continúa en la página 2')
    expect(pages[1]).toContain('(continuación)')
    expect(pages[0]).not.toContain('(continuación)')
    expect(pages[pages.length - 1]).not.toContain('Continúa en la página')
    expect(pages.join(' ')).toContain('miércoles')
  }, 60_000)

  it('embeds a JPEG photo', async () => {
    const jpeg = readFileSync(fileURLToPath(new URL('./__fixtures__/foto.jpg', import.meta.url)))
    const buffer = await renderToBuffer(
      <Document>
        <Page size="LETTER">
          <Image src={{ data: jpeg, format: 'jpg' }} style={{ width: 240, height: 160 }} />
        </Page>
      </Document>,
    )
    const pdf = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise
    const ops = await (await pdf.getPage(1)).getOperatorList()
    expect(ops.fnArray).toContain(OPS.paintImageXObject)
  }, 60_000)
})
