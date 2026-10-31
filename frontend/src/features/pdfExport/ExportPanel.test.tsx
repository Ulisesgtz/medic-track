import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useRef } from 'react'
import { ExportEntry } from './ExportEntry'
import { ExportPanel, type ExportPanelProps } from './ExportPanel'
import type { ExportRequest } from './types'
import type { ExportState } from './useExport'

vi.mock('../../shared/catalog/useCatalog', () => ({
  useSymptoms: () => ({ data: [{ code: 'fever', name: 'Fiebre', category: 'General' }] }),
}))

const hook = {
  state: { status: 'options' } as ExportState,
  generate: vi.fn(),
  cancel: vi.fn(),
  back: vi.fn(),
  retry: vi.fn(),
  options: null as unknown,
}
vi.mock('./useExport', async (original) => ({
  ...(await original<typeof import('./useExport')>()),
  useExport: (options: unknown) => {
    hook.options = options
    return hook
  },
}))

const shareFile = vi.fn()
const downloadFile = vi.fn()
let sharable = true
vi.mock('./share', () => ({
  canShareFile: () => sharable,
  shareFile: (...args: unknown[]) => shareFile(...args),
  downloadFile: (...args: unknown[]) => downloadFile(...args),
}))

const child = { firstName: 'Mateo', lastName: 'Morales' }
const all: ExportRequest = { period: { kind: 'all' }, sections: { consultations: true, vaccinations: true, photos: false } }

