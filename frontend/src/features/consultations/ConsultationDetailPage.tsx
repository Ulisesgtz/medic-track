import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchConsultationDetail, ConsultationApiError } from './api'
import { DoseCheckbox } from './DoseCheckbox'

/** Detail of a single consultation: photo, doctor, date, medications with
 * their markable doses (if any), and symptoms (FR-013). */
export function ConsultationDetailPage() {
  const { consultationId } = useParams<{ consultationId: string }>()

  const query = useQuery({
    queryKey: ['consultation', consultationId],
    queryFn: () => fetchConsultationDetail(consultationId!),
    enabled: !!consultationId,
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
    const notFound =
      query.error instanceof ConsultationApiError && query.error.kind === 'consultation_not_found'
    return (
      <main className="flex min-h-screen items-center justify-center bg-cyan-50 px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-md">
          <p className="text-sm text-slate-500">
            {notFound ? 'No se encontró esta consulta.' : 'Ocurrió un error al cargar la consulta.'}
          </p>
        </div>
      </main>
    )
  }

  const consultation = query.data!

  return (
    <main className="min-h-screen bg-cyan-50 px-4 py-8 md:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link to={`/children/${consultation.childId}`} className="text-sm text-cyan-700 hover:underline">
          ← Volver al reporte de consultas
        </Link>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-md">
          <h1 className="text-xl font-semibold text-slate-900">{consultation.doctorName}</h1>
          <p className="mt-1 text-sm text-slate-500">{consultation.consultDate}</p>

          <img
            src={`data:image/jpeg;base64,${consultation.photoBase64}`}
            alt="Foto de la receta médica"
            className="mt-4 max-h-96 w-full rounded-lg object-contain"
          />

          {consultation.symptoms && (
            <div className="mt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Síntomas</h2>
              <p className="mt-1 text-sm text-slate-700">{consultation.symptoms}</p>
            </div>
          )}

          <div className="mt-6 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Medicamentos</h2>
            {consultation.medications.map((med) => (
              <div key={med.id} className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4">
                <p className="font-semibold text-slate-900">{med.name}</p>
                <p className="text-sm text-slate-600">
                  Cada {med.frequencyHours}h, por {med.durationDays} días
                  {med.startTime && ` — inicio ${med.startTime}`}
                </p>

                {med.doses.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {med.doses.map((dose) => (
                      <DoseCheckbox key={dose.id} consultationId={consultation.id} dose={dose} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
