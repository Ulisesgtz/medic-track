// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Font, renderToBuffer } from '@react-pdf/renderer'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import figtree400 from '@fontsource/figtree/files/figtree-latin-400-normal.woff?inline'
import figtree400Italic from '@fontsource/figtree/files/figtree-latin-400-italic.woff?inline'
import figtree600 from '@fontsource/figtree/files/figtree-latin-600-normal.woff?inline'
import figtree700 from '@fontsource/figtree/files/figtree-latin-700-normal.woff?inline'
import figtree800 from '@fontsource/figtree/files/figtree-latin-800-normal.woff?inline'
import figtree900 from '@fontsource/figtree/files/figtree-latin-900-normal.woff?inline'
import icon from '../../../../public/icon-192.png?inline'
import type { ExportConsultation } from '../types'
import { CASE_A, CASE_B, CASE_C, NOW } from './fixtures'
import { registerFonts } from './fonts'
import type { DocumentInput } from './HistoryDocument'
import { layOut } from './render'

// specs/050 (T017): the three cases of the mock, laid out for real and read back page by page.

registerFonts(Font, { 400: figtree400, 600: figtree600, 700: figtree700, 800: figtree800, 900: figtree900 }, figtree400Italic)

async function pagesOf(input: DocumentInput): Promise<{ pages: string[]; count: number }> {
  const { file, pages: count } = await layOut(input, (document) => renderToBuffer(document))
  const bytes = new Uint8Array(file)
  const pdf = await getDocument({ data: bytes, useSystemFonts: false }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent()
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' '))
  }
  return { pages, count }
}

const input = (c: typeof CASE_A): DocumentInput => ({ ...c, now: NOW, icon })

/** Whether a page says `piece`. The spaced capitals of the mock's labels («HISTORIAL DE SALUD») come out letter by letter. */
function says(text: string, piece: string): boolean {
  const squash = (t: string) => t.replace(/\s+/g, '')
  return text.includes(piece) || squash(text).includes(squash(piece.toUpperCase()))
}

