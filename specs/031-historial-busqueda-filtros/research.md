# Investigación (Fase 0): Historial con búsqueda y filtros

Decisiones técnicas de la spec 031. Cada una: **Decisión**, **Justificación**, **Alternativas consideradas**. No quedó ningún
`NEEDS CLARIFICATION`.

## R1 — La búsqueda es un `POST` con cuerpo, no un `GET` con parámetros

**Decisión**: `POST /children/{childId}/consultations/search` con el criterio en el cuerpo JSON. La lista simple
(`GET /children/{childId}/consultations`) **no cambia** y sigue siendo lo que ve el plan gratuito.

**Justificación**: el texto buscado puede ser un dato de salud del menor («diabetes», un medicamento, una nota). El API
imprime en su registro de operación **la dirección completa de cada petición, con lo que va después del `?`**
(`middleware.Logger` en `internal/server/router.go`), y los proveedores (Railway, Cloudflare) guardan sus propios registros
de direcciones. Un `POST` deja el criterio fuera de la dirección (FR-015, Principio II). El registro de errores
(`error_logs`) ya usa solo la ruta con plantilla (`endpointFromContext`), así que tampoco lo guarda.

**Alternativas**: `GET` con `?q=…&from=…` — más «RESTful» y cacheable, pero filtra el texto a los registros de direcciones;
rechazada. Quitar el `Logger` — rompe la operación de todo lo demás.

## R2 — Ignorar acentos y mayúsculas sin extensiones ni migración

**Decisión**: comparar con una función de plegado de **español**: `translate(lower(texto), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')` en SQL (las mayúsculas acentuadas van también en el
`translate`: con una base de configuración regional `C`, `lower()` no las baja), y la misma transformación (en Go,
`foldSpanish`) sobre el texto buscado; la coincidencia es por **subcadena** con
`strpos(plegado(columna), plegado(q)) > 0`.

**Justificación**: la app es para México (nombres, medicamentos y notas en español); `strpos` no tiene comodines, así que no
hay que escapar `%` ni `_` del texto del padre. Sin extensión de PostgreSQL → **sin migración** y sin depender de que el
proveedor permita `CREATE EXTENSION`. Con cientos de consultas por hijo, un recorrido de la tabla es instantáneo (R9).

**Alternativas**: extensión `unaccent` — más completa pero exige migración y permisos en cada entorno; `pg_trgm` para búsqueda
difusa — es «encontrar parecidos», lo que la spec excluye (Principio I, Supuestos); índice de texto completo — escala que no
existe (Principio V).

## R3 — Qué busca el texto

**Decisión**: el texto coincide con el **doctor**, las **notas** o el **nombre de algún medicamento** de la consulta
(`EXISTS` sobre `medications`). Un texto vacío (tras recortar espacios) no filtra. Máximo 100 caracteres.

## R4 — Cómo se combinan los criterios

**Decisión**: todos a la vez (`AND`). `from`/`to`: sobre `consult_date` (una fecha, sin hora), extremos incluidos, cada uno
opcional. `doctor`: igualdad exacta con lo registrado (la lista de elección sale de lo registrado, R7). `medication`:
`EXISTS` con `medications.name` igual a lo elegido. `symptomCodes`: la consulta debe tener **todos** los marcados
(`count(DISTINCT symptom_code) = n`). `kind`: `all` (no filtra), `treatment` (`NOT record_only`), `record` (`record_only`).

**Justificación**: es lo que decidió el dueño (síntomas que se suman; doctor y medicamento elegidos de una lista).

## R5 — Validación en el servidor

**Decisión**: `ValidationErrors` por campo, sin ignorar nada en silencio (FR-011): `q` ≤ 100 caracteres; `from`/`to`
`YYYY-MM-DD` válidas y `from ≤ to`; `doctor` y `medication` ≤ 200 caracteres; `kind` ∈ {`all`,`treatment`,`record`} (vacío =
`all`); `symptomCodes` ≤ 30 códigos, cada uno **existente en el catálogo** (activo o retirado: una consulta antigua puede
conservar uno retirado y debe poder encontrarse por él; un código que nunca existió → `symptom_not_available`, como al crear
una consulta). El cuerpo se lee con tope de tamaño (el mismo `maxRequestBodyBytes`).

## R6 — El plan lo decide el servidor, siempre

**Decisión**: antes de buscar, el repositorio lee `accounts.plan` del dueño del hijo (una consulta de solo lectura, sin
bloqueo). Si no es `paid` → `*PlanLimitError{Reason: "history_search"}` → **422** con el mismo `error`
`freemium_consultation_limit_exceeded` de la spec 030 y `reason: "history_search"`. Para el plan gratuito **toda** petición a
este endpoint se rechaza, aunque no traiga criterios (la pantalla Historial entera es del plan completo). Nunca se devuelven
resultados filtrados a una cuenta gratuita (SC-004).

