import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Account, Child } from '../../home/types'
import { PARENT } from '../childText'
import { ChildAccessBlock } from './ChildAccessBlock'
import type { DeviceLink } from './parentApi'

const CHILD_ID = 'c1'
const child = (extra: Partial<Child> = {}): Child => ({ id: CHILD_ID, firstName: 'Mateo', lastName: 'G', birthDate: '2023-01-10', ...extra }) as Child
const account = (plan: string, children: Child[] = [child()]): Account =>
  ({ id: 'a1', firstName: 'Ana', lastName: 'G', email: 'a@x.com', plan, children, disclaimerVersion: 'x', disclaimerAccepted: true, reminderDetail: null }) as Account

const NOW = new Date()
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString()
const link = (extra: Partial<DeviceLink> = {}): DeviceLink => ({
  id: 'l1', name: 'Teléfono de Mateo', status: 'active', createdAt: iso(10), redeemedAt: iso(9), lastSeenAt: new Date().toISOString(), expiresAt: iso(9), reminderDetail: 'generic', ...extra,
})

function stubApi(acc: Account, links: DeviceLink[], canManage = true, failures: Record<string, number> = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      const method = init?.method ?? 'GET'
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const res = (status: number, body: unknown = {}) => ({ ok: status < 300, status, json: async () => body }) as Response
      if (failures[`${method} ${path}`]) return res(failures[`${method} ${path}`])
      if (path === '/accounts/me') return res(200, acc)
      if (method === 'GET' && path.endsWith('/device-links')) return res(200, { links, limit: 3, canManage })
      if (method === 'POST' && path.endsWith('/revoke')) return res(204)
      if (method === 'PATCH') return res(200, link({ reminderDetail: 'detailed' }))
      return res(200)
    }),
  )
  return calls
}

function show() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChildAccessBlock childId={CHILD_ID} childName="Mateo" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the phones of a child', () => {
  it('lists each phone with its state and when it was last used, without any judgement', async () => {
    stubApi(account('paid'), [
      link(),
      link({ id: 'l2', name: 'Tablet', status: 'pending', redeemedAt: null, lastSeenAt: null }),
      link({ id: 'l3', name: 'Vieja', status: 'expired', redeemedAt: null, lastSeenAt: null }),
      link({ id: 'l4', name: 'Quitada', status: 'revoked', lastSeenAt: iso(3) }),
      link({ id: 'l5', name: 'Nunca usada', lastSeenAt: null }),
    ])
    show()
    const list = await screen.findByRole('region', { name: PARENT.list.title('Mateo') })
    expect(within(list).getByText('Teléfono de Mateo')).toBeInTheDocument()
    expect(within(list).getAllByText(PARENT.list.status.active).length).toBeGreaterThan(0)
    expect(within(list).getByText(PARENT.list.status.pending)).toBeInTheDocument()
    expect(within(list).getByText(PARENT.list.status.expired)).toBeInTheDocument()
    expect(within(list).getByText(PARENT.list.status.revoked)).toBeInTheDocument()
    expect(within(list).getByText(/Última vez: hoy \d\d:\d\d/)).toBeInTheDocument()
    expect(within(list).getAllByText(/Sin usar todavía/).length).toBeGreaterThan(0)
    expect(within(list).getAllByText(/Última vez: \d\d \w{3}, \d\d:\d\d/).length).toBeGreaterThan(0)
    expect(within(list).getAllByText(/^Creada el/).length).toBe(2)
  })

  it('removes a phone after a neutral confirmation and refreshes the list', async () => {
    const user = userEvent.setup()
    const calls = stubApi(account('paid'), [link()])
    show()
    await user.click(await screen.findByRole('button', { name: PARENT.list.removeLabel('Teléfono de Mateo') }))
    const dialog = await screen.findByRole('dialog', { name: PARENT.list.confirm.title('Teléfono de Mateo') })
    expect(within(dialog).getByText(/ya no verá las tomas ni las actividades de Mateo/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Lo que ya marcó queda registrado con el nombre de Mateo/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: PARENT.list.confirm.confirm }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === `/children/${CHILD_ID}/device-links/l1/revoke`)).toBe(true))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls.filter((c) => c.method === 'GET' && c.path.endsWith('/device-links')).length).toBeGreaterThan(1)
  })

  it('keeps the phone and says so when removing fails, and Cancelar closes', async () => {
    const user = userEvent.setup()
    stubApi(account('paid'), [link()], true, { 'POST /children/c1/device-links/l1/revoke': 500 })
    show()
    await user.click(await screen.findByRole('button', { name: PARENT.list.removeLabel('Teléfono de Mateo') }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: PARENT.list.confirm.confirm }))
    expect(await within(dialog).findByText(PARENT.list.confirm.error)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: PARENT.list.confirm.cancel }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Teléfono de Mateo')).toBeInTheDocument()
  })

  it('chooses what the phone reminders say, sending only that choice', async () => {
    const user = userEvent.setup()
    const calls = stubApi(account('paid'), [link()])
    show()
    await user.selectOptions(await screen.findByLabelText(PARENT.list.reminderText), 'detailed')
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: `/children/${CHILD_ID}/device-links/l1`, body: { reminderDetail: 'detailed' } })
  })

  it('says so when the choice cannot be saved', async () => {
    const user = userEvent.setup()
    stubApi(account('paid'), [link()], true, { 'PATCH /children/c1/device-links/l1': 500 })
    show()
    await user.selectOptions(await screen.findByLabelText(PARENT.list.reminderText), 'detailed')
    expect(await screen.findByText(PARENT.list.saveError)).toBeInTheDocument()
  })

  it('offers no choice or removal for a phone that is already removed', async () => {
    stubApi(account('paid'), [link({ status: 'revoked' })])
    show()
    await screen.findByRole('region', { name: PARENT.list.title('Mateo') })
    expect(screen.queryByRole('button', { name: /^Quitar/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(PARENT.list.reminderText)).not.toBeInTheDocument()
  })

  it('lets the parent remove an expired phone (it no longer gets in) but not choose its reminder text', async () => {
    stubApi(account('paid'), [link({ id: 'l2', name: 'Vieja', status: 'expired' })])
    show()
    await screen.findByRole('region', { name: PARENT.list.title('Mateo') })
    expect(screen.getByRole('button', { name: PARENT.list.removeLabel('Vieja') })).toBeInTheDocument()
    expect(screen.queryByLabelText(PARENT.list.reminderText)).not.toBeInTheDocument()
  })

  it('shows a caregiver the list and nothing to change', async () => {
    stubApi(account('paid', [child({ role: 'caregiver', plan: 'paid', readOnly: false })]), [link()], false)
    show()
    const list = await screen.findByRole('region', { name: PARENT.list.title('Mateo') })
    expect(within(list).getByText('Teléfono de Mateo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Quitar/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(PARENT.nameLabel)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(PARENT.list.reminderText)).not.toBeInTheDocument()
  })

  it('on the free plan keeps the list and its removal, with the plan notice instead of the form', async () => {
    stubApi(account('free'), [link()])
    show()
    expect(await screen.findByText(PARENT.plan.text)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: PARENT.list.removeLabel('Teléfono de Mateo') })).toBeInTheDocument()
    expect(screen.queryByLabelText(PARENT.nameLabel)).not.toBeInTheDocument()
  })

  it('shows the form with the list below it for who can manage', async () => {
    stubApi(account('paid'), [link()])
    show()
    expect(await screen.findByLabelText(PARENT.nameLabel)).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: PARENT.list.title('Mateo') })).toBeInTheDocument()
  })
})
