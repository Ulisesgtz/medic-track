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

// «10» is both an hour and a minute: always choose inside the group.
const hourBtn = (n: string) => within(within(screen.getByRole('dialog')).getByRole('group', { name: 'Hora' })).getByRole('button', { name: n })
const minuteBtn = (n: string) => within(within(screen.getByRole('dialog')).getByRole('group', { name: 'Minutos' })).getByRole('button', { name: n })

describe('TimeField', () => {
  it('starts empty (no hour suggested), named by its label, and says what to do', () => {
    render(<Harness />)
    const field = screen.getByRole('button', { name: 'Desde las' })
    expect(field).toHaveTextContent('Elegir hora')
    expect(field).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a panel with 24 hours and 12 minutes; the hour waits for its minutes, which set the value and close it', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Desde las' }))
    const dialog = screen.getByRole('dialog', { name: 'Elegir hora' })
    expect(within(within(dialog).getByRole('group', { name: 'Hora' })).getAllByRole('button')).toHaveLength(24)
    expect(within(within(dialog).getByRole('group', { name: 'Minutos' })).getAllByRole('button')).toHaveLength(12)
    expect(within(dialog).getByText('—:—')).toBeInTheDocument()

    await user.click(hourBtn('17'))
    expect(onChange).not.toHaveBeenCalled() // only the hour so far: the panel says «17:—» and stays open
    expect(within(dialog).getByText('17:—')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(minuteBtn('45'))
    expect(onChange).toHaveBeenCalledTimes(1)
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
    expect(hourBtn('08')).toHaveAttribute('aria-pressed', 'true')
    expect(minuteBtn('30')).toHaveAttribute('aria-pressed', 'true')
    await user.click(hourBtn('09'))
    expect(onChange).toHaveBeenLastCalledWith('09:30') // with a value, the hour changes it at once

    first.unmount()
    onChange.mockClear()
    render(<Harness onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Desde las' }))
    await user.click(minuteBtn('15'))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(hourBtn('20'))
    expect(onChange).toHaveBeenLastCalledWith('20:15')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closing with only the hour chosen means «:00», however it is closed', async () => {
    const user = userEvent.setup()
    const field = () => screen.getByRole('button', { name: 'Desde las' })
    const close = {
      'Listo': () => user.click(screen.getByRole('button', { name: 'Listo' })),
      'Escape': () => user.keyboard('{Escape}'),
      'a tap outside': () => user.click(screen.getByRole('button', { name: 'otro' })),
    }
    for (const [how, closeIt] of Object.entries(close)) {
      const onChange = vi.fn()
      const view = render(<Harness onChange={onChange} />)
      await user.click(field())
      await user.click(hourBtn('10'))
      expect(onChange, how).not.toHaveBeenCalled()
      await closeIt()
      expect(onChange, how).toHaveBeenLastCalledWith('10:00')
      expect(field()).toHaveTextContent('10:00')
      view.unmount()
    }

    // Nothing chosen: nothing is set.
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await user.click(field())
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(field()).toHaveTextContent('Elegir hora')
  })

  it('marks the chosen hour and minutes with more than color: underlined and with a check', async () => {
    render(<Harness initial="08:30" />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Desde las' }))
    const on = hourBtn('08')
    expect(on).toHaveAttribute('aria-pressed', 'true')
    expect(on.className).toContain('underline')
    expect(on).toHaveTextContent('✓')
    const off = hourBtn('09')
    expect(off).not.toHaveTextContent('✓')
  })

  it('draws the arrow (▼ / ▲), the panel width of its card and four or six buttons per row', async () => {
    render(<TimeField id="a" value="" onChange={() => {}} ariaLabel="Hora del aviso" panelWidth={270} cols={4} align="end" />)
    const user = userEvent.setup()
    const field = screen.getByRole('button', { name: 'Hora del aviso' })
    expect(field).toHaveTextContent('▼')
    await user.click(field)
    expect(field).toHaveTextContent('▲')
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveStyle({ width: '270px' })
    expect(within(dialog).getByRole('group', { name: 'Hora' }).querySelector('.grid-cols-4')).not.toBeNull()
    expect(within(dialog).getByRole('group', { name: 'Minutos' }).querySelector('.grid-cols-4')).not.toBeNull()
  })

  it('has the width of a phone card by default', async () => {
    render(<TimeField value="" onChange={() => {}} ariaLabel="Hora" />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hora' }))
    expect(screen.getByRole('dialog')).toHaveStyle({ width: '314px' })
    expect(within(screen.getByRole('dialog')).getByRole('group', { name: 'Hora' }).querySelector('.grid-cols-6')).not.toBeNull()
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
