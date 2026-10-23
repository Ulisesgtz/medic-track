import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Account, Child } from '../../home/types'
import { PARENT } from '../childText'
import { ChildAccessBlock } from './ChildAccessBlock'

const CHILD_ID = 'c1'
const child = (extra: Partial<Child> = {}): Child => ({ id: CHILD_ID, firstName: 'Mateo', lastName: 'G', birthDate: '2023-01-10', ...extra }) as Child
const account = (plan: string, children: Child[] = [child()]): Account =>
  ({ id: 'a1', firstName: 'Ana', lastName: 'G', email: 'a@x.com', plan, children, disclaimerVersion: 'x', disclaimerAccepted: true, reminderDetail: null }) as Account

type Reply = { status: number; body: unknown }

function stubApi(acc: Account, reply: Reply = { status: 201, body: { id: 'l1', name: 'Teléfono de Mateo', status: 'pending', token: 'TOKEN-SECRETO', expiresAt: '2026-10-23T14:00:00Z' } }) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      const method = init?.method ?? 'GET'
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (path === '/accounts/me') return { ok: true, status: 200, json: async () => acc } as Response
      return { ok: reply.status < 300, status: reply.status, json: async () => reply.body } as Response
    }),
  )
  return calls
}

function show() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route path="/x" element={<ChildAccessBlock childId={CHILD_ID} childName="Mateo" />} />
          <Route path="/planes" element={<p>pantalla de planes</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ChildAccessBlock', () => {
  it('makes the link: the name only in the body, the link shown once with the parent responsibility, copy as the one solid button', async () => {
    const user = userEvent.setup()
    const calls = stubApi(account('paid'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    show()

    expect(await screen.findByRole('heading', { name: PARENT.title })).toBeInTheDocument()
    expect(screen.getByText(PARENT.responsibility('Mateo'))).toBeInTheDocument()
    await user.type(screen.getByLabelText(PARENT.nameLabel), 'Teléfono de Mateo')
    await user.click(screen.getByRole('button', { name: PARENT.create }))

    const ready = await screen.findByRole('region', { name: PARENT.ready.eyebrow })
    const input = screen.getByLabelText(PARENT.ready.linkLabel) as HTMLInputElement
    expect(input.value).toBe(`${window.location.origin}/hijo#TOKEN-SECRETO`)
    expect(ready).toHaveTextContent('Teléfono de Mateo')
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.path).toBe(`/children/${CHILD_ID}/device-links`)
    expect(post?.path).not.toContain('Tel')
    expect(post?.body).toEqual({ name: 'Teléfono de Mateo' })

    await user.click(screen.getByRole('button', { name: PARENT.ready.copy }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/hijo#TOKEN-SECRETO`)
    expect(await screen.findByRole('button', { name: PARENT.ready.copied })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: PARENT.ready.done }))
    expect(screen.queryByLabelText(PARENT.ready.linkLabel)).not.toBeInTheDocument()
    expect(screen.getByLabelText(PARENT.nameLabel)).toHaveValue('')
  })

  it('says so, without losing the link, when the browser cannot copy', async () => {
    const user = userEvent.setup()
    stubApi(account('paid'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true })
    show()
    await user.type(await screen.findByLabelText(PARENT.nameLabel), 'Tablet')
    await user.click(screen.getByRole('button', { name: PARENT.create }))
    await screen.findByRole('region', { name: PARENT.ready.eyebrow })
    await user.click(screen.getByRole('button', { name: PARENT.ready.copy }))
    expect(screen.getByRole('button', { name: PARENT.ready.copy })).toBeInTheDocument()
    expect(screen.getByLabelText(PARENT.ready.linkLabel)).toBeInTheDocument()
  })

  it('shows the plan notice instead of the form on the free plan', async () => {
    stubApi(account('free'))
    show()
    expect(await screen.findByText(PARENT.plan.text)).toBeInTheDocument()
    expect(screen.queryByLabelText(PARENT.nameLabel)).not.toBeInTheDocument()
  })

  it('on the free plan keeps the list and Quitar of what was already given, with the notice instead of the form', async () => {
    const link = { id: 'l9', name: 'Teléfono de Mateo', status: 'active', createdAt: '2026-10-20T10:00:00Z', redeemedAt: '2026-10-20T10:05:00Z', lastSeenAt: null, expiresAt: '2026-10-21T10:00:00Z', reminderDetail: 'generic' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname
        const body = path === '/accounts/me' ? account('free') : { links: [link], limit: 3, canManage: true }
        return { ok: true, status: 200, json: async () => body } as Response
      }),
    )
    show()
    expect(await screen.findByText(PARENT.plan.text)).toBeInTheDocument()
    expect(await screen.findByText('Teléfono de Mateo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: PARENT.list.removeLabel('Teléfono de Mateo') })).toBeInTheDocument()
    expect(screen.queryByLabelText(PARENT.nameLabel)).not.toBeInTheDocument()
  })

  it('draws nothing for who cannot manage the child (a caregiver) or before the account loads', async () => {
    stubApi(account('paid', [child({ role: 'caregiver', plan: 'paid', readOnly: false })]))
    const { container } = show()
    expect(container).toBeEmptyDOMElement()
    await waitFor(() => expect(screen.queryByLabelText(PARENT.nameLabel)).not.toBeInTheDocument())
  })

  it('opens the plan pop-up if the server says the plan is not paid, keeping the form', async () => {
    const user = userEvent.setup()
    stubApi(account('paid'), { status: 422, body: { error: 'freemium_consultation_limit_exceeded', reason: 'child_device', message: 'x' } })
    show()
    await user.type(await screen.findByLabelText(PARENT.nameLabel), 'Tablet')
    await user.click(screen.getByRole('button', { name: PARENT.create }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Acceso del hijo')
    await user.click(screen.getByRole('link', { name: /Ver el plan completo/ }))
    expect(await screen.findByText('pantalla de planes')).toBeInTheDocument()
  })

  it.each([
    [400, { error: 'validation_error', message: 'x' }, PARENT.errors.name],
    [422, { error: 'child_device_limit_exceeded', message: 'x', limit: 3 }, PARENT.errors.limit(3)],
    [403, { error: 'forbidden', message: 'x' }, PARENT.errors.forbidden],
    [500, { error: 'internal_error', message: 'x' }, PARENT.errors.save],
  ])('answers %s with its own sentence and keeps what was typed', async (status, body, sentence) => {
    const user = userEvent.setup()
    stubApi(account('paid'), { status, body })
    show()
    await user.type(await screen.findByLabelText(PARENT.nameLabel), 'Tablet')
    await user.click(screen.getByRole('button', { name: PARENT.create }))
    expect(await screen.findByText(sentence)).toBeInTheDocument()
    expect(screen.getByLabelText(PARENT.nameLabel)).toHaveValue('Tablet')
  })

  it('does not send an empty name', async () => {
    stubApi(account('paid'))
    show()
    expect(await screen.findByRole('button', { name: PARENT.create })).toBeDisabled()
  })
})
