import { useParams, Link } from 'react-router-dom'

/**
 * Placeholder for a child's detail screen (consultas/recetas médicas).
 * FR-005: clicking a child's name must navigate somewhere, but that screen's
 * content is a separate future feature — this route exists only so the
 * navigation itself doesn't 404 or render blank.
 */
export function ChildDetailPlaceholder() {
  const { childId } = useParams<{ childId: string }>()

  return (
    <main className="min-h-screen bg-cyan-50 px-4 py-8 md:py-12">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-100 bg-white p-6 shadow-md md:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Próximamente</h1>
        <p className="mt-2 text-sm text-slate-500">
          El historial de consultas y recetas de este hijo (id: {childId}) todavía no está
          disponible.
        </p>
        <Link
          to="/home"
          className="mt-6 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700 transition-colors duration-200 hover:bg-cyan-50"
        >
          Volver a mi home
        </Link>
      </div>
    </main>
  )
}
