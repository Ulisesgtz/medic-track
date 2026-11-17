import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App.tsx'
import { startInstallPrompt } from './shared/install'
import { installClientErrors } from './shared/clientErrors'

// specs/072: errors nobody caught and rejected promises are reported (cleaned) to the API, whichever screen the person is on.
installClientErrors()

// specs/071: `beforeinstallprompt` fires early and once; keep the event from the start so the first-use guide can use it.
startInstallPrompt()

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </StrictMode>,
)
