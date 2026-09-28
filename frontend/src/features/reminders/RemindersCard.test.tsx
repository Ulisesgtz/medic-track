import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Account } from '../home/types'
import { RemindersCard } from './RemindersCard'
import { callsTo, clearPushEnv, stubApi, stubPushEnv } from './pushEnv.test-utils'

const account: Account = {
  id: 'a1',
  firstName: 'Ana',
  lastName: 'Gómez',
  email: 'ana@example.com',
  countryCode: null,
  stateCode: null,
  plan: 'free',
  children: [{ id: 'k1', firstName: 'Mateo', lastName: 'Gómez', birthDate: '2021-03-14', height: null, weight: null }],
  disclaimerVersion: '2026-09-26',
  disclaimerAccepted: true,
  reminderDetail: null,
}

const HELP = /son una ayuda, no una alarma garantizada/

function renderCard(value: Account | null = account) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['accounts', 'me'], value ?? undefined)
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RemindersCard account={value ?? undefined} />
    </QueryClientProvider>,
  )
  return { ...utils, queryClient }
}

function stubBackend(overrides: Record<string, { status?: number; body?: unknown }> = {}) {
  return stubApi({
    'GET /reminders/config': { body: { available: true, vapidPublicKey: 'AQID' } },
    'POST /accounts/a1/reminder-devices/remove': { status: 204 },
    'POST /accounts/a1/reminder-devices': { status: 201, body: { id: 'd1', active: true } },
    'PATCH /accounts/a1/reminder-settings': { body: { ...account, reminderDetail: 'generic' } },
    ...overrides,
  })
}