function useWeb(web: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({ matches: web, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
}

function Harness(props: Partial<ExportPanelProps> & { onClose?: () => void }) {
  const opener = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={opener}>abrir</button>
      <ExportPanel childId="c1" child={child} free={false} onClose={props.onClose ?? vi.fn()} opener={opener} {...props} />
    </>
  )
}

const show = (props: Partial<ExportPanelProps> & { onClose?: () => void } = {}) =>
  render(
    <MemoryRouter>
      <Harness {...props} />
    </MemoryRouter>,
  )

const pdf = new File(['%PDF'.repeat(400)], 'Mateo-Morales-historial-24-oct-2026.pdf', { type: 'application/pdf' })
const ready = (request: ExportRequest = all): ExportState => ({ status: 'ready', file: pdf, pages: 5, size: 1.2 * 1024 * 1024, request })

beforeEach(() => {
  hook.state = { status: 'options' }
  for (const fn of [hook.generate, hook.cancel, hook.back, hook.retry, shareFile, downloadFile]) fn.mockReset()
  shareFile.mockResolvedValue(true)
  sharable = true
  useWeb(false)
})
afterEach(() => vi.unstubAllGlobals())

describe.each([
  ['phone', false],
  ['web', true],
])('ExportPanel (%s)', (_design, web) => {
  beforeEach(() => useWeb(web))

  it('is a dialog with the title, the child, the options and the privacy note; it generates everything by default', async () => {
    show({ filters: { doctor: 'Dra. Laura Cázares', symptomCodes: ['fever'] } })
    const dialog = screen.getByRole('dialog', { name: 'Exportar a PDF' })
    expect(within(dialog).getByText('Historial de Mateo Morales')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Todo el historial' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /Usar los filtros del historial.*Dra\. Laura Cázares · Fiebre/ })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Consultas' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Cartilla de vacunación' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Este PDF contiene datos de salud de Mateo. Compártelo solo con quien lo necesite.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Generar PDF' }))
    expect(hook.generate).toHaveBeenCalledWith(all)
    expect(hook.options).toMatchObject({ childId: 'c1', free: false, symptomNames: { fever: 'Fiebre' } })
  })

  it('without filters on, that choice isn’t offered; a range needs both days in order', async () => {
    show()
    expect(screen.queryByRole('radio', { name: /Usar los filtros/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Un rango de fechas' }))
    const generateButton = screen.getByRole('button', { name: 'Generar PDF' })
    expect(generateButton).toBeDisabled()
    const fromField = screen.getByLabelText('Desde')
    const toField = screen.getByLabelText('Hasta')
    await userEvent.type(fromField, '2026-09-30')
    await userEvent.type(toField, '2026-09-01')
    expect(screen.getByRole('alert')).toHaveTextContent('Corrige las fechas')
    expect(fromField).toHaveAttribute('aria-invalid', 'true')
    expect(generateButton).toBeDisabled()
    await userEvent.clear(toField)
    await userEvent.type(toField, '2026-10-24')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(generateButton)
    expect(hook.generate).toHaveBeenCalledWith({ ...all, period: { kind: 'range', from: '2026-09-30', to: '2026-10-24' } })
  })

  it('the history’s filters go as they are; with no section on it can’t generate', async () => {
    const filters = { doctor: 'Dra. Laura Cázares' }
    show({ filters })
    await userEvent.click(screen.getByRole('radio', { name: /Usar los filtros/ }))
    await userEvent.click(screen.getByRole('switch', { name: 'Cartilla de vacunación' }))
    await userEvent.click(screen.getByRole('button', { name: 'Generar PDF' }))
    expect(hook.generate).toHaveBeenCalledWith({ period: { kind: 'filters', filters }, sections: { consultations: true, vaccinations: false, photos: false } })
    await userEvent.click(screen.getByRole('switch', { name: 'Consultas' }))
    expect(screen.getByRole('switch', { name: 'Consultas' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Generar PDF' })).toBeDisabled()
  })

  it('the photos are off by default, say the file weighs more, and go in the request when on', async () => {
    show()
    const photos = screen.getByRole('switch', { name: 'Fotos de recetas y de la cartilla' })
    expect(photos).toHaveAttribute('aria-checked', 'false')
    expect(photos).toHaveAccessibleDescription('Con fotos, el archivo pesa más.')
    await userEvent.click(photos)
    await userEvent.click(screen.getByRole('button', { name: 'Generar PDF' }))
    expect(hook.generate).toHaveBeenCalledWith({ ...all, sections: { ...all.sections, photos: true } })
  })

  it('generating the photos says which one', () => {
    hook.state = { status: 'generating', stage: 'photos', photo: { done: 3, total: 7 } }
    show()
    expect(screen.getByText('Preparando fotos 3 de 7.')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
  })

  it('from the card, the card is on and the consultations off', () => {
    show({ origin: 'card' })
    expect(screen.getByRole('switch', { name: 'Consultas' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Cartilla de vacunación' })).toHaveAttribute('aria-checked', 'true')
  })

  it('generating: the stage, the progress and «Cancelar»', async () => {
    hook.state = { status: 'generating', stage: 'document' }
    show()
    expect(screen.getByText('Generando PDF…')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
    expect(screen.getByText('Armando el documento.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(hook.cancel).toHaveBeenCalled()
  })

  it('ready: the file, its pages, size and period, and the buttons of the design', async () => {
    hook.state = ready({ ...all, period: { kind: 'range', from: '2026-01-01', to: '2026-10-24' } })
    show()
    expect(screen.getByText('Tu PDF está listo')).toBeInTheDocument()
    expect(screen.getByText('Mateo-Morales-historial-24-oct-2026.pdf')).toBeInTheDocument()
    expect(screen.getByText('5 páginas · 1.2 MB · del 1 ene al 24 oct 2026')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: /^(Compartir|Descargar)$/ }).map((b) => b.textContent)
    expect(buttons).toEqual(web ? ['Descargar', 'Compartir'] : ['Compartir', 'Descargar'])
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }))
    expect(downloadFile).toHaveBeenCalledWith(pdf, pdf.name)
    await userEvent.click(screen.getByRole('button', { name: 'Compartir' }))
    expect(shareFile).toHaveBeenCalledWith(pdf, 'Historial de Mateo Morales')
  })

  it('ready without a share sheet: only «Descargar», solid', () => {
    sharable = false
    hook.state = ready()
    show()
    expect(screen.queryByRole('button', { name: 'Compartir' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar' })).toHaveClass('bg-confirmed')
    expect(screen.getByText('5 páginas · 1.2 MB · todo el historial')).toBeInTheDocument()
  })

  it('error: neutral, «Intentar de nuevo» and «Cerrar»', async () => {
    const onClose = vi.fn()
    hook.state = { status: 'error' }
    show({ onClose })
    expect(screen.getByText('No se pudo generar el PDF.')).toBeInTheDocument()
    expect(screen.getByText('Inténtalo de nuevo. Tus registros no cambiaron.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
    expect(hook.retry).toHaveBeenCalled()
    const closes = screen.getAllByRole('button', { name: 'Cerrar' })
    await userEvent.click(closes[closes.length - 1])
    expect(onClose).toHaveBeenCalled()
  })

  it('empty: says the period and the name; «Cambiar periodo» goes back', async () => {
    hook.state = { status: 'empty', request: { ...all, period: { kind: 'range', from: '2026-09-01', to: '2026-09-30' } } }
    show()
    expect(screen.getByText('No hay registros en este periodo')).toBeInTheDocument()
    expect(
      screen.getByText('Del 1 sep al 30 sep 2026 no hay consultas ni vacunas registradas de Mateo. Elige otro periodo para generar el PDF.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar periodo' }))
    expect(hook.back).toHaveBeenCalled()
  })

  it('plan: the compact plan notice and «Ahora no»', async () => {
    const onClose = vi.fn()
    hook.state = { status: 'plan' }
    show({ onClose, free: true })
    expect(screen.getByText('Exportar a PDF es parte del plan completo')).toBeInTheDocument()
    expect(
      screen.getByText('Genera un PDF con las consultas, tomas y cartilla de vacunación de Mateo para llevarlo al pediatra.'),
    ).toBeInTheDocument()
    expect(hook.options).toMatchObject({ free: true })
    await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ExportPanel as a dialog', () => {
  it('Escape and the backdrop close it; Tab stays inside; focus goes back to the opener', async () => {
    const onClose = vi.fn()
    const { unmount } = show({ onClose })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByText('Historial de Mateo Morales'))
    expect(onClose).toHaveBeenCalledTimes(2)

    const close = screen.getByRole('button', { name: 'Cerrar' })
    const generateButton = screen.getByRole('button', { name: 'Generar PDF' })
    generateButton.focus()
    await userEvent.tab()
    expect(close).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(generateButton).toHaveFocus()
    await userEvent.keyboard('a')
    unmount()
  })

  it('a new state takes the focus to its content', () => {
    const { rerender } = show()
    hook.state = { status: 'generating', stage: 'data' }
    rerender(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    )
    expect(screen.getByText('Preparando los datos.').closest('[tabindex="-1"]')).toHaveFocus()
  })
})

describe('ExportEntry', () => {
  it.each([
    ['phone', false],
    ['desktop', true],
  ] as const)('opens the panel and gives the focus back when it closes (%s)', async (variant, web) => {
    useWeb(web)
    render(
      <MemoryRouter>
        <ExportEntry variant={variant} childId="c1" child={child} free={false} />
      </MemoryRouter>,
    )
    const entry = screen.getByRole('button', { name: 'Exportar a PDF' })
    expect(entry).not.toHaveTextContent('Plan completo')
    await userEvent.click(entry)
    expect(screen.getByRole('dialog', { name: 'Exportar a PDF' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(entry).toHaveFocus()
  })

  it.each(['phone', 'desktop'] as const)('on the free plan it carries the mark and opens on the plan notice (%s)', async (variant) => {
    hook.state = { status: 'plan' }
    render(
      <MemoryRouter>
        <ExportEntry variant={variant} childId="c1" child={child} free />
      </MemoryRouter>,
    )
    const entry = screen.getByRole('button', { name: /Exportar a PDF/ })
    expect(entry).toHaveTextContent('Plan completo')
    expect(entry.className.includes('w-full')).toBe(variant === 'phone')
    await userEvent.click(entry)
    expect(hook.options).toMatchObject({ free: true })
  })
})
