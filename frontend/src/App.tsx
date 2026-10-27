import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountSignupPage } from './features/account-signup/AccountSignupPage'
import { CompleteGoogleSignupPage } from './features/account-signup/CompleteGoogleSignupPage'
import { HomePage } from './features/home/HomePage'
import { ChildDetailPage } from './features/consultations/ChildDetailPage'
import { ConsultationDetailPage } from './features/consultations/ConsultationDetailPage'
import { HistoryPage } from './features/consultations/HistoryPage'
import { AppointmentFormPage } from './features/appointments/AppointmentFormPage'
import { AppointmentHistoryPage } from './features/appointments/AppointmentHistoryPage'
import { FakeCheckoutPage } from './features/plans/FakeCheckoutPage'
import { PaymentReturnPage } from './features/plans/PaymentReturnPage'
import { PlansPage } from './features/plans/PlansPage'
import { PersonalRoutinesPage } from './features/supplements/PersonalRoutinesPage'
import { RoutineDetailPage } from './features/supplements/RoutineDetailPage'
import { RoutineFormPage } from './features/supplements/RoutineFormPage'
import { FamilyPage } from './features/family/FamilyPage'
import { InvitationPage } from './features/family/InvitationPage'
import { NewConsultationPage } from './features/consultations/NewConsultationPage'
import { EditConsultationPage } from './features/consultations/EditConsultationPage'
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'
import { LoginPage } from './features/auth/LoginPage'
import { RequireSession } from './features/auth/RequireSession'
import { useClearCacheOnUserChange } from './features/auth/useClearCacheOnUserChange'
import { SsoCallbackPage } from './features/auth/SsoCallbackPage'
import { MessagePage } from './shared/ui/MessagePage'
import { ChildTodayPage } from './features/childDevice/phone/ChildTodayPage'
import { RedeemPage } from './features/childDevice/phone/RedeemPage'
import { readCredential } from './features/childDevice/phone/storage'
import { VaccinationCardPage } from './features/vaccinations/VaccinationCardPage'

const queryClient = new QueryClient()

/**
 * `/home`, the installed app's start_url. A phone that carries a child's access (specs/047) and has no parent session is the child's:
 * it goes to its own screen instead of the parents' login. Everybody else gets the home behind the session guard, as before.
 */
function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth()
  if (isLoaded && !isSignedIn && readCredential()) return <Navigate to="/hijo/hoy" replace />
  return (
    <RequireSession>
      <HomePage />
    </RequireSession>
  )
}

