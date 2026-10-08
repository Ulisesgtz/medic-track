import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimeField } from './TimeField'
import { pickTime } from './timeField.test-utils'

function Harness({ initial = '', onChange = () => {}, align }: { initial?: string; onChange?: (v: string) => void; align?: 'start' | 'end' }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <label htmlFor="t">Desde las</label>
      <TimeField
        id="t"
        value={value}
        onChange={(v) => {
          setValue(v)
          onChange(v)
        }}
        align={align}
      />
      <button type="button">otro</button>
    </>
  )
}

describe('TimeField', () => {
  it('starts empty (no hour suggested), named by its label, and says what to do', () => {
    render(<Harness />)
    const field = screen.getByRole('button', { name: 'Desde las' })
    expect(field).toHaveTextContent('Elegir hora')
    expect(field).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a panel with 24 hours and 12 minutes, the hour first, and closes when the minutes are chosen', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Desde las' }))
    const dialog = screen.getByRole('dialog', { name: 'Elegir hora' })
    expect(within(within(dialog).getByRole('group', { name: 'Hora' })).getAllByRole('button')).toHaveLength(24)
    expect(within(within(dialog).getByRole('group', { name: 'Minutos' })).getAllByRole('button')).toHaveLength(12)

    await user.click(within(dialog).getByRole('button', { name: '17' }))
    expect(onChange).toHaveBeenLastCalledWith('17:00')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: ':45' }))
    expect(onChange).toHaveBeenLastCalledWith('17:45')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desde las' })).toHaveTextContent('17:45')
    expect(screen.getByRole('button', { name: 'Desde las' })).toHaveFocus()
  })

  it('keeps the minute when only the hour changes, and waits for the hour when the minutes come first', async () => {
    const onChange = vi.fn()
    const first = render(<Harness initial="08:30" onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Desde las' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: '08' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('button', { name: ':30' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: '09' }))
    expect(onChange).toHaveBeenLastCalledWith('09:30')

    first.unmount()
    render(<Harness onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Desde las' }))
    await user.click(screen.getByRole('button', { name: ':15' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '20' }))
    expect(onChange).toHaveBeenLastCalledWith('20:15')
  })

  it('closes with Escape, with «Listo» and with a tap outside, giving the focus back to the field', async () => {
    render(<Harness initial="08:00" />)
    const user = userEvent.setup()
    const field = () => screen.getByRole('button', { name: 'Desde las' })

    await user.click(field())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(field()).toHaveFocus()

    await user.click(field())
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(field())
    await user.click(screen.getByRole('button', { name: 'otro' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(field())
    await user.click(field())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('hangs from the right edge when it is the field of the right of a row', async () => {
    render(<Harness align="end" />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Desde las' }))
    expect(screen.getByRole('dialog').className).toContain('right-0')
  })

  it('takes its name from ariaLabel when there is no label, shows an error state and its description', () => {
    render(<TimeField value="" onChange={() => {}} ariaLabel="Hora 2" invalid describedBy="why" />)
    const field = screen.getByRole('button', { name: 'Hora 2' })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field.getAttribute('aria-describedby')).toContain('why')
  })

  it('pickTime chooses an hour like a person does', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await pickTime(userEvent.setup(), 'Desde las', '06:05')
    expect(onChange).toHaveBeenLastCalledWith('06:05')
  })
})
