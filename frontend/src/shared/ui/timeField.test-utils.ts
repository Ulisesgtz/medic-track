import type { UserEvent } from '@testing-library/user-event'
import { screen, within } from '@testing-library/react'

/**
 * Chooses «HH:MM» in a TimeField the way a person does: open the field by its name, tap the hour, tap the minutes (which closes
 * the panel). The field is found by its accessible name (a label or aria-label), as a regular expression or the exact text.
 */
export async function pickTime(user: UserEvent, fieldName: string | RegExp, time: string) {
  const [h, m] = time.split(':')
  await user.click(screen.getByRole('button', { name: fieldName }))
  const dialog = screen.getByRole('dialog', { name: 'Elegir hora' })
  await user.click(within(within(dialog).getByRole('group', { name: 'Hora' })).getByRole('button', { name: h }))
  await user.click(within(within(dialog).getByRole('group', { name: 'Minutos' })).getByRole('button', { name: `:${m}` }))
}
