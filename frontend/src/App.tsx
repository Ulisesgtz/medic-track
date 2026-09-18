import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountSignupPage } from './features/account-signup/AccountSignupPage'
import { HomePage } from './features/home/HomePage'
import { ChildDetailPage } from './features/consultations/ChildDetailPage'
import { ConsultationDetailPage } from './features/consultations/ConsultationDetailPage'

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
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
