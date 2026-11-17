import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * specs/072: `/__prueba-error`, only in the E2E build (`VITE_TEST_ERROR_ROUTE=true`, never in DEV or production). By default it
 * breaks while it draws (the error screen); with `?tipo=asincrono` it draws and then throws an error and rejects a promise from the
 * app's own code, which only the global listeners see. `?marca=word` is added to the messages so each E2E test makes a report of its
 * own (the server writes one row per equal error every 5 minutes).
 */
export function ErrorTestPage() {
  const [params] = useSearchParams()
  const asynchronous = params.get('tipo') === 'asincrono'
  const mark = (params.get('marca') ?? '').replace(/[^a-z]/g, '').slice(0, 20)
  const suffix = mark ? ` ${mark}` : ''

  useEffect(() => {
    if (!asynchronous) return
    setTimeout(() => {
      throw new Error(`Prueba de error asincrono${suffix}`)
    }, 0)
    void Promise.reject(new Error(`Prueba de promesa rechazada${suffix}`))
  }, [asynchronous, suffix])

  if (!asynchronous) throw new Error(`Prueba de pantalla de error${suffix}`)
  return <main className="p-8 text-body">Prueba de errores en segundo plano.</main>
}