describe('the history PDF', () => {
  it('Caso A: cover, consultations from the newest, the card, and the header and footer on every page', async () => {
    const { pages, count } = await pagesOf(input(CASE_A))
    expect(count).toBe(pages.length)
    pages.forEach((text, i) => {
      expect(text).toContain('PediTrack')
      expect(text).toContain('Mateo Morales')
      expect(text).toContain(`Generado con PediTrack el 24 oct 2026 · Página ${i + 1} de ${pages.length}`)
      expect(text).toContain('Lo registrado es lo que la familia capturó. No sustituye el expediente ni el criterio de tu médico.')
    })

    const cover = pages[0]
    for (const piece of [
      'Historial de salud',
      '14 mar 2021',
      '5 años 7 meses',
      '112 cm',
      '19.4 kg',
      'Del 1 ene 2026 al 24 oct 2026',
      'Todas las vacunas registradas, sin filtro de periodo',
      '4 consultas · 10 vacunas registradas · 2 fotos de la cartilla · 1 foto de receta',
      'Tratamiento en curso',
      'Cada 8 h · desde el 18 oct 2026',
      'Indicado por Dra. Laura Cázares',
      '28 oct 2026 · 10:30',
      'Consultorio 204, Torre Médica Satélite',
      'Consultas, de la más reciente a la más antigua',
    ]) {
      expect(says(cover, piece), piece).toBe(true)
    }
    expect(cover).not.toContain('anotada')

    const body = pages.slice(1).join(' ')
    const order = ['18 oct 2026', '12 sep 2026', '2 jun 2026', '20 feb 2026'].map((d) => body.indexOf(d))
    expect(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]))).toBe(true)
    for (const piece of [
      'Notas previas a la consulta',
      'cada 8 h · 7 días · primera toma 08:00 del 18 oct',
      'En curso',
      '16 de 18 tomas marcadas · 2 sin registrar · 3 por venir · Última marca: 24 oct, 08:05, por Ana',
      'Terminado el 20 oct',
      'Se recorrió el 15 sep · +2 tomas',
      'Solo registro',
      'Sin síntomas marcados · Sin medicamentos',
      '21 de 21 tomas marcadas · Del 20 al 26 feb · Última marca: 26 feb, 22:00, por Ana',
      '28 oct 2026, 10:30 · Dra. Laura Cázares · Consultorio 204, Torre Médica Satélite',
    ]) {
      expect(says(body, piece), piece).toBe(true)
    }

    const card = pages.findIndex((text) => text.includes('Cartilla de vacunación 10 vacunas registradas'))
    expect(card).toBeGreaterThan(1)
    for (const piece of ['DOSIS FECHA LOTE LUGAR NOTA', 'Nombre escrito por la familia', 'Corregida el 3 oct por Ana', '2.ª dosis', 'Hospital Ángeles Lindavista']) {
      expect(says(pages[card], piece), piece).toBe(true)
    }

    // The index on the cover gives the pages where each section really is.
    const consultationsFirst = pages.findIndex((text) => text.includes('4 consultas · de la más reciente a la más antigua')) + 1
    const consultationsLast = card
    const consultationsPages = consultationsFirst === consultationsLast ? `p. ${consultationsFirst}` : `p. ${consultationsFirst}–${consultationsLast}`
    expect(cover).toContain(`Consultas, de la más reciente a la más antigua ${consultationsPages}`)
    expect(cover).toContain(`Cartilla de vacunación p. ${card + 1}`)
  }, 120_000)

  it('Caso B: no consultations, the whole card', async () => {
    const { pages } = await pagesOf(input(CASE_B))
    expect(pages).toHaveLength(2)
    for (const piece of [
      'Sofía Morales',
      '2 ago 2025',
      '1 año 2 meses',
      'Sin dato',
      'Todo el historial',
      'Sin filtros',
      'No incluidas',
      '0 consultas · 9 vacunas registradas',
      'No hay consultas registradas en este periodo.',
      'Cartilla de vacunación p. 2',
    ]) {
      expect(says(pages[0], piece), piece).toBe(true)
    }
    expect(pages[0]).not.toContain('Tratamiento en curso')
    expect(pages[0]).not.toContain('Próxima cita')
    expect(pages[1]).toContain('9 vacunas registradas')
    expect(pages[1]).toContain('Lloró poco, durmió bien')
  }, 120_000)

  it('Caso C: the history’s filters, consultations and no vaccines', async () => {
    const { pages } = await pagesOf(input(CASE_C))
    expect(pages).toHaveLength(2)
    for (const piece of [
      'Filtros actuales del historial',
      'Fechas: del 1 jul 2026 al 24 oct 2026 · Medicamento: Paracetamol',
      '2 consultas · 0 vacunas registradas',
      'No hay vacunas registradas.',
      'Consultas, de la más reciente a la más antigua p. 2',
    ]) {
      expect(says(pages[0], piece), piece).toBe(true)
    }
    expect(pages[1]).toContain('5 de 6 tomas marcadas · 1 sin registrar · Última marca: 4 oct, 20:05, por Ana')
    expect(pages[1]).toContain('Terminado el 4 oct')
    expect(pages[1]).toContain('cada 24 h · 1 día sin registro de tomas en la app')
  }, 120_000)

  it('the photos: «Foto en p. N» beside the consultation, the annex with what each one is, a photo not included says so', async () => {
    const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDtqKKK3MD/2Q=='
    const photos = { card: { p1: jpeg, p2: null }, consultations: { c1: jpeg } }
    const { pages } = await pagesOf({ ...input(CASE_A), photos })
    const annex = pages.length
    expect(says(pages[annex - 1], 'Anexo: fotos')).toBe(true)
    for (const piece of [
      'Cartilla de papel, hoja 1 · tomada el 3 oct 2026',
      'Cartilla de papel, hoja 2 · tomada el 3 oct 2026',
      'Foto que no se pudo incluir en el PDF',
      'Receta de la consulta del 18 oct 2026 · Dra. Laura Cázares',
    ]) {
      expect(pages[annex - 1], piece).toContain(piece)
    }
    expect(pages[annex - 1].match(/no se pudo incluir/g)).toHaveLength(1)
    expect(pages[0]).toContain('Anexo: fotos de la cartilla y de recetas')
    expect(pages[0]).toContain(`p. ${annex}`)
    expect(pages[1]).toContain(`Foto en p. ${annex}`)
    // Only the consultation with a photo has a thumbnail.
    expect(pages.join(' ').match(/Foto en p\./g)).toHaveLength(1)
  }, 120_000)

  it('without the photos asked there is no annex nor thumbnail, even if the consultation has a photo', async () => {
    const { pages } = await pagesOf({ ...input(CASE_A), request: { ...CASE_A.request, sections: { ...CASE_A.request.sections, photos: false } } })
    expect(pages.join(' ')).not.toContain('Foto en p.')
    expect(pages[0]).not.toContain('Anexo')
    expect(pages[0]).toContain('No incluidas')
  }, 120_000)

  it('a consultation that crosses a page says where it continues, and says «(continuación)» on the next', async () => {
    const long = 'Tuvo fiebre por las noches y tos seca que aumenta al acostarse; come menos que de costumbre. '.repeat(40)
    const consultation: ExportConsultation = { ...CASE_A.data.consultations[0], notes: long }
    const data = { ...CASE_A.data, consultations: [consultation], vaccinations: [] }
    const { pages } = await pagesOf({ ...input(CASE_A), data })
    const first = pages.findIndex((text) => text.includes('Continúa en la página'))
    expect(first).toBeGreaterThan(0)
    expect(pages[first]).toContain(`Continúa en la página ${first + 2}`)
    expect(pages[first + 1]).toContain('18 oct 2026 · Dra. Laura Cázares (continuación)')
    expect(pages[first]).not.toContain('(continuación)')
  }, 120_000)
})
