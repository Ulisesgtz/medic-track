import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRef } from 'react'
import { ActivityTypeDialog } from './ActivityTypeDialog'
import { ACTIVITY_TYPES, stubApi } from './supplements.test-utils'

// specs/075: the dialog's focus is set once, when it opens — a parent that renders again (its 60 s refetch, `isPending`) must not move it.

function setup() {
  stubApi({ 'GET /catalog/activity-types': { body: ACTIVITY_TYPES } })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const opener = createRef<HTMLButtonElement>()
  const props = { activityName: 'Fut', current: 'sports', error: null, onSave: vi.fn(), opener }
  const tree = (busy: boolean, onCancel: () => void) => (
    <QueryClientProvider client={queryClient}>
      <button ref={opener}>Cambiar</button>
      <ActivityTypeDialog {...props} busy={busy} onCancel={onCancel} />
    </QueryClientProvider>
  )
  return { ...render(tree(false, () => {})), tree }
}

describe('ActivityTypeDialog · focus', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not move the focus when the parent renders again with a new callback or while it is busy', async () => {
    const { rerender, tree } = setup()
    const user = userEvent.setup()
    const save = await screen.findByRole('button', { name: 'Guardar' })
    await screen.findByRole('radio', { name: 'Deportiva' })
    save.focus()
    expect(save).toHaveFocus()

    rerender(tree(false, () => {}))
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Cambiar' })).not.toHaveFocus()

    rerender(tree(true, () => {}))
    rerender(tree(false, () => {}))
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('radio', { name: 'Deportiva' })).toHaveFocus() // Tab still stays inside
  })

  it('still calls the LATEST onCancel on Escape, and gives the focus back only when it closes', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, tree, unmount } = setup()
    rerender(tree(false, first))
    rerender(tree(false, second))
    await userEvent.setup().keyboard('{Escape}')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    unmount()
  })
})
