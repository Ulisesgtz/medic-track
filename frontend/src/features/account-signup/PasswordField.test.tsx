import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, useWatch } from 'react-hook-form'
import { PasswordField } from './PasswordField'
import { PASSWORD_RULES, passwordValidation } from './validation'

function Harness() {
  const { register, control } = useForm<{ password: string }>({ defaultValues: { password: '' } })
  const password = useWatch({ control, name: 'password' })
  return (
    <>
      <PasswordField registration={register('password', passwordValidation)} value={password ?? ''} inputClassName="x" />
      <button type="button">otro campo</button>
    </>
  )
}

describe('password rules', () => {
  it('accepts a password with 8+ characters, lower, upper, number and special character', () => {
    expect(passwordValidation.validate('Secreto123!')).toBe(true)
  })

  it.each([
    ['Ab1!', 'too short'],
    ['SECRETO123!', 'no lowercase'],
    ['secreto123!', 'no uppercase'],
    ['Secretoabc!', 'no number'],
    ['Secreto1234', 'no special character'],
  ])('rejects %s (%s)', (value) => {
    expect(passwordValidation.validate(value)).toBe(false)
  })

  it('counts accented letters as letters, not as special characters', () => {
    expect(PASSWORD_RULES.find((r) => r.id === 'special')!.test('Contraseñá1')).toBe(false)
    expect(PASSWORD_RULES.find((r) => r.id === 'lowercase')!.test('ñ')).toBe(true)
  })
})

describe('PasswordField', () => {
  it('hides the rules until the tutor focuses the field', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.queryByText('Reglas de la contraseña')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Contraseña'))

    expect(screen.getByText('Reglas de la contraseña')).toBeInTheDocument()
    expect(screen.getByText(/Mínimo 8 caracteres/, { selector: 'li span' })).toBeInTheDocument()
    expect(screen.getByText(/Al menos 1 letra mayúscula/)).toBeInTheDocument()
    expect(screen.getByText(/Al menos 1 letra minúscula/)).toBeInTheDocument()
    expect(screen.getByText(/Al menos 1 número/)).toBeInTheDocument()
    expect(screen.getByText(/Al menos 1 carácter especial/)).toBeInTheDocument()
  })

  it('marks each rule as met while typing, and keeps them visible after leaving a non-empty field', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText('Contraseña')

    await user.type(input, 'abc')
    expect(screen.getByText(/Al menos 1 letra minúscula/)).toHaveTextContent('(cumplida)')
    expect(screen.getByText(/Al menos 1 letra mayúscula/)).toHaveTextContent('(pendiente)')
    expect(screen.getByText(/Mínimo 8 caracteres/, { selector: 'li span' })).toHaveTextContent('(pendiente)')

    await user.type(input, 'DEF123!x')
    for (const label of [/Mínimo 8/, /minúscula/, /mayúscula/, /número/, /especial/]) {
      expect(screen.getByText(label, { selector: 'li span' })).toHaveTextContent('(cumplida)')
    }

    await user.click(screen.getByRole('button', { name: 'otro campo' }))
    expect(screen.getByText('Reglas de la contraseña')).toBeInTheDocument()
  })

  it('shows and hides the password with the eye button, keeping the rules on screen', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText('Contraseña')
    await user.type(input, 'Secreto123!')

    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))

    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('Secreto123!')
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Reglas de la contraseña')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('keeps the rules while focus moves from the field to the eye button', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByLabelText('Contraseña'))
    await user.tab()

    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toHaveFocus()
    expect(screen.getByText('Reglas de la contraseña')).toBeInTheDocument()
  })

  it('hides the rules again when the field is left empty', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByLabelText('Contraseña'))
    await user.click(screen.getByRole('button', { name: 'otro campo' }))

    expect(screen.queryByText('Reglas de la contraseña')).not.toBeInTheDocument()
  })
})
