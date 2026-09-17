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
})
