import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountSignupPage } from './features/account-signup/AccountSignupPage'
import { HomePage } from './features/home/HomePage'
import { ChildDetailPage } from './features/consultations/ChildDetailPage'
import { ConsultationDetailPage } from './features/consultations/ConsultationDetailPage'
import { MessagePage } from './shared/ui/MessagePage'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/signup" element={<AccountSignupPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/children/:childId" element={<ChildDetailPage />} />
          <Route path="/consultations/:consultationId" element={<ConsultationDetailPage />} />
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
