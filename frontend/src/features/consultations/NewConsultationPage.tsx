import { useCallback, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { formatAgeLong } from '../../shared/age'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { AppShell } from '../home/AppShell'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useChildAccess } from '../family/useChildAccess'
import { useSidebarSession } from '../home/useSidebarSession'
import { ConsultationForm } from './ConsultationForm'

/**
 * `/children/:childId/consultations/new` — the "Nueva consulta" screen
 * (mockups 04 and 14). It is a page, not a modal: "← Cancelar" goes back to
 * the child's detail, and leaving with something already captured (fields or
 * a photo) asks before discarding it.
 */
export function NewConsultationPage() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isDesktop } = useSidebarSession()
  const dirtyRef = useRef(false)
  // The ref answers "leave?" at click time; the state tells the "new version" bar there is work a reload would lose.
  const [dirty, setDirty] = useState(false)
  useUnsavedWork(dirty)
  const handleDirtyChange = useCallback((value: boolean) => {
    dirtyRef.current = value
    setDirty(value)
  }, [])

  const accountQuery = useCurrentAccount()
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  // Specs/032: the plan is the child's family's, not the session's own.
  const access = useChildAccess(accountQuery.data, childId)
  const childLabel = child ? `${child.firstName} ${child.lastName} · ${formatAgeLong(child.birthDate)}` : undefined

  if (!childId) return null

  return (
    <AppShell activeChildId={childId}>
      <main className={isDesktop ? 'min-w-0 bg-canvas px-6 py-8 lg:px-12 lg:py-11' : 'mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10'}>
        <ConsultationForm
          childId={childId}
          variant={isDesktop ? 'desktop' : 'phone'}
          childLabel={childLabel}
          cancelTo={`/children/${childId}`}
          confirmLeave={() =>
            !dirtyRef.current || window.confirm('¿Descartar la consulta? Se perderá lo que capturaste.')
          }
          onDirtyChange={handleDirtyChange}
          // specs/030: only the free plan lacks it; until the account loads the server decides.
          recordOnlyAvailable={!access.isFree}
          onSuccess={(consultationId) => {
            dirtyRef.current = false
            queryClient.invalidateQueries({ queryKey: ['consultations', childId] })
            queryClient.invalidateQueries({ queryKey: ['overview'] })
            // The paid plan's history (specs/031) and its doctor/medication lists.
            queryClient.invalidateQueries({ queryKey: ['history', childId] })
            queryClient.invalidateQueries({ queryKey: ['history-options', childId] })
            // replace: "back" from the saved consultation lands on the child, not on an already-sent form.
            navigate(`/consultations/${consultationId}`, { replace: true })
          }}
        />
      </main>
    </AppShell>
  )
}