describe('RemindersCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearPushEnv()
  })

  it('renders nothing without an account', () => {
    const { container } = renderCard(null)
    expect(container).toBeEmptyDOMElement()
  })

  it('says a browser without notifications cannot receive reminders', () => {
    renderCard()
    expect(screen.getByText('Este navegador no puede recibir recordatorios.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activar recordatorios' })).not.toBeInTheDocument()
    expect(screen.getByText(HELP)).toBeInTheDocument()
  })

  it('explains how to allow notifications again when they were blocked', () => {
    stubPushEnv({ permission: 'denied' })
    renderCard()
    expect(screen.getByText(/Bloqueaste las notificaciones de PediTrack/)).toBeInTheDocument()
  })

  it('on an iPhone outside the installed app, explains how to install it instead of a button', () => {
    stubPushEnv()
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })
    try {
      renderCard()
      expect(screen.getByText(/Agregar a inicio/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Activar recordatorios' })).not.toBeInTheDocument()
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'jsdom' })
    }
  })

  it('says reminders are not available when the server has no keys, or its config fails', async () => {
    stubPushEnv()
    stubBackend({ 'GET /reminders/config': { body: { available: false, vapidPublicKey: null } } })
    const { unmount } = renderCard()
    expect(await screen.findByText('Los recordatorios no están disponibles por ahora.')).toBeInTheDocument()
    unmount()

    stubBackend({ 'GET /reminders/config': { status: 500 } })
    renderCard()
    expect(await screen.findByText('Los recordatorios no están disponibles por ahora.')).toBeInTheDocument()
  })

  it('never asks for the permission just by showing up (FR-002)', async () => {
    const env = stubPushEnv()
    stubBackend()
    renderCard()
    expect(await screen.findByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument()
    expect(env.requestPermission).not.toHaveBeenCalled()
    expect(screen.getByText(HELP)).toBeInTheDocument()
  })

  it('first activation: chooses what reminders show, then asks for the permission, subscribes and registers', async () => {
    const env = stubPushEnv()
    const fetchMock = stubBackend()
    const { queryClient } = renderCard()

    await userEvent.click(await screen.findByRole('button', { name: 'Activar recordatorios' }))
    const dialog = screen.getByRole('dialog', { name: '¿Qué muestran los avisos?' })
    expect(within(dialog).getByText('Amoxicilina · 08:00 · Mateo')).toBeInTheDocument()
    expect(env.requestPermission).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: /Texto genérico/ }))

    expect(await screen.findByText('Activos en este dispositivo.')).toBeInTheDocument()
    expect(env.requestPermission).toHaveBeenCalledOnce()
    expect(env.pushManager.subscribe).toHaveBeenCalledOnce()
    expect(callsTo(fetchMock, 'POST', '/reminder-devices')).toHaveLength(1)
    const [, patch] = callsTo(fetchMock, 'PATCH', '/reminder-settings')[0]
    expect(JSON.parse(patch.body)).toEqual({ reminderDetail: 'generic' })
    expect(queryClient.getQueryData<Account>(['accounts', 'me'])?.reminderDetail).toBe('generic')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancelling the choice turns nothing on', async () => {
    const env = stubPushEnv()
    stubBackend()
    renderCard()
    await userEvent.click(await screen.findByRole('button', { name: 'Activar recordatorios' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(env.requestPermission).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument()
  })

  it('an account that already chose goes straight to the permission', async () => {
    const env = stubPushEnv()
    const fetchMock = stubBackend()
    renderCard({ ...account, reminderDetail: 'detailed' })

    await userEvent.click(await screen.findByRole('button', { name: 'Activar recordatorios' }))

    expect(await screen.findByText('Activos en este dispositivo.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(env.requestPermission).toHaveBeenCalledOnce()
    expect(callsTo(fetchMock, 'PATCH', '/reminder-settings')).toHaveLength(0)
    expect(screen.getByText('el detalle de la toma')).toBeInTheDocument()
  })

  it('a refused permission shows how to allow it again; a dismissed one stays off', async () => {
    stubPushEnv({ requestResult: 'denied' })
    stubBackend()
    const { unmount } = renderCard({ ...account, reminderDetail: 'generic' })
    await userEvent.click(await screen.findByRole('button', { name: 'Activar recordatorios' }))
    expect(await screen.findByText(/Bloqueaste las notificaciones/)).toBeInTheDocument()
    unmount()

    const env = stubPushEnv({ requestResult: 'default' })
    stubBackend()
    renderCard({ ...account, reminderDetail: 'generic' })
    await userEvent.click(await screen.findByRole('button', { name: 'Activar recordatorios' }))
    await waitFor(() => expect(env.requestPermission).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument()
    expect(env.pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('says so when the device could not be registered, and leaves no subscription behind', async () => {
    const env = stubPushEnv()
    stubBackend({ 'POST /accounts/a1/reminder-devices': { status: 500 } })
    renderCard({ ...account, reminderDetail: 'generic' })
    await userEvent.click(await screen.findByRole('button', { name: 'Activar recordatorios' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos activar los recordatorios')
    expect(env.subscription.unsubscribe).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument()
  })

  it('first activation saves the choice before registering the device; if saving fails nothing is registered', async () => {
    const env = stubPushEnv()
    const fetchMock = stubBackend({ 'PATCH /accounts/a1/reminder-settings': { status: 500 } })
    renderCard()
    await userEvent.click(await screen.findByRole('button', { name: 'Activar recordatorios' }))
    await userEvent.click(screen.getByRole('button', { name: /Texto genérico/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos activar los recordatorios')
    expect(callsTo(fetchMock, 'PATCH', '/reminder-settings')).toHaveLength(1)
    expect(callsTo(fetchMock, 'POST', '/reminder-devices')).toHaveLength(0)
    expect(env.subscription.unsubscribe).toHaveBeenCalled()
  })

  it('a subscription already in this browser is registered again for the account that is signed in', async () => {
    stubPushEnv({ permission: 'granted', subscribed: true })
    const fetchMock = stubBackend()
    renderCard({ ...account, reminderDetail: 'generic' })

    expect(await screen.findByText('Activos en este dispositivo.')).toBeInTheDocument()
    const posts = callsTo(fetchMock, 'POST', '/accounts/a1/reminder-devices')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0][1].body).endpoint).toBeTruthy()
  })

  it('shows off when the subscription already in this browser cannot be registered for this account', async () => {
    stubPushEnv({ permission: 'granted', subscribed: true })
    stubBackend({ 'POST /accounts/a1/reminder-devices': { status: 500 } })
    renderCard({ ...account, reminderDetail: 'generic' })
    expect(await screen.findByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument()
  })

  it('when on: change what they show, and turn them off', async () => {
    const env = stubPushEnv({ permission: 'granted', subscribed: true })
    const fetchMock = stubBackend({ 'PATCH /accounts/a1/reminder-settings': { body: { ...account, reminderDetail: 'detailed' } } })
    renderCard({ ...account, reminderDetail: 'generic' })

    expect(await screen.findByText('Activos en este dispositivo.')).toBeInTheDocument()
    expect(screen.getByText('un texto genérico')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /Texto genérico/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(dialog).getByRole('button', { name: /Mostrar detalle/ }))
    await waitFor(() => expect(callsTo(fetchMock, 'PATCH', '/reminder-settings')).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar recordatorios' }))
    expect(await screen.findByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument()
    expect(env.subscription.unsubscribe).toHaveBeenCalled()
    expect(callsTo(fetchMock, 'POST', '/remove')).toHaveLength(1)
  })

  it('says so when turning off or changing fails', async () => {
    stubPushEnv({ permission: 'granted', subscribed: true })
    stubBackend({
      'POST /accounts/a1/reminder-devices/remove': { status: 500 },
      'PATCH /accounts/a1/reminder-settings': { status: 500 },
    })
    renderCard({ ...account, reminderDetail: 'generic' })

    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar recordatorios' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos desactivar los recordatorios')

    await userEvent.click(screen.getByRole('button', { name: 'Cambiar' }))
    await userEvent.click(screen.getByRole('button', { name: /Mostrar detalle/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar el cambio')
  })

  it('a device whose subscription check fails shows as off', async () => {
    const env = stubPushEnv()
    env.pushManager.getSubscription.mockRejectedValue(new Error('broken'))
    stubBackend()
    renderCard()
    expect(await screen.findByRole('button', { name: 'Activar recordatorios' })).toBeInTheDocument()
  })

  it('uses "tu hijo" in the example when the account has no children', async () => {
    stubPushEnv()
    stubBackend()
    renderCard({ ...account, children: [] })
    await userEvent.click(await screen.findByRole('button', { name: 'Activar recordatorios' }))
    expect(screen.getByText('Amoxicilina · 08:00 · tu hijo')).toBeInTheDocument()
  })
})
