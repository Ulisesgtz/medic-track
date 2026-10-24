import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearPushEnv, ENDPOINT, stubPushEnv } from '../../reminders/pushEnv.test-utils'
import { PHONE } from '../childText'
import { RemindersCard } from './RemindersCard'

const text = PHONE.reminders

function stubApi(routes: { config?: unknown; register?: number; remove?: number } = {}) {
  const calls: { method: string; path: string; auth: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      const method = init?.method ?? 'GET'
      calls.push({ method, path, auth: (init?.headers as Record<string, string>)?.Authorization ?? '', body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const res = (status: number, body: unknown = {}) => ({ ok: status < 300, status, json: async () => body }) as Response
      if (path === '/child-device/reminders/config') return routes.config === 'fail' ? res(500) : res(200, routes.config ?? { available: true, vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' })
      if (path === '/child-device/reminder-devices') return res(routes.register ?? 201)
      if (path === '/child-device/reminder-devices/remove') return res(routes.remove ?? 204)
      return res(404)
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearPushEnv()
  vi.restoreAllMocks()
})

const show = () => render(<RemindersCard credential="cred" />)

describe('RemindersCard', () => {
  it('says so when the phone cannot receive reminders', async () => {
    stubApi()
    show()
    expect(await screen.findByText(text.unsupported)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('on an iPhone outside the installed app it says to add the app to the home screen', async () => {
    stubPushEnv()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
    stubApi()
    show()
    expect(await screen.findByText(text.iosInstall)).toBeInTheDocument()
  })

  it('says the reminders are blocked when the permission was denied', async () => {
    stubPushEnv({ permission: 'denied' })
    stubApi()
    show()
    expect(await screen.findByText(text.denied)).toBeInTheDocument()
  })

  it('says they are unavailable when the server has no push keys or cannot be asked', async () => {
    stubPushEnv()
    stubApi({ config: { available: false, vapidPublicKey: null } })
    const { unmount } = show()
    expect(await screen.findByText(text.unavailable)).toBeInTheDocument()
    unmount()
    stubApi({ config: 'fail' })
    show()
    expect(await screen.findByText(text.unavailable)).toBeInTheDocument()
  })

  it('asks for the permission only when the child taps, then subscribes and registers the phone with its credential', async () => {
    const user = userEvent.setup()
    const env = stubPushEnv()
    const calls = stubApi()
    show()
    const button = await screen.findByRole('button', { name: text.activate })
    expect(env.requestPermission).not.toHaveBeenCalled()
    await user.click(button)
    expect(await screen.findByRole('button', { name: text.turnOff })).toBeInTheDocument()
    expect(env.requestPermission).toHaveBeenCalledTimes(1)
    expect(env.pushManager.subscribe).toHaveBeenCalledTimes(1)
    const register = calls.find((c) => c.path === '/child-device/reminder-devices')
    expect(register?.auth).toBe('Device cred')
    expect(register?.body).toEqual({ endpoint: ENDPOINT, keys: { p256dh: 'p256dh-key', auth: 'auth-secret' } })
    expect(screen.getByText(text.on)).toBeInTheDocument()
    expect(screen.getByText(text.help)).toBeInTheDocument()
  })

  it('registers again a subscription the browser already has, and shows them on', async () => {
    stubPushEnv({ permission: 'granted', subscribed: true })
    const calls = stubApi()
    show()
    expect(await screen.findByRole('button', { name: text.turnOff })).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/child-device/reminder-devices')).toBe(true)
  })

  it('turns them off: the subscription is dropped and the server is told', async () => {
    const user = userEvent.setup()
    const env = stubPushEnv({ permission: 'granted', subscribed: true })
    const calls = stubApi()
    show()
    await user.click(await screen.findByRole('button', { name: text.turnOff }))
    expect(await screen.findByRole('button', { name: text.activate })).toBeInTheDocument()
    expect(env.subscription.unsubscribe).toHaveBeenCalled()
    expect(calls.find((c) => c.path === '/child-device/reminder-devices/remove')?.body).toEqual({ endpoint: ENDPOINT })
  })

  it('says it could not turn them off and keeps them on', async () => {
    const user = userEvent.setup()
    stubPushEnv({ permission: 'granted', subscribed: true })
    stubApi({ remove: 500 })
    show()
    await user.click(await screen.findByRole('button', { name: text.turnOff }))
    expect(await screen.findByText(text.error)).toBeInTheDocument()
  })

  it('does nothing more when the child refuses the permission, and marks it blocked if the browser says denied', async () => {
    const user = userEvent.setup()
    const env = stubPushEnv({ requestResult: 'denied' })
    stubApi()
    show()
    await user.click(await screen.findByRole('button', { name: text.activate }))
    expect(await screen.findByText(text.denied)).toBeInTheDocument()
    expect(env.pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('a dismissed permission prompt leaves the button as it was', async () => {
    const user = userEvent.setup()
    const env = stubPushEnv({ requestResult: 'default' })
    stubApi()
    show()
    await user.click(await screen.findByRole('button', { name: text.activate }))
    await waitFor(() => expect(env.requestPermission).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: text.activate })).toBeEnabled()
    expect(env.pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('never leaves a subscription the server does not have when registering fails', async () => {
    const user = userEvent.setup()
    const env = stubPushEnv()
    stubApi({ register: 500 })
    show()
    await user.click(await screen.findByRole('button', { name: text.activate }))
    expect(await screen.findByText(text.error)).toBeInTheDocument()
    expect(env.subscription.unsubscribe).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: text.activate })).toBeInTheDocument()
  })
})
