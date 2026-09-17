import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchConsultations, ConsultationApiError } from './api'
import { ConsultationCard } from './ConsultationCard'
import { ConsultationForm } from './ConsultationForm'

/**
 * A child's detail page: lists their medical consultations (FR-001) with an
 * empty state (FR-002), and a "Registrar consulta" control that opens the
 * registration form (FR-003).
 */
export function ChildDetailPage() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const query = useQuery({
    queryKey: ['consultations', childId],
    queryFn: () => fetchConsultations(childId!),
    enabled: !!childId,
    retry: false,
  })

  if (query.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cyan-50 px-4 py-8">
        <p className="text-sm text-slate-500">Cargando…</p>
      </main>
    )
  }

  if (query.isError) {
    const notFound = query.error instanceof ConsultationApiError && query.error.kind === 'child_not_found'
    return (
      <main className="flex min-h-screen items-center justify-center bg-cyan-50 px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-md">
          <p className="text-sm text-slate-500">
            {notFound ? 'No se encontró este hijo.' : 'Ocurrió un error al cargar sus consultas.'}
          </p>
          <Link
            to="/home"
            className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700 transition-colors duration-200 hover:bg-cyan-50"
          >
            Volver a mi home
          </Link>
        </div>
      </main>
    )
  }

  const consultations = query.data ?? []

  return (
    <main className="min-h-screen bg-cyan-50 px-4 py-8 md:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link to="/home" className="text-sm text-cyan-700 hover:underline">
          ← Volver a mi home
        </Link>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Consultas médicas</h1>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700 transition-colors duration-200 hover:bg-cyan-50"
          >
            Registrar consulta
          </button>
        </div>

        {consultations.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-500">
              Todavía no hay consultas registradas. Registra la primera para empezar.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {consultations.map((c) => (
              <ConsultationCard key={c.id} consultation={c} />
            ))}
          </div>
        )}
      </div>

      {showForm && childId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Registrar consulta</h2>
            <ConsultationForm
              childId={childId}
              onCancel={() => setShowForm(false)}
              onSuccess={(consultationId) => {
                setShowForm(false)
                queryClient.invalidateQueries({ queryKey: ['consultations', childId] })
                navigate(`/consultations/${consultationId}`)
              }}
            />
          </div>
        </div>
      )}
    </main>
  )
}
