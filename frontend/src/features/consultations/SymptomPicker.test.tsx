import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SymptomPicker } from './SymptomPicker'
import { SymptomChips } from './SymptomChips'

const catalog = [
  { code: 'fever', name: 'Fiebre', category: 'General' },
  { code: 'chills', name: 'Escalofríos', category: 'General' },
  { code: 'cough', name: 'Tos', category: 'Respiratorio' },
  { code: 'rash', name: 'Salpullido o ronchas', category: 'Piel' },
]

function stubCatalog(response: { ok: boolean; body?: unknown } | 'pending') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      response === 'pending'
        ? new Promise(() => {})
        : Promise.resolve({ ok: response.ok, status: response.ok ? 200 : 500, json: async () => response.body }),
    ),
  )
}

function Harness({ initial = [], onChange }: { initial?: string[]; onChange?: (codes: string[]) => void }) {
  const [value, setValue] = useState<string[]>(initial)
  return (
    <SymptomPicker
      value={value}
      onChange={(codes) => {
        setValue(codes)
        onChange?.(codes)
      }}
      variant="phone"
    />
  )
}

function renderPicker(props: { initial?: string[]; onChange?: (codes: string[]) => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>,
  )
}

describe('SymptomPicker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the catalog grouped by category, in order, with nothing selected', async () => {
    stubCatalog({ ok: true, body: catalog })
    renderPicker()

    const picker = screen.getByRole('group', { name: '¿Qué síntomas tuvo?' })
    const general = await within(picker).findByRole('group', { name: 'General' })
    expect(within(general).getAllByRole('button').map((b) => b.textContent)).toEqual(['Fiebre', 'Escalofríos'])
    expect(within(picker).getByRole('group', { name: 'Respiratorio' })).toHaveTextContent('Tos')
    const titles = within(picker)
      .getAllByRole('group')
      .map((g) => g.getAttribute('aria-labelledby'))
      .map((id) => document.getElementById(id!)!.textContent)
    expect(titles).toEqual(['General', 'Respiratorio', 'Piel'])
    for (const chip of within(picker).getAllByRole('button')) {
      expect(chip).toHaveAttribute('aria-pressed', 'false')
      expect(chip).toHaveClass('min-h-11', 'rounded-full')
    }
  })

  it('a tap selects a symptom and another tap unselects it; the name never changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    stubCatalog({ ok: true, body: catalog })
    renderPicker({ onChange })

    const tos = await screen.findByRole('button', { name: 'Tos' })
    await user.click(tos)
    expect(tos).toHaveAttribute('aria-pressed', 'true')
    expect(tos).toHaveAccessibleName('Tos')
    expect(tos).toHaveClass('bg-action', 'text-white')
    expect(tos.querySelector('svg')).toHaveAttribute('aria-hidden', 'true') // the check: not color alone
    await user.click(screen.getByRole('button', { name: 'Fiebre' }))
    expect(onChange).toHaveBeenLastCalledWith(['cough', 'fever'])

    await user.click(tos)
    expect(tos).toHaveAttribute('aria-pressed', 'false')
    expect(tos.querySelector('svg')).toBeNull()
    expect(onChange).toHaveBeenLastCalledWith(['fever'])
  })

  it('works with the keyboard', async () => {
    const user = userEvent.setup()
    stubCatalog({ ok: true, body: catalog })
    renderPicker({ initial: ['fever'] })

    expect(await screen.findByRole('button', { name: 'Fiebre' })).toHaveAttribute('aria-pressed', 'true')
    screen.getByRole('button', { name: 'Tos' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Tos' })).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Tos' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('says it is loading while the catalog arrives', () => {
    stubCatalog('pending')
    renderPicker()
    expect(screen.getByText('Cargando síntomas…')).toBeInTheDocument()
  })

  it('when the catalog cannot load, says so and points to the notes instead of blocking (FR-016)', async () => {
    stubCatalog({ ok: false })
    renderPicker()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'No pudimos cargar la lista de síntomas. Puedes guardar la consulta y escribirlos en las notas.',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('SymptomChips', () => {
  it('lists the symptoms as read-only pills, in the order given', () => {
    render(<SymptomChips symptoms={[catalog[0], catalog[2]]} />)

    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Fiebre', 'Tos'])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders nothing without symptoms', () => {
    const { container } = render(<SymptomChips symptoms={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
