import { useEffect } from 'react'
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-child-title"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="add-child-title" className="text-2xl font-black tracking-tight text-ink">
            Agregar hijo
          </h2>
          <p className="text-sm text-slate-600">Se guarda en tu cuenta, no se comparte.</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
          {/* "Quitar hijo" (from the reused ChildFieldset) discards this
              still-unsaved entry and closes the modal — valid only while
              filling the form, since a child can never be removed once
              persisted (FR-006a). It's the modal's only dismiss control;
              there's no separate "Cancelar" duplicating the same action. */}
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
            !(
              mutation.error instanceof AccountApiError &&
              mutation.error.kind === 'freemium_child_limit_exceeded'
            ) && (
              <p
                role="alert"
                className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800"
              >
                {mutation.error instanceof AccountApiError
                  ? mutation.error.message
                  : 'Ocurrió un error al agregar al hijo. Intenta de nuevo.'}
              </p>
            )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="min-h-11 cursor-pointer rounded-2xl bg-confirmed px-7 py-3 text-base font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutation.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
