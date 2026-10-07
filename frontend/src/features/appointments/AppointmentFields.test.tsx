import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppointmentFields } from './AppointmentFields'
import { emptyAppointmentValues, type AppointmentErrors, type AppointmentValues } from './appointmentValues'
import { NOW } from './appointments.test-utils'

function Harness({ initial, errors = {}, disabled, optional }: { initial?: Partial<AppointmentValues>; errors?: AppointmentErrors; disabled?: boolean; optional?: boolean }) {
  const [value, setValue] = useState<AppointmentValues>({ ...emptyAppointmentValues(), ...initial })
  return (
    <MemoryRouter>
      <AppointmentFields value={value} onChange={setValue} errors={errors} disabled={disabled} optional={optional} help={optional ? 'Si el pediatra dio fecha, se anota aquí.' : undefined} now={NOW} />
      <div data-testid="notices">{value.notices.map((n) => `${n.kind}:${n.leadMinutes ?? n.daysBefore}:${n.atTime ?? ''}`).join('|')}</div>
    </MemoryRouter>
  )
}

const setup = () => userEvent.setup()
const notices = () => screen.getByTestId('notices').textContent

describe('AppointmentFields', () => {
  it('shows the title, the help and the two default notices from the start', () => {
    render(<Harness optional />)
    expect(screen.getByRole('heading', { name: /Próxima cita/ })).toHaveTextContent('(opcional)')
    expect(screen.getByText('Si el pediatra dio fecha, se anota aquí.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar aviso «1 día antes»' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar aviso «2 horas antes»' })).toBeInTheDocument()
    expect(screen.getByText(/Llegan a cada persona de la familia/)).toBeInTheDocument()
  })

  it('says when each notice goes off once the date and time are known', () => {
    render(<Harness initial={{ date: '2026-10-09', time: '10:30' }} />)
    expect(screen.getByText('jue 8 oct, 10:30')).toBeInTheDocument()
    expect(screen.getByText('vie 9 oct, 08:30')).toBeInTheDocument()
  })

  it('types the date, the time and the note', async () => {
    const user = setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Nota', { exact: false }), 'Cartilla')
    expect(screen.getByLabelText('Nota', { exact: false })).toHaveValue('Cartilla')
    expect(screen.getByLabelText('Fecha de la cita')).toHaveValue('')
    expect(screen.getByLabelText('Hora de la cita')).toHaveValue('')
  })

  it('shows the errors next to the fields', () => {
    render(<Harness errors={{ date: 'La próxima cita va después de la consulta (6 oct 2026).', time: 'Escribe la hora de la cita.' }} />)
    expect(screen.getByText('La próxima cita va después de la consulta (6 oct 2026).')).toBeInTheDocument()
    expect(screen.getByText('Escribe la hora de la cita.')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de la cita')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Hora de la cita')).toHaveAttribute('aria-invalid', 'true')
  })

  it('removes a notice with its ×', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Quitar aviso «1 día antes»' }))
    expect(notices()).toBe('before:120:')
    expect(screen.queryByRole('button', { name: 'Cambiar aviso «1 día antes»' })).not.toBeInTheDocument()
  })

  it('adds a notice: time before, in the unit chosen, with when it would arrive', async () => {
    const user = setup()
    render(<Harness initial={{ date: '2026-10-09', time: '10:30', notices: [] }} />)
    await user.click(screen.getByRole('button', { name: '+ Agregar aviso' }))
    expect(screen.getByText('Nuevo aviso')).toBeInTheDocument()
    expect(screen.getByText('Llegaría el vie 9 oct a las 07:30.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agregar este aviso' }))
    expect(notices()).toBe('before:180:')
    expect(screen.getByRole('button', { name: 'Cambiar aviso «3 horas antes»' })).toBeInTheDocument()
    expect(screen.queryByText('Nuevo aviso')).not.toBeInTheDocument()
  })

  it('adds a fixed-hour notice and fills from the examples without adding them by themselves', async () => {
    const user = setup()
    render(<Harness initial={{ date: '2026-10-09', time: '10:30', notices: [] }} />)
    await user.click(screen.getByRole('button', { name: '+ Agregar aviso' }))
    await user.click(screen.getByRole('button', { name: 'Un día antes a las 20:00' }))
    expect(notices()).toBe('')
    expect(screen.getByRole('radio', { name: 'A una hora fija' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Días antes')).toHaveValue(1)
    expect(screen.getByLabelText('Hora del aviso')).toHaveValue('20:00')
    expect(screen.getByText('Llegaría el jue 8 oct a las 20:00.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agregar este aviso' }))
    expect(notices()).toBe('at_time:1:20:00')
    expect(screen.getByRole('button', { name: 'Cambiar aviso «Un día antes a las 20:00»' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Agregar aviso' }))
    await user.click(screen.getByRole('button', { name: '30 minutos antes' }))
    expect(screen.getByLabelText('Cantidad')).toHaveValue(30)
    expect(screen.getByLabelText('Unidad')).toHaveValue('minutos')
    await user.click(screen.getByRole('button', { name: 'El mismo día, 3 horas antes' }))
    expect(screen.getByLabelText('Cantidad')).toHaveValue(3)
    expect(screen.getByLabelText('Unidad')).toHaveValue('horas')
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(screen.queryByText('Nuevo aviso')).not.toBeInTheDocument()
  })

  it('switches the type of the new notice and the unit', async () => {
    const user = setup()
    render(<Harness initial={{ notices: [] }} />)
    await user.click(screen.getByRole('button', { name: '+ Agregar aviso' }))
    await user.selectOptions(screen.getByLabelText('Unidad'), 'dias')
    await user.clear(screen.getByLabelText('Cantidad'))
    await user.type(screen.getByLabelText('Cantidad'), '2')
    await user.click(screen.getByRole('button', { name: 'Agregar este aviso' }))
    expect(notices()).toBe('before:2880:')
    await user.click(screen.getByRole('button', { name: '+ Agregar aviso' }))
    await user.click(screen.getByRole('radio', { name: 'A una hora fija' }))
    await user.click(screen.getByRole('radio', { name: 'Tiempo antes' }))
    expect(screen.getByLabelText('Cantidad')).toBeInTheDocument()
  })

  it('refuses an amount that is not a whole number, a repeat and one after the appointment', async () => {
    const user = setup()
    render(<Harness initial={{ date: '2026-10-09', time: '10:30' }} />)
    await user.click(screen.getByRole('button', { name: '+ Agregar aviso' }))
    await user.clear(screen.getByLabelText('Cantidad'))
    await user.click(screen.getByRole('button', { name: 'Agregar este aviso' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe una cantidad entera, hasta 30 días.')

    await user.type(screen.getByLabelText('Cantidad'), '2')
    await user.click(screen.getByRole('button', { name: 'Agregar este aviso' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ese aviso ya está en la lista.')

    await user.click(screen.getByRole('radio', { name: 'A una hora fija' }))
    await user.clear(screen.getByLabelText('Días antes'))
    await user.type(screen.getByLabelText('Días antes'), '0')
    await user.clear(screen.getByLabelText('Hora del aviso'))
    await user.type(screen.getByLabelText('Hora del aviso'), '23:00')
    await user.click(screen.getByRole('button', { name: 'Agregar este aviso' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Un aviso no puede caer después de la cita.')

    await user.clear(screen.getByLabelText('Días antes'))
    await user.type(screen.getByLabelText('Días antes'), '99')
    await user.click(screen.getByRole('button', { name: 'Agregar este aviso' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe los días (0 a 30) y la hora.')
  })

  it('changes a notice by tapping it', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Cambiar aviso «2 horas antes»' }))
    expect(screen.getByLabelText('Cantidad')).toHaveValue(2)
    await user.clear(screen.getByLabelText('Cantidad'))
    await user.type(screen.getByLabelText('Cantidad'), '4')
    await user.click(screen.getByRole('button', { name: 'Guardar este aviso' }))
    expect(notices()).toBe('before:1440:|before:240:')

    await user.click(screen.getByRole('button', { name: 'Cambiar aviso «1 día antes»' }))
    expect(screen.getByLabelText('Unidad')).toHaveValue('dias')
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(notices()).toBe('before:1440:|before:240:')
  })

  it('stops at 5 notices with a sentence instead of a disabled button', () => {
    const five = [60, 120, 180, 240, 300].map((m) => ({ kind: 'before' as const, leadMinutes: m, daysBefore: null, atTime: null }))
    render(<Harness initial={{ notices: five }} />)
    expect(screen.queryByRole('button', { name: '+ Agregar aviso' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Son 5 avisos, el máximo. Para agregar otro, quita uno.')
  })

  it('shows a notice that already passed dashed, with a note that does not alarm', () => {
    render(<Harness initial={{ date: '2026-10-06', time: '18:00', notices: [{ kind: 'before', leadMinutes: 1440, daysBefore: null, atTime: null }, { kind: 'before', leadMinutes: 60, daysBefore: null, atTime: null }] }} />)
    expect(screen.getByText('era ayer, 18:00')).toBeInTheDocument()
    expect(screen.getByText('mar 6 oct, 17:00')).toBeInTheDocument()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('El aviso de «1 día antes» habría llegado ayer a las 18:00, que ya pasó, así que no se enviará. Los demás siguen igual.')
  })

  it('on the free plan shows the fields disabled and a link to the plan', () => {
    render(<Harness disabled optional />)
    expect(screen.getByText('Disponible en el plan completo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el plan completo →' })).toHaveAttribute('href', '/planes')
    expect(within(screen.getByText('Disponible en el plan completo').parentElement as HTMLElement).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Agregar aviso' })).not.toBeInTheDocument()
  })
})
