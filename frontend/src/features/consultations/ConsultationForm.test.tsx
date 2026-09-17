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

  it('cancels via the Cancelar button', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
  })
})
