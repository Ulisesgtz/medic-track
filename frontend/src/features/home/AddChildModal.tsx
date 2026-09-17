import { useEffect, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChildFieldset } from '../account-signup/ChildFieldset'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { emptyChild, type AccountSignupFormValues } from '../account-signup/types'
import { addChild, AccountApiError } from './api'

interface AddChildModalProps {
  accountId: string
  onClose: () => void
}

/**
 * Modal shown from the home page's "Agregar hijo" control (FR-004).
 * Reuses ChildFieldset as-is from features/account-signup/ — same form,
 * same validation behavior, no duplication (research.md).
 */
export function AddChildModal({ accountId, onClose }: AddChildModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AccountSignupFormValues>({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      countryCode: '',
      stateCode: '',
      children: [emptyChild],
    },
  })
  const { fields } = useFieldArray({ control, name: 'children' })

  const mutation = useMutation({
    mutationFn: (values: AccountSignupFormValues) => {
      const c = values.children[0]
      return addChild(accountId, {
        firstName: c.firstName,
        lastName: c.lastName,
        birthDate: c.birthDate,
        height: c.height ? Number(c.height) : undefined,
        weight: c.weight ? Number(c.weight) : undefined,
      })
    },
    onSuccess: (account) => {
      queryClient.setQueryData(['account', accountId], account)
      onClose()
    },
  })

  const showFreemiumModal =
    mutation.isError &&
    mutation.error instanceof AccountApiError &&
    mutation.error.kind === 'freemium_child_limit_exceeded'

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(values)
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (showFreemiumModal) {
    return (
      <FreemiumLimitModal
        onViewPlans={() => window.location.assign('/planes')}
        onStayFree={() => mutation.reset()}
      />
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-child-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-child-title" className="text-lg font-semibold text-slate-900">
          Agregar hijo
        </h2>

        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          {fields.map((field, index) => (
            <ChildFieldset
              key={field.id}
              index={index}
              register={register}
              errors={errors}
              onRemove={onClose}
            />
          ))}

          {mutation.isError &&
            !(mutation.error instanceof AccountApiError && mutation.error.kind === 'freemium_child_limit_exceeded') && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {mutation.error instanceof AccountApiError
                  ? mutation.error.message
                  : 'Ocurrió un error al agregar al hijo. Intenta de nuevo.'}
              </p>
            )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutation.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
