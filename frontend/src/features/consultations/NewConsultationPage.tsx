import { useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatAgeLong } from '../../shared/age'
import { AppShell } from '../home/AppShell'
import { fetchAccount } from '../home/api'
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
  const { accountId, isDesktop } = useSidebarSession()
  const dirtyRef = useRef(false)
  const handleDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty
  }, [])

  const accountQuery = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => fetchAccount(accountId!),
    enabled: accountId !== null,
    retry: false,
  })
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const childLabel = child ? `${child.firstName} ${child.lastName} · ${formatAgeLong(child.birthDate)}` : undefined

  if (!childId) return null

  return (
    <AppShell activeChildId={childId}>
      <main className={isDesktop ? 'min-w-0 bg-canvas px-12 py-11' : 'mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10'}>
        <ConsultationForm
          childId={childId}
          variant={isDesktop ? 'desktop' : 'phone'}
          childLabel={childLabel}
          cancelTo={`/children/${childId}`}
          confirmLeave={() =>
            !dirtyRef.current || window.confirm('¿Descartar la consulta? Se perderá lo que capturaste.')
          }
          onDirtyChange={handleDirtyChange}
          onSuccess={(consultationId) => {
            dirtyRef.current = false
            queryClient.invalidateQueries({ queryKey: ['consultations', childId] })
            queryClient.invalidateQueries({ queryKey: ['overview'] })
            // replace: "back" from the saved consultation lands on the child, not on an already-sent form.
            navigate(`/consultations/${consultationId}`, { replace: true })
          }}
        />
      </main>
    </AppShell>
  )
}
