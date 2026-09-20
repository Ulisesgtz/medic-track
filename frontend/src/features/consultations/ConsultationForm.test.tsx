import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConsultationForm } from './ConsultationForm'

vi.mock('tesseract.js', () => ({
  default: { recognize: vi.fn().mockResolvedValue({ data: { text: '' } }) },
}))

type Variant = 'phone' | 'desktop'

function renderForm(variant: Variant = 'phone', extra: Partial<Parameters<typeof ConsultationForm>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSuccess = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/nueva']}>
        <Routes>
          <Route
            path="/nueva"
            element={
              <ConsultationForm
                childId="child-1"
                variant={variant}
                cancelTo="/hijo"
                onSuccess={onSuccess}
                {...extra}
              />
            }
          />
          <Route path="/hijo" element={<p>DETALLE DEL HIJO</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onSuccess }
}

function samplePhoto() {
  return new File(['fake-bytes'], 'receta.jpg', { type: 'image/jpeg' })
}

const byId = (id: string) => document.getElementById(id) as HTMLInputElement

async function recognizeAs(text: string) {
  const tesseract = await import('tesseract.js')
  vi.mocked(tesseract.default.recognize).mockResolvedValue({ data: { text } } as never)
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Doctor'), 'Dra. López')
  await user.type(screen.getByLabelText('Fecha'), '2026-01-15')
  await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())
  await user.type(byId('medications.0.name'), 'Amoxicilina 250 mg')
  await user.type(byId('medications.0.frequencyHours'), 'c/8 h')
  await user.type(byId('medications.0.durationDays'), '7 días')
}