**Justificación**: reutiliza el mecanismo, el código y el aviso de la spec 030 (FR-018): un motivo nuevo, no una familia nueva.

## R7 — Las listas de doctor y medicamento: un `GET` aparte

**Decisión**: `GET /children/{childId}/history-options` → `{ doctors: [...], medications: [...] }`: los nombres **distintos**
ya registrados para ese hijo (recortados, sin repetidos), ordenados sin distinguir mayúsculas ni acentos. Solo plan de pago
(mismo 422). Se pide una vez por pantalla (`staleTime`), no en cada letra.

**Justificación**: las opciones deben ser **todas** las del hijo y no cambiar mientras se afina la búsqueda; mezclarlas en la
respuesta de cada búsqueda las recalcularía en cada tecla. No llevan datos en la dirección (solo el id del hijo).

**Alternativas**: sacar las listas del resultado de la lista simple en el cliente — esa lista no trae los medicamentos.

## R8 — Respuesta de la búsqueda

**Decisión**: la misma forma que la lista (`{ childId, consultations: [ConsultationSummary] }`), así la misma tarjeta
(`ConsultationCard`) sirve sin cambios; orden `consult_date DESC, created_at DESC, id` (empate estable). El conteo es el largo
de la lista. Sin paginar (Supuestos de la spec).

## R9 — Escala y rendimiento

**Decisión**: sin índice nuevo ni migración. `idx_consultations_child_id` ya acota a las consultas de un hijo (decenas a
cientos); sobre ellas, los `EXISTS` a `medications` (`idx_medications_consultation_id`) y a `consultation_symptoms`
son baratos. Se mide con 500 consultas en una prueba (SC-002).

## R10 — El estado de la búsqueda vive en la pestaña, no en la dirección

**Decisión**: criterio actual en `sessionStorage` por hijo (`historial:<childId>`), leído al montar la pantalla y escrito al
cambiar (el texto, con *debounce* de 300 ms). Estado vacío/ inválido → valores por omisión. La dirección es solo
`/children/:childId/historial`.

**Justificación**: FR-012 pide conservar la búsqueda al volver del detalle, con «atrás» y al recargar; ponerla en la dirección
mandaría el texto a los registros de Cloudflare al recargar (R1). `sessionStorage` sobrevive a recargar y a navegar, y se
borra al cerrar la pestaña. Todo acceso va en `try/catch` (puede estar bloqueado): sin él, la pantalla funciona igual, solo
que no recuerda.

## R11 — Entrada y aviso para el plan gratuito

**Decisión**: `HistoryEntry` (mismo patrón que `NewConsultationEntry`, spec 030) en la lista de consultas del hijo, en ambos
diseños: con plan `free` es un botón con la marca «Plan completo» que abre `FreemiumLimitModal` con el motivo nuevo
`history_search`; con `paid` (o la cuenta aún sin cargar, donde decide el servidor) es un enlace a `/children/:childId/historial`.
La pantalla Historial, si el plan es `free` o el servidor responde 422, muestra el mismo aviso y «Entendido» regresa al hijo.

## R12 — Pantalla: dos diseños, sin mock

**Decisión**: `HistoryPage` elige con `useIsDesktop` uno de dos árboles (nunca clases `lg:` que mezclen). **Móvil**: cabecera
oscura (← Tus consultas, «Historial», el hijo), campo de búsqueda, botón «Filtros (N)» que despliega el panel (fechas,
doctor, medicamento, tipo, síntomas), pastillas de criterios activos y las tarjetas. **Web**: encabezado y dos columnas — el
panel de filtros a la izquierda (fijo al desplazar) y los resultados a la derecha. Sin mock entregado: se arma con tokens,
`formStyles.ts`, `Notice`, `ConsultationCard` y el pop-up de planes, y se le muestra al usuario para ajustes.
Los síntomas reutilizan `SymptomPicker` (el catálogo ya cacheado por `useSymptoms`).

## R13 — Pruebas

**Decisión**: backend — matriz de criterios y combinaciones contra una base real (exactitud: cero de más, cero de menos),
acentos y mayúsculas, plan gratuito rechazado sin resultados, dueño ajeno 403, validaciones, privacidad (el texto no queda
en `error_logs`), 500 consultas (SC-002), y filas nuevas en `router_test.go`. Frontend — Vitest de la lógica pura del estado,
las listas, la entrada, la pantalla (ambos diseños) y la API; Playwright a 390 y 1280 px con cuentas de pago y una gratuita
(`historial-consultas.spec.ts`). Swagger regenerado.

## R14 — Documentación

**Decisión**: `CLAUDE.md` (raíz, backend y frontend) y `BACKLOG.md` (el segundo paso del «Orden sugerido» pasa a hecho).
