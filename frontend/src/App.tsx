import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountSignupPage } from './features/account-signup/AccountSignupPage'
import { HomePage } from './features/home/HomePage'
import { ChildDetailPage } from './features/consultations/ChildDetailPage'
import { ConsultationDetailPage } from './features/consultations/ConsultationDetailPage'
import { NewConsultationPage } from './features/consultations/NewConsultationPage'
import { RequireSession } from './features/auth/RequireSession'
import { MessagePage } from './shared/ui/MessagePage'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/signup" element={<AccountSignupPage />} />
          {/* Real login/Google-callback screens land in Historia 2 (specs/008) — placeholders keep the
              routes wired (and testable) from the moment RequireSession starts redirecting to them. */}
          <Route
            path="/login"
            element={
              <MessagePage
                title="Inicio de sesión"
                message="Estamos construyendo el login. Mientras tanto, usa el registro."
                to="/signup"
                linkLabel="Ir al registro"
              />
            }
          />
          <Route
            path="/sso-callback"
            element={<MessagePage title="Iniciando sesión…" message="Un momento." to="/signup" linkLabel="Ir al registro" />}
          />
          <Route
            path="/home"
            element={
              <RequireSession>
                <HomePage />
              </RequireSession>
            }
          />
          <Route
            path="/children/:childId"
            element={
              <RequireSession>
                <ChildDetailPage />
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
          <Route path="/" element={<Navigate to="/signup" replace />} />
          {/* "Ver planes" of the freemium pop-up lands here until the plans screen exists (BACKLOG). */}
          <Route
            path="/planes"
            element={
              <MessagePage
                title="Planes de pago"
                message="Estamos preparando los planes. Mientras tanto puedes seguir usando PediTrack con un hijo sin costo."
              />
            }
          />
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
