import { useIsDesktop } from '../../shared/ui/useIsDesktop'
import { SignupPhone } from './SignupPhone'
import { SignupWeb } from './SignupWeb'
import { useSignupForm } from './useSignupForm'

/**
 * "Crear cuenta". Two separate designs, chosen by the same rule as the rest of
 * the app (a window of 900px or more is "web"): `SignupPhone` (mock 01) and
 * `SignupWeb` (mock 11). They share the form state and submit flow
 * (`useSignupForm`) and are never mixed.
 */
export function AccountSignupForm() {
  const form = useSignupForm()
  const desktop = useIsDesktop()

  return desktop ? <SignupWeb form={form} /> : <SignupPhone form={form} />
}
