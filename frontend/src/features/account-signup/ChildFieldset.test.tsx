import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, useFieldArray } from 'react-hook-form'
import { ChildFieldset } from './ChildFieldset'
import type { AccountSignupFormValues } from './types'
import { emptyChild } from './types'

/** Minimal host form so ChildFieldset can be tested with a real RHF context. */
function TestHost() {
  const {
    register,
    control,
    formState: { errors },
  } = useForm<AccountSignupFormValues>({
    defaultValues: { firstName: '', lastName: '', email: '', countryCode: '', stateCode: '', children: [] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'children' })

  return (
    <div>
      <button type="button" onClick={() => append(emptyChild)}>
        Agregar hijo
      </button>
      {fields.map((field, index) => (
        <ChildFieldset
          key={field.id}
          index={index}
          register={register}
          errors={errors}
          onRemove={() => remove(index)}
        />
      ))}
    </div>
  )
}

describe('ChildFieldset', () => {
  it('adds a child block when "Agregar hijo" is pressed', async () => {
    const user = userEvent.setup()
    render(<TestHost />)

    await user.click(screen.getByRole('button', { name: 'Agregar hijo' }))

    expect(screen.getByTestId('child-fieldset-0')).toBeInTheDocument()
  })

  it('removes a child block before saving, without affecting other blocks (FR-006)', async () => {
    const user = userEvent.setup()
    render(<TestHost />)

    await user.click(screen.getByRole('button', { name: 'Agregar hijo' }))
    await user.click(screen.getByRole('button', { name: 'Agregar hijo' }))
    expect(screen.getByTestId('child-fieldset-0')).toBeInTheDocument()
    expect(screen.getByTestId('child-fieldset-1')).toBeInTheDocument()

    const removeButtons = screen.getAllByRole('button', { name: 'Quitar hijo' })
    await user.click(removeButtons[0])

    expect(screen.queryAllByText(/Hijo \d/)).toHaveLength(1)
  })

  it('shows a validation error for each required child field left empty', async () => {
    const user = userEvent.setup()

    function TestHostWithSubmit() {
      const {
        register,
        control,
        handleSubmit,
        formState: { errors },
      } = useForm<AccountSignupFormValues>({
        defaultValues: { firstName: '', lastName: '', email: '', countryCode: '', stateCode: '', children: [] },
      })
      const { fields, append, remove } = useFieldArray({ control, name: 'children' })

      return (
        <form onSubmit={handleSubmit(() => {})}>
          <button type="button" onClick={() => append(emptyChild)}>
            Agregar hijo
          </button>
          {fields.map((field, index) => (
            <ChildFieldset
              key={field.id}
              index={index}
              register={register}
              errors={errors}
              onRemove={() => remove(index)}
            />
          ))}
          <button type="submit">Guardar</button>
        </form>
      )
    }

    render(<TestHostWithSubmit />)
    await user.click(screen.getByRole('button', { name: 'Agregar hijo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El nombre del hijo es obligatorio')).toBeInTheDocument()
    expect(await screen.findByText('El apellido del hijo es obligatorio')).toBeInTheDocument()
    expect(await screen.findByText('La fecha de nacimiento es obligatoria')).toBeInTheDocument()
  })
})
