import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppHeader } from '../../shared/ui/AppHeader'
import { fetchConsultationDetail, ConsultationApiError } from './api'
import { DoseCheckbox } from './DoseCheckbox'
import { sniffImageMimeType } from './imageMime'

const cardClass = 'rounded-3xl bg-surface p-6 shadow-[0_8px_20px_rgba(4,37,43,0.07)] md:p-7'
const overlineClass = 'text-xs font-extrabold uppercase tracking-[0.1em] text-action'

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
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <p className="text-base font-semibold text-action">Cargando…</p>
      </main>
    )
  }

  if (query.isError) {
    const notFound =
      query.error instanceof ConsultationApiError && query.error.kind === 'consultation_not_found'
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
        <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-[0_8px_20px_rgba(4,37,43,0.07)]">
          <p className="text-lg font-bold tracking-tight text-ink">
            {notFound ? 'No se encontró esta consulta.' : 'Ocurrió un error al cargar la consulta.'}
          </p>
        </div>
      </main>
    )
  }

  const consultation = query.data!
  const photoSrc = `data:${sniffImageMimeType(consultation.photoBase64)};base64,${consultation.photoBase64}`

  return (
    <main className="min-h-screen bg-canvas pb-16">
      <AppHeader
        eyebrow={
          <Link to={`/children/${consultation.childId}`} className="hover:underline">
            ← Volver al reporte de consultas
          </Link>
        }
        title={consultation.doctorName}
      >
        <p className="text-base font-semibold text-white/80">{consultation.consultDate}</p>
      </AppHeader>

      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-7 md:px-10 md:py-9">
        <section className={cardClass}>
          <h2 className={overlineClass}>Receta</h2>
          <a
            href={photoSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block"
            aria-label="Abrir la foto de la receta en tamaño completo"
          >
            <img
              src={photoSrc}
              alt="Foto de la receta médica"
              className="max-h-[32rem] w-full cursor-zoom-in rounded-2xl bg-hint object-contain sm:max-h-[42rem]"
            />
          </a>
          <a
            href={photoSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-11 items-center rounded-2xl border-2 border-action px-5 py-2.5 text-base font-extrabold text-action transition-colors duration-200 hover:bg-hint"
          >
            Ver completa
          </a>
        </section>

        {consultation.symptoms && (
          <section className={cardClass}>
            <h2 className={overlineClass}>Síntomas</h2>
            <p className="mt-3 text-base leading-relaxed text-ink">{consultation.symptoms}</p>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className={`${overlineClass} px-1`}>Medicamentos</h2>
          {consultation.medications.map((med) => (
            <div key={med.id} className={cardClass}>
              <p className="text-xl font-extrabold tracking-tight text-ink">{med.name}</p>
              <p className="mt-1 text-sm font-semibold text-action">
                Cada {med.frequencyHours}h, por {med.durationDays} días
                {med.startTime && ` — inicio ${med.startTime}`}
              </p>

              {med.doses.length > 0 && (
                <div className="mt-5 grid gap-2.5 md:grid-cols-2">
                  {med.doses.map((dose) => (
                    <DoseCheckbox key={dose.id} consultationId={consultation.id} dose={dose} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
