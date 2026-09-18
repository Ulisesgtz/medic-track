import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConsultationForm } from './ConsultationForm'

vi.mock('tesseract.js', () => ({
  default: { recognize: vi.fn().mockResolvedValue({ data: { text: '' } }) },
}))

function renderForm(onSuccess = vi.fn(), onCancel = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ConsultationForm childId="child-1" onSuccess={onSuccess} onCancel={onCancel} />
    </QueryClientProvider>,
  )
  return { onSuccess, onCancel }
}

function samplePhoto() {
  return new File(['fake-bytes'], 'receta.jpg', { type: 'image/jpeg' })
}

describe('ConsultationForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows validation errors and does not submit when required fields are empty', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn())
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El nombre del doctor es obligatorio')).toBeInTheDocument()
    expect(screen.getByText('La fecha es obligatoria')).toBeInTheDocument()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('adds and removes medication fieldsets', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.getByTestId('medication-fieldset-0')).toBeInTheDocument()
    expect(screen.queryByTestId('medication-fieldset-1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Agregar medicamento' }))
    expect(screen.getByTestId('medication-fieldset-1')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Quitar medicamento' })[1])
    expect(screen.queryByTestId('medication-fieldset-1')).not.toBeInTheDocument()
  })

  it('rejects submission without a photo (FR-004)', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn())
    renderForm()

    await user.type(screen.getByLabelText('Doctor'), 'Dra. López')
    await user.type(screen.getByLabelText('Fecha de la consulta'), '2026-01-15')
    await user.type(document.getElementById('medications.0.name')!, 'Amoxicilina')
    await user.type(document.getElementById('medications.0.frequencyHours')!, '8')
    await user.type(document.getElementById('medications.0.durationDays')!, '3')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('La foto de la receta es obligatoria')).toBeInTheDocument()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('submits successfully with a photo and one medication', async () => {
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

    await user.type(screen.getByLabelText('Doctor'), 'Dra. López')
    await user.type(screen.getByLabelText('Fecha de la consulta'), '2026-01-15')
    await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())
    await user.type(document.getElementById('medications.0.name')!, 'Amoxicilina')
    await user.type(document.getElementById('medications.0.frequencyHours')!, '8')
    await user.type(document.getElementById('medications.0.durationDays')!, '3')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('consultation-1'))
  })

  it('opens the native file picker when clicking "Seleccionar archivo"', async () => {
    const user = userEvent.setup()
    renderForm()
    const input = screen.getByLabelText('Foto de la receta') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    await user.click(screen.getByRole('button', { name: 'Seleccionar archivo' }))

    expect(clickSpy).toHaveBeenCalled()
  })

  it('cancels via the Cancelar button', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
  })

  it('autofills empty fields from OCR text as an editable suggestion (FR-006)', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: {
        text: 'Dra. Maria Lopez\nAmoxicilina 250mg\nTomar cada 8 horas\ndurante 5 dias\nFecha: 15/01/2026',
      },
    } as never)
    const user = userEvent.setup()
    renderForm()

    await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

    await waitFor(() => expect(screen.getByLabelText('Doctor')).toHaveValue('Maria Lopez'))
    expect(screen.getByLabelText('Fecha de la consulta')).toHaveValue('2026-01-15')
    expect(document.getElementById('medications.0.name')).toHaveValue('Amoxicilina')
    expect(document.getElementById('medications.0.frequencyHours')).toHaveValue(8)
    expect(document.getElementById('medications.0.durationDays')).toHaveValue(5)
  })

  it('never overwrites fields the parent already filled in (FR-006, Principio I)', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: {
        text: 'Dra. Maria Lopez\nAmoxicilina 250mg\nTomar cada 8 horas\ndurante 5 dias\nFecha: 15/01/2026',
      },
    } as never)
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Doctor'), 'Dr. Juan Pérez')
    await user.type(screen.getByLabelText('Fecha de la consulta'), '2026-02-01')
    await user.type(document.getElementById('medications.0.name')!, 'Paracetamol')
    await user.type(document.getElementById('medications.0.frequencyHours')!, '6')
    await user.type(document.getElementById('medications.0.durationDays')!, '3')
    await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())
    await waitFor(() => expect(screen.queryByText('Analizando la foto…')).not.toBeInTheDocument())

    expect(screen.getByLabelText('Doctor')).toHaveValue('Dr. Juan Pérez')
    expect(screen.getByLabelText('Fecha de la consulta')).toHaveValue('2026-02-01')
    expect(document.getElementById('medications.0.name')).toHaveValue('Paracetamol')
    expect(document.getElementById('medications.0.frequencyHours')).toHaveValue(6)
    expect(document.getElementById('medications.0.durationDays')).toHaveValue(3)
  })

  it('leaves fields untouched when OCR text has no recognizable prescription data (FR-006)', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: { text: 'texto ilegible sin datos reconocibles' },
    } as never)
    const user = userEvent.setup()
    renderForm()

    await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())
    await waitFor(() => expect(screen.queryByText('Analizando la foto…')).not.toBeInTheDocument())

    expect(screen.getByLabelText('Doctor')).toHaveValue('')
    expect(screen.getByLabelText('Fecha de la consulta')).toHaveValue('')
    expect(document.getElementById('medications.0.name')).toHaveValue('')
    expect(document.getElementById('medications.0.frequencyHours')).toHaveValue(null)
    expect(document.getElementById('medications.0.durationDays')).toHaveValue(null)
  })

  it('adds a fieldset per medication for a numbered prescription list (FR-006)', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: {
        text:
          'Dr. Erick Rojas\nColoproctología\nReceta Médica\nFecha: 04-02-2025\n' +
          'Médicamentos:\n' +
          '1. PARACETAMOL500 MG (TYLENOL)\nTomar 2 tableta cada 6-8 horas por 7 días.\n' +
          '2. TRAMADOL /KETOROLACO 25/10 MG (SINERGIX)\nTomar 1 tableta cada 6-8 horas por 7 días.\n' +
          '3. DEXKETOPROFENO25MG (STADIUM)\nTomar 1 tableta cada 12 horas por 7 días.\n',
      },
    } as never)
    const user = userEvent.setup()
    renderForm()

    await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

    // Wait on the last medication's own value rather than the progress
    // indicator disappearing — under parallel test-worker load the real
    // setTimeout stagger can lag behind a fixed-timeout proxy check.
    await waitFor(
      () => expect(document.getElementById('medications.2.name')).toHaveValue('DEXKETOPROFENO'),
      { timeout: 5000 },
    )
    expect(screen.queryByText(/Agregando medicamentos de la receta/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Doctor')).toHaveValue('Erick Rojas')
    expect(screen.getByLabelText('Fecha de la consulta')).toHaveValue('2025-02-04')
    expect(document.getElementById('medications.0.name')).toHaveValue('PARACETAMOL')
    expect(document.getElementById('medications.0.frequencyHours')).toHaveValue(6)
    expect(document.getElementById('medications.0.durationDays')).toHaveValue(7)
    expect(document.getElementById('medications.1.name')).toHaveValue('TRAMADOL /KETOROLACO')
    expect(document.getElementById('medications.1.frequencyHours')).toHaveValue(6)
    expect(document.getElementById('medications.2.frequencyHours')).toHaveValue(12)
  })

  it('shows visible progress while adding medications from a numbered list (FR-006)', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: {
        text:
          '1. PARACETAMOL 500MG\nTomar cada 8 horas por 7 días.\n' +
          '2. IBUPROFENO 400MG\nTomar cada 12 horas por 5 días.\n',
      },
    } as never)
    const user = userEvent.setup()
    renderForm()

    await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

    await waitFor(() => expect(screen.getByText('Agregando medicamentos de la receta… 1 de 2')).toBeInTheDocument())
    await waitFor(() => expect(document.getElementById('medications.1.name')).toHaveValue('IBUPROFENO'), {
      timeout: 5000,
    })
    expect(screen.queryByText(/Agregando medicamentos de la receta/)).not.toBeInTheDocument()
  })

  it('collapses a medication fieldset to a one-line summary and back (scannability)', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(document.getElementById('medications.0.name')!, 'Amoxicilina')
    await user.type(document.getElementById('medications.0.frequencyHours')!, '8')
    await user.type(document.getElementById('medications.0.durationDays')!, '5')

    await user.click(screen.getByRole('button', { name: /Medicamento 1/ }))

    expect(screen.getByText('Amoxicilina — cada 8h — 5 días')).toBeInTheDocument()
    expect(document.getElementById('medications.0.name')!.closest('.grid')).toHaveClass('hidden')

    await user.click(screen.getByRole('button', { name: /Medicamento 1/ }))

    expect(document.getElementById('medications.0.name')!.closest('.grid')).not.toHaveClass('hidden')
  })

  it('disables Agregar/Quitar medicamento while OCR is still filling the list (race prevention)', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: { text: '1. Med A 100mg\nTomar cada 8 horas por 5 dias.\n2. Med B 200mg\nTomar cada 12 horas por 5 dias.' },
    } as never)
    const user = userEvent.setup()
    renderForm()

    await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

    await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar medicamento' })).toBeDisabled())

    await waitFor(() => expect(document.getElementById('medications.1.name')).toHaveValue('Med B'), {
      timeout: 5000,
    })
    expect(screen.getByRole('button', { name: 'Agregar medicamento' })).toBeEnabled()
  })

  it('extracts every unlisted medication, not just the first (FR-006)', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: {
        text: 'Amoxicilina 500mg cada 8 horas por 7 dias\nParacetamol 500mg cada 6 horas por 3 dias',
      },
    } as never)
    const user = userEvent.setup()
    renderForm()

    await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

    await waitFor(() => expect(document.getElementById('medications.1.name')).toHaveValue('Paracetamol'), {
      timeout: 5000,
    })
    expect(document.getElementById('medications.0.name')).toHaveValue('Amoxicilina')
    expect(document.getElementById('medications.1.frequencyHours')).toHaveValue(6)
    expect(document.getElementById('medications.1.durationDays')).toHaveValue(3)
  })

  it('captures the medication name even when a descriptor word precedes the dosage (unlisted fallback)', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: { text: 'Amoxicilina suspensión 250mg cada 8 horas por 7 dias' },
    } as never)
    const user = userEvent.setup()
    renderForm()

    await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

    await waitFor(() => expect(document.getElementById('medications.0.name')).toHaveValue('Amoxicilina suspensión'))
  })

  it('stops a numbered medication name at "cada" when no dosage number follows it', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: { text: '1. Loratadina jarabe cada 12 horas por 5 dias' },
    } as never)
    const user = userEvent.setup()
    renderForm()

    await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

    await waitFor(() => expect(document.getElementById('medications.0.name')).toHaveValue('Loratadina jarabe'))
    expect(document.getElementById('medications.0.frequencyHours')).toHaveValue(12)
  })

  it('prefers a "Fecha:"-labeled date over an unrelated date-shaped number', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize).mockResolvedValue({
      data: { text: 'Cédula 01/01/1990\nFecha: 15/03/2026\nAmoxicilina 500mg cada 8 horas por 7 dias' },
    } as never)
    const user = userEvent.setup()
    renderForm()

    await user.upload(screen.getByLabelText('Foto de la receta'), samplePhoto())

    await waitFor(() => expect(screen.getByLabelText('Fecha de la consulta')).toHaveValue('2026-03-15'))
  })

  it('removes stray fieldsets left by a superseded OCR run when the photo is swapped mid-fill', async () => {
    const tesseract = await import('tesseract.js')
    vi.mocked(tesseract.default.recognize)
      .mockResolvedValueOnce({
        data: {
          text:
            '1. Med A 100mg\nTomar cada 8 horas por 5 dias.\n2. Med B 200mg\nTomar cada 12 horas por 5 dias.\n' +
            '3. Med C 300mg\nTomar cada 6 horas por 3 dias.',
        },
      } as never)
      .mockResolvedValueOnce({
        data: { text: '1. Med Z 50mg\nTomar cada 24 horas por 2 dias.' },
      } as never)
    const user = userEvent.setup()
    renderForm()

    const fileInput = screen.getByLabelText('Foto de la receta')
    await user.upload(fileInput, samplePhoto())
    // Wait for the first run to actually start appending before superseding
    // it, so the race this test targets (stray fieldsets left behind) is
    // reliably exercised rather than timing-dependent.
    await waitFor(() => expect(screen.getByTestId('medication-fieldset-1')).toBeInTheDocument())
    await user.upload(fileInput, samplePhoto())

    // The interrupted first run already filled medications.0 ("Med A") —
    // that value is a parent-facing autofill like any other and is never
    // overwritten (Principio I), so it's expected to remain. What must NOT
    // remain is the extra empty fieldset(s) the interrupted run appended.
    await waitFor(() => expect(screen.queryByText(/Agregando medicamentos de la receta/)).not.toBeInTheDocument(), {
      timeout: 5000,
    })
    expect(document.getElementById('medications.0.name')).toHaveValue('Med A')
    expect(screen.queryByTestId('medication-fieldset-1')).not.toBeInTheDocument()
  })

  it('gives each medication fieldset an accessible group name (Principio I review context)', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Agregar medicamento' }))

    expect(screen.getByRole('group', { name: 'Medicamento 1' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Medicamento 2' })).toBeInTheDocument()
  })

  it('describes the photo picker button with the "Foto de la receta" text via aria-describedby', () => {
    renderForm()

    const button = screen.getByRole('button', { name: 'Seleccionar archivo' })
    expect(button).toHaveAccessibleDescription('Foto de la receta')
  })
})
