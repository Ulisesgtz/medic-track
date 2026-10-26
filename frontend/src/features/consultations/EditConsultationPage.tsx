import { useCallback, useRef, useState, type ComponentProps } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatAgeLong } from '../../shared/age'
import { useUnsavedWork } from '../../shared/appVersion/unsavedWork'
import { Notice } from '../../shared/ui/Notice'
import { AppShell } from '../home/AppShell'
import { useCurrentAccount } from '../auth/useCurrentAccount'
import { useChildAccess } from '../family/useChildAccess'
import { useSidebarSession } from '../home/useSidebarSession'
import { fetchConsultationDetail } from './api'
import type { ConsultationDetail } from './types'
import { ConsultationForm, type ConsultationEdit } from './ConsultationForm'
import { EDIT_TEXT } from './editText'
import { flagsOf, valuesOfDetail, versionOf } from './editValues'

/**
 * `/consultations/:consultationId/editar` — editing a saved consultation (specs/051): the «Nueva consulta» form with what was
 * saved, in the same two designs. Only who can do everything with the child edits (the server decides it again); leaving with
 * changes asks first, and saving replaces this page in the history so «back» from the consultation doesn't return here.
 */
export function EditConsultationPage() {
  const { consultationId } = useParams<{ consultationId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { getToken } = useAuth()
  const { isDesktop } = useSidebarSession()
  const dirtyRef = useRef(false)
  const [dirty, setDirty] = useState(false)
  useUnsavedWork(dirty)
  const handleDirtyChange = useCallback((value: boolean) => {
    dirtyRef.current = value
    setDirty(value)
  }, [])
  // A conflict reloads the saved consultation into a fresh form (its key) and says why.
  const [notice, setNotice] = useState<string | null>(null)
  const [round, setRound] = useState(0)

  const query = useQuery({
    queryKey: ['consultation', consultationId],
    queryFn: async () => fetchConsultationDetail(consultationId!, await getToken()),
    enabled: !!consultationId,
    retry: false,
  })
  const accountQuery = useCurrentAccount()
  const childId = query.data?.childId
  const child = accountQuery.data?.children.find((c) => c.id === childId)
  const access = useChildAccess(accountQuery.data, childId)

  const handleConflict = useCallback(
    async (kind: 'edit_conflict' | 'medication_has_marks') => {
      dirtyRef.current = false
      setDirty(false)
      setNotice(kind === 'edit_conflict' ? EDIT_TEXT.conflict : EDIT_TEXT.hasMarks)
      await queryClient.refetchQueries({ queryKey: ['consultation', consultationId] })
      setRound((r) => r + 1)
    },
    [queryClient, consultationId],
  )

  if (!consultationId) return null
  const detailPath = `/consultations/${consultationId}`
  if (query.isPending || accountQuery.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <p className="text-base font-semibold text-action">Cargando…</p>
      </main>
    )
  }
  // Nothing to edit, or nothing this person may change: back to the consultation (the server would refuse anyway).
  if (query.isError || !access.canAdd) return <Navigate to={detailPath} replace />

  const detail = query.data
  const childLabel = child ? `${child.firstName} ${child.lastName} · ${formatAgeLong(child.birthDate)}` : undefined

  return (
    <AppShell activeChildId={detail.childId}>
      <main className={isDesktop ? 'min-w-0 bg-canvas px-6 py-8 lg:px-12 lg:py-11' : 'mx-auto min-h-screen w-full max-w-[430px] bg-canvas pb-10'}>
        {notice && (
          <div className={isDesktop ? 'mx-auto mb-6 max-w-4xl' : 'px-6 pt-6'}>
            <Notice tone="info">{notice}</Notice>
          </div>
        )}
        <EditRound
          key={`${detail.id}:${round}`}
          detail={detail}
          variant={isDesktop ? 'desktop' : 'phone'}
          childLabel={childLabel}
          cancelTo={detailPath}
          confirmLeave={() => !dirtyRef.current || window.confirm(EDIT_TEXT.leave)}
          onDirtyChange={handleDirtyChange}
          onConflict={handleConflict}
          onSuccess={() => {
            dirtyRef.current = false
            queryClient.invalidateQueries({ queryKey: ['consultation', detail.id] })
            queryClient.invalidateQueries({ queryKey: ['consultations', detail.childId] })
            queryClient.invalidateQueries({ queryKey: ['overview'] })
            queryClient.invalidateQueries({ queryKey: ['history', detail.childId] })
            queryClient.invalidateQueries({ queryKey: ['history-options', detail.childId] })
            navigate(detailPath, { replace: true })
          }}
        />
      </main>
    </AppShell>
  )
}

type EditRoundProps = Omit<ComponentProps<typeof ConsultationForm>, 'edit' | 'childId'> & { detail: ConsultationDetail }

/**
 * One round of editing: what the form starts from — the values, the version it sends back and each medication's state — is taken
 * once, when it mounts. A refetch of the consultation in the background (the app coming back to the front) must not hand a
 * newer version to a form still holding the older values: that would overwrite someone else's edit without a conflict.
 */
function EditRound({ detail, ...props }: EditRoundProps) {
  const [edit] = useState<ConsultationEdit>(() => ({
    consultationId: detail.id,
    values: valuesOfDetail(detail),
    version: versionOf(detail),
    flags: flagsOf(detail),
    symptoms: detail.symptoms,
  }))
  return <ConsultationForm {...props} childId={detail.childId} edit={edit} />
}