function SessionCacheGuard() {
  useClearCacheOnUserChange()
  return null
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionCacheGuard />
      <BrowserRouter>
        <Routes>
          <Route path="/signup" element={<AccountSignupPage />} />
          <Route
            path="/registro/completar"
            element={
              <RequireSession>
                <CompleteGoogleSignupPage />
              </RequireSession>
            }
          />
          <Route path="/sso-callback" element={<SsoCallbackPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/recuperar-contrasena" element={<ForgotPasswordPage />} />
          <Route path="/home" element={<HomeRoute />} />
          <Route
            path="/children/:childId"
            element={
              <RequireSession>
                <ChildDetailPage />
              </RequireSession>
            }
          />
          <Route
            path="/children/:childId/cartilla"
            element={
              <RequireSession>
                <VaccinationCardPage />
              </RequireSession>
            }
          />
          <Route
            path="/children/:childId/historial"
            element={
              <RequireSession>
                <HistoryPage />
              </RequireSession>
            }
          />
          <Route
            path="/children/:childId/consultations/new"
            element={
              <RequireSession>
                <NewConsultationPage />
              </RequireSession>
            }
          />
          <Route
            path="/consultations/:consultationId"
            element={
              <RequireSession>
                <ConsultationDetailPage />
              </RequireSession>
            }
          />
          <Route
            path="/consultations/:consultationId/editar"
            element={
              <RequireSession>
                <EditConsultationPage />
              </RequireSession>
            }
          />
          <Route
            path="/children/:childId/suplementos/nueva"
            element={
              <RequireSession>
                <RoutineFormPage kind="supplement" />
              </RequireSession>
            }
          />
          <Route
            path="/children/:childId/actividades/nueva"
            element={
              <RequireSession>
                <RoutineFormPage kind="activity" />
              </RequireSession>
            }
          />
          <Route
            path="/mis-suplementos"
            element={
              <RequireSession>
                <PersonalRoutinesPage kind="supplement" />
              </RequireSession>
            }
          />
          <Route
            path="/mis-actividades"
            element={
              <RequireSession>
                <PersonalRoutinesPage kind="activity" />
              </RequireSession>
            }
          />
          <Route
            path="/mis-suplementos/nueva"
            element={
              <RequireSession>
                <RoutineFormPage kind="supplement" personal />
              </RequireSession>
            }
          />
          <Route
            path="/mis-actividades/nueva"
            element={
              <RequireSession>
                <RoutineFormPage kind="activity" personal />
              </RequireSession>
            }
          />
          <Route
            path="/suplementos/:routineId"
            element={
              <RequireSession>
                <RoutineDetailPage />
              </RequireSession>
            }
          />
          <Route
            path="/actividades/:routineId"
            element={
              <RequireSession>
                <RoutineDetailPage />
              </RequireSession>
            }
          />
          <Route
            path="/suplementos/:routineId/editar"
            element={
              <RequireSession>
                <RoutineFormPage />
              </RequireSession>
            }
          />
          <Route
            path="/actividades/:routineId/editar"
            element={
              <RequireSession>
                <RoutineFormPage />
              </RequireSession>
            }
          />
          <Route
            path="/citas/:appointmentId/editar"
            element={
              <RequireSession>
                <AppointmentFormPage />
              </RequireSession>
            }
          />
          <Route
            path="/consultations/:consultationId/cita/nueva"
            element={
              <RequireSession>
                <AppointmentFormPage />
              </RequireSession>
            }
          />
          <Route
            path="/children/:childId/citas/nueva"
            element={
              <RequireSession>
                <AppointmentFormPage />
              </RequireSession>
            }
          />
          <Route
            path="/children/:childId/citas"
            element={
              <RequireSession>
                <AppointmentHistoryPage />
              </RequireSession>
            }
          />
          <Route
            path="/familia"
            element={
              <RequireSession>
                <FamilyPage />
              </RequireSession>
            }
          />
          {/* Public on purpose: an invitation is opened before the person has a session; the page itself asks for one. */}
          <Route path="/familia/invitacion" element={<InvitationPage />} />
          {/* A child's own phone (specs/047): no Clerk session and no parents' shell; it carries its own credential. Each of these
              routes is also in CHILD_PAGES of vite.config.ts, so its HTML names the child's manifest (the installed app starts at /hijo). */}
          <Route path="/hijo" element={<RedeemPage />} />
          <Route path="/hijo/hoy" element={<ChildTodayPage />} />
          <Route path="/" element={<Navigate to="/signup" replace />} />
          {/* The plans (specs/034): every "Ver el plan completo" lands here. */}
          <Route
            path="/planes"
            element={
              <RequireSession>
                <PlansPage />
              </RequireSession>
            }
          />
          {/* Where the payment provider sends the person back (specs/045): it only asks the server what happened. */}
          <Route
            path="/planes/regreso"
            element={
              <RequireSession>
                <PaymentReturnPage />
              </RequireSession>
            }
          />
          {/* The fake provider's payment page: only in the E2E and development builds (VITE_PAYMENTS_FAKE), never in production. */}
          {import.meta.env.VITE_PAYMENTS_FAKE === 'true' && <Route path="/planes/pago-de-prueba" element={<FakeCheckoutPage />} />}
          <Route
            path="*"
            element={<MessagePage title="Esta página no existe" message="Revisa la dirección o vuelve a tu home." />}
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
