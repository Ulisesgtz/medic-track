# Investigación: Finalizar tratamiento antes de tiempo

## R1. Un solo campo nuevo: `medications.ended_at`

**Decisión**: migración `0013` con `ALTER TABLE medications ADD COLUMN ended_at TIMESTAMPTZ NULL`. `NULL` = en curso;
con valor = el momento de la confirmación. Las tomas **no se tocan** (ni se borran ni se les agrega columna): que una toma
esté cancelada se **deriva**: `ended_at IS NOT NULL AND scheduled_at > ended_at` y no marcada (FR-002, FR-003).

**Justificación**: coherente con la spec 013 (estados derivados, sin actualizar filas); una sola fila cambia al terminar,
sin recorrer decenas de tomas. Es la única excepción a la inmutabilidad (spec 004, FR-014): el horario, la duración y
las marcas no cambian.

**Alternativas**: columna `canceled` en cada toma (actualizar N filas, estados que pueden desfasarse); borrar las tomas
futuras (pierde el registro de lo que correspondía, contra FR-002).

## R2. Estado `canceled` en la regla de la spec 013

**Decisión**: `StatusAt` gana el parámetro `endedAt *time.Time` y un quinto estado, `canceled`: si `endedAt != nil`, la
toma es posterior a `endedAt` y **no está marcada**, es `canceled` (se evalúa antes que pending/due/unregistered). Las
tomas cuya hora ya había llegado al terminar conservan su estado (`taken`, `due`, `unregistered`) y siguen pudiéndose
marcar. `status` en la API: `pending | due | taken | unregistered | canceled`.

**Justificación**: una sola función sigue siendo la regla; los sitios que ya la usan (detalle, alta, `PATCH`, overview)
solo necesitan leer `ended_at` junto a la frecuencia.

## R3. Endpoint: `POST /consultations/{consultationId}/medications/{medicationId}/end`

**Decisión**: sin cuerpo; `RequireOwner` de la consulta (`ownsConsultation`), como `PATCH …/doses/{doseId}`. Un
`UPDATE medications SET ended_at = now() WHERE id = $1 AND consultation_id = $2 AND ended_at IS NULL` y luego se lee la
medicación: **idempotente** (terminar dos veces devuelve la misma `endedAt`, sin error, FR-007). Respuestas: `200` con la
medicación (con `endedAt`), `404` si no existe o no es de esa consulta, `400` si ya no tiene tomas por delante (nada que
finalizar). Escrito con `*httpx.Responder`; documentado en Swagger; ruta en `router.go` con su fila en `router_test.go`.

## R4. Efectos en lo existente

- **Tratamiento activo (spec 006)**: `GetOverview` excluye medicaciones con `ended_at`.
- **Overview de hoy**: no incluye tomas canceladas; `isUnmarked` tampoco las cuenta (no son `pending`/`due`).
- **Recordatorios (spec 011)**: `ClaimDueDoses` agrega `AND (m.ended_at IS NULL OR d.scheduled_at <= m.ended_at)`.
- **Progreso (spec 014)**: `medicationProgress` excluye las `canceled` del total (`total = tomas − canceladas`).

## R5. Frontend

**Decisión**: en `MedicationCard`, un botón "Finalizar tratamiento" (de contorno: un solo botón sólido por pantalla),
visible solo si el medicamento no terminó y tiene tomas por delante (alguna `pending`). Abre un diálogo (portal,
`role="dialog"`, Escape, foco y Tab como los demás) con: "¿Finalizar el tratamiento de {nombre}? Se dejarán de avisar las
tomas que faltan. Las tomas registradas se conservan. No se puede deshacer." y "Cancelar" / "Finalizar tratamiento". Al
terminar, la tarjeta dice "Terminado el 30 sep · 6 de 9 tomas" en lugar del botón; las tomas canceladas se pintan con
estilo propio (borde punteado claro, texto tachado, deshabilitadas) y "cancelada" en su descripción accesible. Hook
`useEndTreatment` invalida `['consultation', id]` y `['overview']`. Texto neutral (Principio I).

## R6. Pruebas

Backend: `StatusAt` con `canceled` (bordes), endpoint (200, idempotente, 404, 403 de otra cuenta, 400 sin tomas por
delante), detalle/overview con `endedAt` y `canceled`, tratamiento activo sin el terminado, `ClaimDueDoses` sin
canceladas. Frontend: botón y diálogo, tarjeta terminada, chip cancelado, progreso sin canceladas. E2E a 390 y 1280 px.
