import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FreemiumLimitModal } from '../account-signup/FreemiumLimitModal'
import { nameError, nameValidation, positiveNumberValidation } from '../account-signup/validation'
import { FormField } from '../../shared/ui/FormField'
import { addChild, AccountApiError } from './api'

interface AddChildModalProps {
  accountId: string
  onClose: () => void
}

interface AddChildFormValues {
  firstName: string
  lastName: string
  birthDate: string
  height: string
  weight: string
}

const field =
  'min-h-11 w-full min-w-0 rounded-[14px] border-[1.5px] bg-surface px-4 py-3.5 text-base font-medium text-ink placeholder:text-slate-400 focus:border-2 focus:border-ink focus:outline-none'
const border = (invalid: boolean) => (invalid ? 'border-red-600' : 'border-slate-300')

/**
 * The "Agregar hijo" modal (FR-004), built from board screen 7: title and
 * subtitle with a "×" button, the fields in one column, and "Cancelar"
 * (outline) + "Guardar". Deviations from the mock, by decision: the name is
 * split into "Nombre" and "Apellido" (the account model stores both) and
 * height/weight are offered as optional fields.
 *
 * Focus starts on the first field and returns to the button that opened it;
 * Escape, "×", "Cancelar" and a click on the backdrop close it; Tab stays
 * inside. Rendered into <body> so it can be opened from the sticky sidebar
 * without being painted under the page.
 */
export function AddChildModal({ accountId, onClose }: AddChildModalProps) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const dialogRef = useRef<HTMLDivElement>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddChildFormValues>({
    defaultValues: { firstName: '', lastName: '', birthDate: '', height: '', weight: '' },
  })

  const mutation = useMutation({
    mutationFn: async (values: AddChildFormValues) =>
      addChild(accountId, {
        firstName: values.firstName,
        lastName: values.lastName,
        birthDate: values.birthDate,
        height: values.height ? Number(values.height) : undefined,
        weight: values.weight ? Number(values.weight) : undefined,
      }, await getToken()),
    onSuccess: (account) => {
      queryClient.setQueryData(['accounts', 'me'], account)
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
    dialogRef.current?.querySelector<HTMLInputElement>('#firstName')?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      // Keep Tab/Shift+Tab inside the dialog instead of letting focus reach the page behind it.
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'),
      ]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    // No focus-restore here: `onClose` is always `AddChildDialogs`' `close`, which already
    // restores focus to the real opener button via its `opener` ref (this component's only
    // caller never renders it standalone). Restoring it here too raced with that: on Safari,
    // a click never focuses a button, so `document.activeElement` at this effect's mount is
    // NOT the "Agregar hijo" button — restoring to it on unmount silently dropped focus to
    // whatever had it before, clobbering the correct restore that already ran in `close()`.
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (showFreemiumModal) {
    // FreemiumLimitModal renders itself into <body>.
    return (
      <FreemiumLimitModal
        onViewPlans={() => window.location.assign('/planes')}
        onStayFree={() => mutation.reset()}
      />
    )
  }

  const otherError =
    mutation.isError && !(mutation.error instanceof AccountApiError && mutation.error.kind === 'freemium_child_limit_exceeded')

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-child-title"
        className="max-h-[90vh] w-full max-w-[456px] overflow-y-auto rounded-3xl bg-surface p-7 shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[22px]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 id="add-child-title" className="text-2xl font-black tracking-[-0.03em] text-ink">
                Agregar hijo
              </h2>
              <p className="text-sm text-slate-500">Se guarda en tu cuenta, no se comparte.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-slate-100 text-base font-extrabold text-ink-soft transition-colors duration-200 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <FormField id="firstName" text="Nombre" error={nameError(errors.firstName, 'El nombre del hijo')}>
            <input
              id="firstName"
              size={1}
              autoComplete="off"
              className={`${field} ${border(!!errors.firstName)}`}
              {...register('firstName', nameValidation)}
            />
          </FormField>

          <FormField id="lastName" text="Apellido" error={nameError(errors.lastName, 'El apellido del hijo')}>
            <input
              id="lastName"
              size={1}
              autoComplete="off"
              className={`${field} ${border(!!errors.lastName)}`}
              {...register('lastName', nameValidation)}
            />
          </FormField>

          <FormField
            id="birthDate"
            text="Fecha de nacimiento"
            error={errors.birthDate ? 'La fecha de nacimiento es obligatoria' : undefined}
          >
            <input
              id="birthDate"
              type="date"
              size={1}
              className={`${field} ${border(!!errors.birthDate)}`}
              {...register('birthDate', { required: true })}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              id="height"
              text="Talla (cm) (opcional)"
              error={errors.height ? 'La talla debe ser un número positivo' : undefined}
            >
              <input
                id="height"
                type="number"
                step="0.1"
                size={1}
                className={`${field} ${border(!!errors.height)}`}
                {...register('height', positiveNumberValidation)}
              />
            </FormField>
            <FormField
              id="weight"
              text="Peso (kg) (opcional)"
              error={errors.weight ? 'El peso debe ser un número positivo' : undefined}
            >
              <input
                id="weight"
                type="number"
                step="0.1"
                size={1}
                className={`${field} ${border(!!errors.weight)}`}
                {...register('weight', positiveNumberValidation)}
              />
            </FormField>
          </div>

          {otherError && (
            <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">
              {mutation.error instanceof AccountApiError
                ? mutation.error.message
                : 'Ocurrió un error al agregar al hijo. Intenta de nuevo.'}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 cursor-pointer rounded-[14px] border-2 border-action px-5 py-[13px] text-[15px] font-extrabold text-action transition-colors duration-200 hover:bg-hint focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="min-h-11 cursor-pointer rounded-[14px] bg-confirmed px-6 py-[13px] text-[15px] font-extrabold text-white transition-colors duration-200 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutation.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
