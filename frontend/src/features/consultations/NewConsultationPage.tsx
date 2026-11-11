import { useCallback, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { formatAgeLong } from '../../shared/age'
import { useDiscardGuard } from '../../shared/ui/useDiscardGuard'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { subjectAccessOf, subjectKey, type Subject } from '../../shared/subject'
import { AppShell } from '../home/AppShell'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useSidebarSession } from '../home/useSidebarSession'
import { ConsultationForm } from './ConsultationForm'

/**
 * `/children/:childId/consultations/new` — the "Nueva consulta" screen
 * (mockups 04 and 14). It is a page, not a modal: "← Cancelar" goes back to
 * the child's detail, and leaving with something already captured (fields or
 * a photo) asks before discarding it. With `own` it is `/yo/consultas/nueva`, the person's own consultation (specs/058), the
 * same form and back to `/yo`.
 */
export function NewConsultationPage({ own = false }: { own?: boolean }) {
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
  // specs/066: the app's own question instead of the browser's.
  const guard = useDiscardGuard({ isDirty: () => dirtyRef.current, title: '¿Descartar la consulta?', body: 'Se perderá lo que capturaste.' })

  const accountQuery = useCurrentAccount()
  const account = accountQuery.data
  const subject: Subject | undefined = own ? (account ? { kind: 'person', accountId: account.id } : undefined) : childId ? { kind: 'child', childId } : undefined
  const child = account?.children.find((c) => c.id === childId)
  // Specs/032: the plan is the child's family's, not the session's own. Specs/058: one's own things'.
  const access = subjectAccessOf(account, subject)
  const childLabel = own
    ? account
      ? `${account.firstName} ${account.lastName}`
      : undefined
    : child
      ? `${child.firstName} ${child.lastName} · ${formatAgeLong(child.birthDate)}`
      : undefined
  const home = own ? '/yo' : `/children/${childId}`

  if (!subject) return null

  return (
    <AppShell activeChildId={own ? undefined : childId}>
      <main className={isDesktop ? 'min-w-0 bg-canvas px-6 py-8 lg:px-12 lg:py-11' : 'mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10'}>
        {guard.dialog}
        <ConsultationForm
          childId={subject}
          variant={isDesktop ? 'desktop' : 'phone'}
          childLabel={childLabel}
          cancelTo={home}
          onLeaveClick={(event) => guard.guardLink(event, home)}
          onDirtyChange={handleDirtyChange}
          // specs/030: only the free plan lacks it; until the account loads the server decides.
          recordOnlyAvailable={!access.isFree}
          // specs/033, part 2: the next appointment is the paid plan's too.
          appointmentAvailable={!access.isFree}
          onSuccess={(consultationId, appointmentFailed) => {
            dirtyRef.current = false
            const key = subjectKey(subject)
            queryClient.invalidateQueries({ queryKey: ['consultations', key] })
            queryClient.invalidateQueries({ queryKey: ['overview'] })
            queryClient.invalidateQueries({ queryKey: ['appointments'] })
            // The paid plan's history (specs/031) and its doctor/medication lists.
            queryClient.invalidateQueries({ queryKey: ['history', key] })
            queryClient.invalidateQueries({ queryKey: ['history-options', key] })
            // replace: "back" from the saved consultation lands on the child, not on an already-sent form.
            navigate(`/consultations/${consultationId}`, { replace: true, state: appointmentFailed ? { appointmentFailed: true } : undefined })
          }}
        />
      </main>
    </AppShell>
  )
}