describe('ConsultationForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('layouts', () => {
    it('phone (mock 04): dark header with "← Cancelar", the OCR panel, and placeholders instead of labels for the schedule', () => {
      renderForm('phone')

      expect(screen.getByRole('heading', { level: 1, name: 'Nueva consulta' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '← Cancelar' })).toHaveAttribute('href', '/hijo')
      expect(screen.getByText('El procesamiento ocurre en tu teléfono. La foto no sale del dispositivo.')).toBeInTheDocument()
      expect(screen.getByText('Sugerido por OCR · revisa y confirma')).toBeInTheDocument()
      expect(byId('medications.0.name')).toHaveAttribute('placeholder', 'Nombre y dosis')
      expect(byId('medications.0.frequencyHours')).toHaveAttribute('placeholder', 'c/8 h')
      expect(byId('medications.0.durationDays')).toHaveAttribute('placeholder', '7 días')
      expect(screen.getByRole('button', { name: '+ Otro medicamento' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Guardar consulta' })).toBeInTheDocument()
      expect(screen.getByText('Desde (opcional)')).toBeInTheDocument()
      expect(screen.queryByText(/^Para /)).not.toBeInTheDocument()
    })

    it('web (mock 14): title with "Para <hijo>", the OCR panel outside the header and visible schedule labels', () => {
      renderForm('desktop', { childLabel: 'Mateo Morales · 5 años 6 meses' })

      expect(screen.getByText('Para Mateo Morales · 5 años 6 meses')).toBeInTheDocument()
      expect(screen.getByText('El procesamiento ocurre en tu equipo. La foto no se envía a ningún servidor.')).toBeInTheDocument()
      expect(byId('medications.0.name')).toHaveAttribute('placeholder', 'Amoxicilina 250 mg')
      for (const text of ['Nombre y dosis', 'Frecuencia', 'Duración', 'Desde (opcional)']) {
        expect(screen.getByText(text)).toBeInTheDocument()
      }
    })
  })

  describe('validation and saving', () => {
    it('shows validation errors and "Completa los campos faltantes." when required fields are empty', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

      expect(await screen.findByText('El nombre del doctor es obligatorio')).toBeInTheDocument()
      expect(screen.getByText('La fecha es obligatoria')).toBeInTheDocument()
      expect(screen.getByText('Escribe el nombre del medicamento.')).toBeInTheDocument()
      expect(screen.getByText('Escribe cada cuántas horas (ej. 8).')).toBeInTheDocument()
      expect(screen.getByText('Escribe cuántos días (ej. 7).')).toBeInTheDocument()
      expect(screen.getByText('La foto de la receta es obligatoria')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Completa los campos faltantes.')
    })

    it('rejects submission without a photo (FR-004), telling so in the OCR panel', async () => {
      const user = userEvent.setup()
      vi.stubGlobal('fetch', vi.fn())
      renderForm()

      await user.type(screen.getByLabelText('Doctor'), 'Dra. López')
      await user.type(screen.getByLabelText('Fecha'), '2026-01-15')
      await user.type(byId('medications.0.name'), 'Amoxicilina')
      await user.type(byId('medications.0.frequencyHours'), '8')
      await user.type(byId('medications.0.durationDays'), '7')
      await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

      expect(await screen.findByText('La foto de la receta es obligatoria')).toBeInTheDocument()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('rejects a frequency or duration with no number in it', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.type(byId('medications.0.frequencyHours'), 'cada rato')
      await user.type(byId('medications.0.durationDays'), '0 días')
      await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

      expect(await screen.findByText('Escribe cada cuántas horas (ej. 8).')).toBeInTheDocument()
      expect(screen.getByText('Escribe cuántos días (ej. 7).')).toBeInTheDocument()
    })

    it('submits the numbers found in the free text, the start time and the parent\'s UTC offset', async () => {
      const user = userEvent.setup()
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'consultation-1', childId: 'child-1', doctorName: 'Dra. López', consultDate: '2026-01-15',
            photoBase64: 'Zm9v', symptoms: '', medications: [],
          }),
        }),
      )
      const { onSuccess } = renderForm()

      await fillValid(user)
      await user.type(byId('medications.0.startTime'), '0800')
      await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

      await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('consultation-1'))
      const [, init] = vi.mocked(fetch).mock.calls[0]
      const body = JSON.parse(init!.body as string)
      expect(body.medications).toEqual([
        { name: 'Amoxicilina 250 mg', frequencyHours: 8, durationDays: 7, startTime: '08:00' },
      ])
      // The parent's UTC offset goes along, so start times are read in their own zone.
      // `|| 0`: in a UTC environment the offset is -0, and JSON turns it into +0.
      expect(body.utcOffsetMinutes).toBe(-new Date('2026-01-15T00:00:00').getTimezoneOffset() || 0)
    })

    it('shows the server error in the status line and keeps the data', async () => {
      const user = userEvent.setup()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'Server exploded' }) }))
      renderForm()

      await fillValid(user)
      await user.click(screen.getByRole('button', { name: 'Guardar consulta' }))

      expect(await screen.findByText('Server exploded')).toBeInTheDocument()
      expect(screen.getByLabelText('Doctor')).toHaveValue('Dra. López')
    })
  })

  describe('medications', () => {
    it('adds and removes medication cards; "Quitar" only shows with more than one', async () => {
      const user = userEvent.setup()
      renderForm()

      expect(screen.queryByRole('button', { name: 'Quitar medicamento' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '+ Otro medicamento' }))
      expect(screen.getByTestId('medication-fieldset-1')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Quitar medicamento' })).toHaveLength(2)

      await user.click(screen.getAllByRole('button', { name: 'Quitar medicamento' })[1])

      expect(screen.queryByTestId('medication-fieldset-1')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Quitar medicamento' })).not.toBeInTheDocument()
    })

    it('gives each medication card an accessible group name', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getByRole('button', { name: '+ Otro medicamento' }))

      expect(screen.getByRole('group', { name: 'Medicamento 1' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Medicamento 2' })).toBeInTheDocument()
    })
  })

  describe('photo and OCR panel', () => {
    it('starts as a chooser: "Foto de la receta" and a "Seleccionar archivo" button that opens the picker', async () => {
      const user = userEvent.setup()
      renderForm()
      const input = screen.getByLabelText('Foto de la receta') as HTMLInputElement
      const clickSpy = vi.spyOn(input, 'click')

      const button = screen.getByRole('button', { name: 'Seleccionar archivo' })
      expect(button).toHaveAccessibleDescription('Foto de la receta')
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
      await user.click(button)

      expect(clickSpy).toHaveBeenCalled()
    })

    it('turns into "Leyendo receta" with the progress bar once a photo is chosen, and "Listo" when done', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

      expect(screen.getByText('Leyendo receta')).toBeInTheDocument()
      expect(screen.getByText('receta.jpg')).toBeInTheDocument()
      expect(screen.getByRole('progressbar', { name: 'Progreso de lectura de la receta' })).toBeInTheDocument()
      expect(await screen.findByText('Listo')).toBeInTheDocument()
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    })

    it('autofills empty fields from OCR text as an editable suggestion (FR-006)', async () => {
      await recognizeAs('Dra. Maria Lopez\nAmoxicilina 250mg\nTomar cada 8 horas\ndurante 5 dias\nFecha: 15/01/2026')
      const user = userEvent.setup()
      renderForm()

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

      await waitFor(() => expect(screen.getByLabelText('Doctor')).toHaveValue('Maria Lopez'))
      expect(screen.getByLabelText('Fecha')).toHaveValue('2026-01-15')
      expect(byId('medications.0.name')).toHaveValue('Amoxicilina')
      expect(byId('medications.0.frequencyHours')).toHaveValue('c/8 h')
      expect(byId('medications.0.durationDays')).toHaveValue('5 días')
      // Medication fields the OCR filled carry the bright "to review" border; the symptoms box doesn't.
      expect(byId('medications.0.name')).toHaveClass('border-bright')
      expect(byId('symptoms')).not.toHaveClass('border-bright')
    })

    it('never overwrites fields the parent already filled in (FR-006, Principio I)', async () => {
      await recognizeAs('Dra. Maria Lopez\nAmoxicilina 250mg\nTomar cada 8 horas\ndurante 5 dias\nFecha: 15/01/2026')
      const user = userEvent.setup()
      renderForm()

      await user.type(screen.getByLabelText('Doctor'), 'Dr. Juan Pérez')
      await user.type(screen.getByLabelText('Fecha'), '2026-02-01')
      await user.type(byId('medications.0.name'), 'Paracetamol')
      await user.type(byId('medications.0.frequencyHours'), '6')
      await user.type(byId('medications.0.durationDays'), '3')
      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())
      await screen.findByText('Listo')

      expect(screen.getByLabelText('Doctor')).toHaveValue('Dr. Juan Pérez')
      expect(screen.getByLabelText('Fecha')).toHaveValue('2026-02-01')
      expect(byId('medications.0.name')).toHaveValue('Paracetamol')
      expect(byId('medications.0.frequencyHours')).toHaveValue('6')
      expect(byId('medications.0.durationDays')).toHaveValue('3')
    })

    it('leaves fields untouched when OCR text has no recognizable prescription data (FR-006)', async () => {
      await recognizeAs('texto ilegible sin datos reconocibles')
      const user = userEvent.setup()
      renderForm()

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())
      await screen.findByText('Listo')

      expect(screen.getByLabelText('Doctor')).toHaveValue('')
      expect(screen.getByLabelText('Fecha')).toHaveValue('')
      expect(byId('medications.0.name')).toHaveValue('')
      expect(byId('medications.0.frequencyHours')).toHaveValue('')
    })

    it('adds a card per medication for a numbered prescription list (FR-006)', async () => {
      await recognizeAs(
        'Dr. Erick Rojas\nColoproctología\nReceta Médica\nFecha: 04-02-2025\n' +
          'Médicamentos:\n' +
          '1. PARACETAMOL500 MG (TYLENOL)\nTomar 2 tableta cada 6-8 horas por 7 días.\n' +
          '2. TRAMADOL /KETOROLACO 25/10 MG (SINERGIX)\nTomar 1 tableta cada 6-8 horas por 7 días.\n' +
          '3. DEXKETOPROFENO25MG (STADIUM)\nTomar 1 tableta cada 12 horas por 7 días.\n',
      )
      const user = userEvent.setup()
      renderForm()

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

      // Wait on the last medication's own value rather than the progress
      // indicator: under parallel test-worker load the real stagger can lag.
      await waitFor(() => expect(byId('medications.2.name')).toHaveValue('DEXKETOPROFENO'), { timeout: 5000 })
      expect(screen.getByLabelText('Doctor')).toHaveValue('Erick Rojas')
      expect(screen.getByLabelText('Fecha')).toHaveValue('2025-02-04')
      expect(byId('medications.0.name')).toHaveValue('PARACETAMOL')
      expect(byId('medications.0.frequencyHours')).toHaveValue('c/6 h')
      expect(byId('medications.0.durationDays')).toHaveValue('7 días')
      expect(byId('medications.1.name')).toHaveValue('TRAMADOL /KETOROLACO')
      expect(byId('medications.2.frequencyHours')).toHaveValue('c/12 h')
    })

    it('shows visible progress while adding medications from a numbered list (FR-006)', async () => {
      await recognizeAs(
        '1. Med A 100mg\nTomar cada 8 horas por 5 dias.\n2. Med B 200mg\nTomar cada 12 horas por 5 dias.\n' +
          '3. Med C 300mg\nTomar cada 6 horas por 3 dias.',
      )
      const user = userEvent.setup()
      renderForm()

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

      expect(await screen.findByText(/Agregando medicamentos de la receta… \d de 3/)).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByText(/Agregando medicamentos de la receta/)).not.toBeInTheDocument(), {
        timeout: 5000,
      })
      expect(screen.getByText('Listo')).toBeInTheDocument()
    })

    it('disables "+ Otro medicamento" and "Quitar" while OCR is still filling the list (race prevention)', async () => {
      await recognizeAs('1. Med A 100mg\nTomar cada 8 horas por 5 dias.\n2. Med B 200mg\nTomar cada 12 horas por 5 dias.')
      const user = userEvent.setup()
      renderForm()

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())
      await screen.findByText(/Agregando medicamentos de la receta/)

      expect(screen.getByRole('button', { name: '+ Otro medicamento' })).toBeDisabled()
      await waitFor(() => expect(screen.queryByText(/Agregando medicamentos de la receta/)).not.toBeInTheDocument(), {
        timeout: 5000,
      })
      expect(screen.getByRole('button', { name: '+ Otro medicamento' })).toBeEnabled()
    })

    it('keeps the OCR-suggestion border on the right row after removing a medication', async () => {
      await recognizeAs(
        'Médicamentos:\n' +
          '1. PARACETAMOL500 MG (TYLENOL)\nTomar 2 tableta cada 6-8 horas por 7 días.\n' +
          '2. DEXKETOPROFENO25MG (STADIUM)\nTomar 1 tableta cada 12 horas por 7 días.\n',
      )
      const user = userEvent.setup()
      renderForm()

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())
      await waitFor(() => expect(byId('medications.1.name')).toHaveValue('DEXKETOPROFENO'), { timeout: 5000 })
      await waitFor(() => expect(screen.queryByText(/Agregando medicamentos de la receta/)).not.toBeInTheDocument())

      await user.click(screen.getAllByRole('button', { name: 'Quitar medicamento' })[0])

      // The former second medication is now first and keeps the suggestion border...
      expect(byId('medications.0.name')).toHaveValue('DEXKETOPROFENO')
      expect(byId('medications.0.name')).toHaveClass('border-bright')
      // ...and a medication the parent adds afterwards does not inherit it.
      await user.click(screen.getByRole('button', { name: '+ Otro medicamento' }))
      expect(byId('medications.1.name')).not.toHaveClass('border-bright')
    })

    it('removes stray cards left by a superseded OCR run when the photo is swapped mid-fill', async () => {
      const tesseract = await import('tesseract.js')
      vi.mocked(tesseract.default.recognize)
        .mockResolvedValueOnce({
          data: {
            text:
              '1. Med A 100mg\nTomar cada 8 horas por 5 dias.\n2. Med B 200mg\nTomar cada 12 horas por 5 dias.\n' +
              '3. Med C 300mg\nTomar cada 6 horas por 3 dias.',
          },
        } as never)
        .mockResolvedValueOnce({ data: { text: '1. Med Z 50mg\nTomar cada 24 horas por 2 dias.' } } as never)
      const user = userEvent.setup()
      renderForm()

      const fileInput = screen.getByLabelText('Foto de la receta')
      await user.upload(fileInput, samplePhoto())
      // Wait for the first run to actually start appending before superseding it.
      await waitFor(() => expect(screen.getByTestId('medication-fieldset-1')).toBeInTheDocument())
      await user.upload(fileInput, samplePhoto())

      // The interrupted first run already filled medications.0 ("Med A") — that
      // autofill is never overwritten (Principio I). What must NOT remain is the
      // extra empty card(s) the interrupted run appended.
      await waitFor(() => expect(screen.queryByText(/Agregando medicamentos de la receta/)).not.toBeInTheDocument(), {
        timeout: 5000,
      })
      expect(byId('medications.0.name')).toHaveValue('Med A')
      expect(screen.queryByTestId('medication-fieldset-1')).not.toBeInTheDocument()
    })

    it('captures the medication name even when a descriptor word precedes the dosage (unlisted fallback)', async () => {
      await recognizeAs('Amoxicilina suspensión 250mg cada 8 horas por 5 dias')
      const user = userEvent.setup()
      renderForm()

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

      await waitFor(() => expect(byId('medications.0.name')).toHaveValue('Amoxicilina suspensión'))
    })

    it('stops a numbered medication name at "cada" when no dosage number follows it', async () => {
      await recognizeAs('1. Loratadina jarabe cada 12 horas por 5 dias')
      const user = userEvent.setup()
      renderForm()

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

      await waitFor(() => expect(byId('medications.0.name')).toHaveValue('Loratadina jarabe'))
      expect(byId('medications.0.frequencyHours')).toHaveValue('c/12 h')
    })

    it('extracts every unlisted medication, not just the first (FR-006)', async () => {
      await recognizeAs('Amoxicilina 250mg cada 8 horas por 5 dias\nParacetamol 500mg cada 6 horas por 3 dias')
      const user = userEvent.setup()
      renderForm()

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

      await waitFor(() => expect(byId('medications.1.name')).toHaveValue('Paracetamol'), { timeout: 5000 })
      expect(byId('medications.0.name')).toHaveValue('Amoxicilina')
    })

    it('prefers a "Fecha:"-labeled date over an unrelated date-shaped number', async () => {
      await recognizeAs('Cédula 01/01/1990\nFecha: 15/03/2026\nAmoxicilina 500mg cada 8 horas por 7 dias')
      const user = userEvent.setup()
      renderForm()

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

      await waitFor(() => expect(screen.getByLabelText('Fecha')).toHaveValue('2026-03-15'))
    })
  })

  describe('leaving', () => {
    it('"← Cancelar" goes back to the child\'s detail', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getByRole('link', { name: '← Cancelar' }))

      expect(screen.getByText('DETALLE DEL HIJO')).toBeInTheDocument()
    })

    it('stays on the form when the parent refuses to discard what they captured', async () => {
      const user = userEvent.setup()
      renderForm('phone', { confirmLeave: () => false })

      await user.click(screen.getByRole('link', { name: '← Cancelar' }))

      expect(screen.queryByText('DETALLE DEL HIJO')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Nueva consulta' })).toBeInTheDocument()
    })

    it('reports whether it holds anything the parent would lose: typed fields or a photo', async () => {
      const user = userEvent.setup()
      const onDirtyChange = vi.fn()
      renderForm('phone', { onDirtyChange })
      expect(onDirtyChange).toHaveBeenLastCalledWith(false)

      await user.type(screen.getByLabelText('Doctor'), 'D')
      expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    })

    it('counts a chosen photo as dirty even with no typed field', async () => {
      const user = userEvent.setup()
      const onDirtyChange = vi.fn()
      renderForm('phone', { onDirtyChange })

      await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

      expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    })
  })

  it('exposes the symptoms box inside the OCR-suggestion group', () => {
    renderForm('desktop')

    const group = screen.getByText('Sugerido por OCR · revisa y confirma').closest('fieldset')!
    expect(within(group).getByLabelText('Síntomas')).toBeInTheDocument()
  })
})
