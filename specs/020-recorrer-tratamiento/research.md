# Investigación: Recorrer el tratamiento y marcar inicio y fin en el calendario

## R1 — Un recorrido es una fila propia y las tomas agregadas son tomas normales

**Decisión**: migración `0014` con una tabla de solo agregar, `medication_extensions` (`id`, `medication_id`,
`account_id`, `proposed_doses`, `added_doses` de 1 a 60, `created_at`), y dos columnas nulas en `doses`:
`added_by_extension_id` (la toma la trajo ese recorrido) y `covered_by_extension_id` (esa toma «sin registrar» ya fue
recorrida). Las tomas agregadas son filas normales de `doses`: todo lo que ya lee tomas (estados de la spec 013,
recordatorios de la spec 011, progreso, «Tomas de hoy», tratamiento activo) las ve sin cambios.

**Justificación**: derivar «cuántas faltan» sin guardar nada no alcanza: hay que recordar cuáles tomas sin registrar ya
se recorrieron (FR-005) y quién lo decidió. El número propuesto y el confirmado quedan en la fila (`manual` = distintos),
sin columna aparte. `account_id` es la cuenta dueña de la consulta (vía `children.account_id`): `RequireOwner` ya
garantiza que solo ella llama. Única excepción nueva a la inmutabilidad de las consultas tras `ended_at` (spec 016):
ahora también se **agregan** filas; nada se edita ni se borra.

**Alternativas**: mover `duration_days` (hace falta recordar más que un número y cambia lo prescrito: el renglón «Cada 8
horas · 3 días» debe seguir diciendo lo que el médico indicó); regenerar todas las tomas (rompería las marcadas).

## R2 — «Sin registrar aún no recorridas»: lo calcula el servidor

**Decisión**: `extendableDoses` de un medicamento = tomas con estado `unregistered` (regla `StatusAt` de la spec 013, con
el reloj del servidor) y `covered_by_extension_id IS NULL`, solo si el medicamento no está finalizado. Se calcula al leer
el detalle (`GetByID`) y se manda en cada medicamento; el frontend muestra el botón si es > 0 y lo propone como número.

**Justificación**: una sola regla en el servidor, como en las specs 013 y 016; el reloj del teléfono nunca decide.

## R3 — Recorrer es una transacción con el medicamento bloqueado

**Decisión**: `Repository.ExtendTreatment(ctx, consultationID, medicationID, doses)`: en una transacción,
`SELECT … FOR UPDATE` del medicamento (serializa dos dispositivos a la vez); si está finalizado o no tiene tomas por
recorrer → `ErrNothingToExtend`; inserta el recorrido (`proposed` = lo calculado, `added` = lo pedido); marca como
recorridas (`covered_by_extension_id`) **todas** las tomas sin registrar de ese momento, sin importar el número
confirmado; inserta las `added` tomas nuevas en `max(scheduled_at) + k × frecuencia` con `added_by_extension_id`. Un
segundo clic o un segundo dispositivo encuentra 0 por recorrer y recibe `nothing_to_extend`, nunca duplica.

**Validación**: el número pedido es un entero de 1 a 60 (`validation_error`, campo `doses`); 60 cubre 20 días cada 8 h y
evita errores de captura; constante en un solo lugar (`MaxExtensionDoses`).

## R4 — Endpoint

**Decisión**: `POST /consultations/{consultationId}/medications/{medicationId}/extend`, cuerpo `{ "doses": N }`, con
`ownsConsultation` como `…/end` y `*httpx.Responder`; 200 con el medicamento ya actualizado (`extendableDoses` y
`extensions`); 400 `validation_error` / `nothing_to_extend`; 404 `medication_not_found`. No es idempotente a propósito
(cada recorrido es una decisión); el frontend trata `nothing_to_extend` como «ya estaba hecho» y refresca.

## R5 — Lo que el detalle agrega

**Decisión**: cada medicamento trae `extendableDoses` (número) y `extensions` (lista, más reciente al final):
`{ createdAt, proposedDoses, addedDoses, manual }`. La tarjeta dice «Se recorrió el 30 sep · +2 tomas» con la
última y agrega «número ingresado manualmente» si `manual`. Sin lista de historial completa (fuera de alcance).

## R6 — Diálogo: número editable, con la nota de «manual»

**Decisión**: `ExtendTreatmentDialog` (portal, `role="dialog"`, `aria-modal`, Escape y fondo cancelan salvo mientras se
envía —lección de la spec 016—, foco inicial en «Cancelar», Tab circula entre el campo, «Cancelar» y «Sí, recorrer»). El
campo numérico parte del número propuesto; debajo, «Quedaría hasta el 7 oct» se recalcula con el número (hora de la
última toma + N × frecuencia, en hora local) y, si el número ≠ propuesto, la nota «Cambiaste el número propuesto:
quedará registrado que lo ingresaste tú manualmente.». Inválido (no entero o fuera de 1–60) → mensaje en el campo y
«Sí, recorrer» deshabilitado. El texto pregunta «¿Tu médico te indicó reponer las tomas?» sin sugerir nada.

## R7 — Calendario: marcar los días con tomas, inicio y fin rellenos

**Decisión**: cambia la regla de la spec 019 (R2 de esa investigación): un medicamento marca **los días que tienen al
menos una toma** dentro de su rango (`medicationRange` no cambia: primer y último día, con el fin del tratamiento
finalizado), no todo el rango continuo. `marksOn(day, meds)` devuelve `{ number, role }` con `role` = `start` | `end` |
`both` | `mid`; el inicio y el fin se dibujan como círculo relleno del color con el número en blanco (13 px, ya medidos
≥ 4.5:1) y los días intermedios siguen siendo el número en color. El nombre accesible del día dice «inicio de 1
Amoxicilina», «fin de …», «inicio y fin de …» o solo el nombre. `treatmentSpan`, los meses y la lista del día no cambian.
Con un recorrido, el último día con tomas ya incluye las agregadas y el «fin» se mueve solo.
