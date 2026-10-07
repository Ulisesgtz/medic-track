# Investigación — Parte 1: rutinas de suplementos (spec 033)

Decisiones que el plan necesita antes del diseño. Cada una: **Decisión**, **Justificación**, **Alternativas**. La parte 2 (próxima cita) y la
parte 3 (rutinas personales) se planean después; donde el modelo les deja la puerta abierta, se dice.

## R1 — Tablas propias para las rutinas, no generalizar `doses`

**Decisión**: tres tablas nuevas: `supplement_routines`, `supplement_doses` y `supplement_dose_reminders` (+ `supplement_muted`, R8). `doses` y
`dose_reminders` no cambian de forma.
**Justificación**: `doses` cuelga de `medications → consultations` (llaves, inmutabilidad de la spec 004, `StatusAt`, extender/finalizar, calendario de
medicamentos). Hacerla opcional contagia a todo lo que ya funciona (y a sus 90 % de cobertura). Una toma de suplemento es otra cosa: la rutina **sí se
edita**, no tiene doctor ni consulta. La pantalla las junta (T1 del mock) y eso es una **unión de lecturas**, no una tabla común.
**Alternativas**: (a) `doses.medication_id` nulo + `routine_id` → toca la tabla más delicada y deja un CHECK «una de dos»; (b) una vista/tabla polimórfica
`any_dose` → complejidad sin ganancia; (c) tratar el suplemento como «medicamento sin consulta» → rompe la inmutabilidad de la 004.

## R2 — Tomas materializadas con un horizonte que avanza, no calculadas al vuelo

**Decisión**: al crear, reanudar o editar se generan las tomas de los próximos **14 días** (o hasta la fecha de fin). Una rutina sin fin se mantiene al día:
cada tick del planificador existente (30 s) extiende las rutinas activas cuyo `generated_until` baje de **7 días** adelante, hasta 14. Las tomas ya vividas
no se regeneran nunca.
**Justificación**: el reclamo de avisos, «Tomas de hoy», el calendario y la regla de «sin registrar» son consultas SQL sobre filas; con filas reales cada
una es una consulta indexada y las marcas tienen dónde guardarse. Calcular al vuelo obligaría a repetir la aritmética de periodicidades en SQL (reclamo) y
en el cliente.
**Alternativas**: tomas virtuales con una tabla solo de marcas → el reclamo por persona se vuelve un generador en SQL; descartado. Generar un año de golpe →
miles de filas por rutina y reprogramar al editar es caro.

## R3 — Hora local con la diferencia horaria que manda el cliente

**Decisión**: igual que las consultas (spec 006): la creación, la edición y la reanudación llevan `utcOffsetMinutes`; la rutina lo guarda y **calcula sus
instantes en esa diferencia fija**. Cambia la diferencia → se manda la nueva al editar.
**Justificación**: coherencia con las tomas de medicamentos y sin tablas de zonas horarias. México ya casi no cambia de hora; un viaje se atiende editando.
**Alternativas**: guardar el nombre de la zona (IANA) → más correcto en viajes, pero el cliente no manda hoy ese dato y habría que hacerlo en toda la app.

## R4 — Pausar, editar y finalizar = borrar las tomas **futuras sin marcar** y regenerar

**Decisión**: una toma está «en el futuro» si `scheduled_at > now()` del servidor y no está marcada. Esas filas se borran al **pausar**, **finalizar** y **editar**
(esta última, además, regenera con los parámetros nuevos). Las pasadas y las marcadas **nunca** se tocan ni se borran (FR-006, SC-006). Reanudar regenera desde
ahora, sin tomas atrasadas. Una toma futura no tiene aviso reclamado, así que no hay filas de `supplement_dose_reminders` que pierdan su referencia.
**Justificación**: una sola regla para tres acciones, fácil de probar y sin estados derivados («pausada desde…» no hay que cruzarla con cada toma). Una toma
que aún no llegó no es un registro del padre.
**Alternativas**: dejarlas y marcarlas `canceled` (como la 016) → exige derivar el estado con el historial de pausas; descartada por complejidad.
**Nota para el mock**: el diálogo D5 dice «las de hoy que no estén marcadas dejan de aparecer»; con esta regla desaparecen las **que aún no llegan**; las
de hoy que ya pasaron sin marcar se quedan como «sin registrar» (un registro). Se ajusta el texto del diálogo y se avisa como desviación.

## R5 — Estado de la toma: la regla de la 013, con la cadencia de la rutina

**Decisión**: `pending` antes de su hora, `due` desde su hora, `taken` si está marcada, `unregistered` cuando llegó **la siguiente toma de su rutina** (la
siguiente fila en `scheduled_at`) y sigue sin marcar; si no hay siguiente (rutina pausada o terminada), `unregistered` pasadas **24 horas**. Se calcula en el
servidor con su reloj (como `consultation.StatusAt`) y se manda como `status`.
**Justificación**: misma noción y mismos chips que ya conocen los padres; «sin registrar» nunca es rojo ni ámbar (Principio I).
**Alternativas**: usar una frecuencia fija por rutina → no vale para «08:00 y 20:00» ni para días de la semana.

## R6 — El plan lo decide el servidor, en la misma transacción

**Decisión**: crear, editar y reanudar leen `accounts.plan` de la cuenta **dueña del hijo** con la fila bloqueada (`FOR UPDATE`, como `checkPlan` de la 030);
si no es `paid` → 422 `freemium_consultation_limit_exceeded` con `reason: "supplements"`. **Pausar y finalizar** siempre se permiten a quien puede todo
(detener nunca se cobra). Marcar/desmarcar, ver y «Tus avisos» nunca dependen del plan. El tope (10 activas por hijo, las pausadas no cuentan) se cuenta bajo
el mismo bloqueo → 422 `routine_limit_exceeded` con `limit`.
**Justificación**: mismo patrón de las specs 030/031; sin carrera entre dos dispositivos. Los avisos de lo ya creado **siguen** al bajar de plan (FR-020).
**Alternativas**: comprobar el plan en el cliente → no es una regla.

## R7 — Acceso por niveles, con un resolvedor más

**Decisión**: `access.Repository.OnRoutine(clerkUser, routineID)` (la rutina → su hijo → la familia, el mismo `levelCase`). Rutas: ver y marcar y «Tus avisos» =
`Mark`; crear, editar, pausar, reanudar, finalizar = `Full`. Un Tutor de una familia que dejó de pagar baja a `Mark` solo (ya lo hace `levelCase`), de modo que
edita **solo** quien puede todo y paga.
**Justificación**: cero reglas nuevas de permisos; la 032 ya hace que un Cuidador no pueda crear ni editar.
**Alternativas**: reglas propias de rutinas → duplicarían `levelCase`.

## R8 — Avisos: un segundo reclamo por persona y «Tus avisos» como silencio por persona y rutina

**Decisión**: `ClaimDueDoses` sigue igual para medicamentos y se agrega `ClaimDueSupplementDoses` con la **misma forma** (candidatas → pares `(toma, persona)` →
`INSERT … ON CONFLICT DO NOTHING RETURNING` en `supplement_dose_reminders`): destinatarios = cuentas con ≥ `Mark` sobre el hijo, con dispositivo activo
activado antes de la toma y **sin silencio** en `supplement_muted(routine_id, account_id)`. `Tick` junta los dos resultados y manda con el mismo envío. El aviso
lleva `routineId` (no `consultationId`) y su texto con detalle dice nombre de la rutina e hijo; el genérico no lleva nada.
**«Tus avisos»** = una fila en `supplement_muted` cuando la persona los apaga; sin fila = encendidos. Cada quien decide por sí misma (también un Cuidador).
**«Tomada» desde el aviso**: `MarkTakenByAction` busca la toma en `doses` y, si no está, en `supplement_doses`; el token no cambia.
**Justificación**: la garantía «a lo más un aviso por toma y persona» sale de la llave primaria, como en la 032; reutiliza dispositivos y envío.
**Alternativas**: una sola tabla de recordatorios polimórfica → obliga a cambiar la llave primaria de `dose_reminders` en producción.

## R9 — «Tomas de hoy» y el resumen incluyen las de suplemento

**Decisión**: `GET /children/{id}/overview` agrega a `doses` las tomas de suplemento de la ventana, con `kind: "supplement"`, `routineId` y el nombre de la rutina
en `medicationName` (así el chip y los contadores actuales funcionan sin cambio de forma); las de medicamento llevan `kind: "medication"`. No cuentan como
«Tratamiento activo». El home y la tarjeta del hijo cuentan «tomas hoy» con ambas.
**Justificación**: es lo que el mock T1/T2 dibuja y lo que evita dar dos veces. Compatible hacia atrás: el campo nuevo es opcional para clientes viejos.

## R10 — Rutas y pantallas

**Decisión**: backend `GET|POST /children/{childId}/routines`, `GET|PATCH /routines/{routineId}`, `POST /routines/{routineId}/pause|resume|finish`,
`PATCH /routines/{routineId}/doses/{doseId}`, `PUT /routines/{routineId}/my-reminders`. Frontend (español, como `/familia`): `/children/:childId/suplementos/nueva`,
`/suplementos/:routineId`, `/suplementos/:routineId/editar`; la sección «Suplementos» va en `ChildDetailPage`. Todo en `features/supplements/`. El aviso apunta a
`/suplementos/:routineId`.
**Justificación**: el mock tiene sección, formulario en **página** (no modal, B12), detalle y diálogo de finalizar.

## R11 — Privacidad

**Decisión**: el nombre y la nota de la rutina viajan solo en cuerpos JSON (nunca en la dirección ni en `error_logs`); los mensajes de error no los repiten; el aviso
genérico no lleva rutina, hijo ni doctor; el texto de «Antes de empezar» se actualiza (suplementos) y se sube `CurrentDisclaimerVersion` al desplegar esta parte.

## R12 — Puerta abierta para las partes 2 y 3

**Decisión**: `supplement_routines` lleva `account_id` (cuenta dueña) y `child_id` **nulo permitido**: la parte 1 siempre lo llena y valida; la parte 3 (rutina
personal) lo deja nulo y solo la dueña la ve. La próxima cita (parte 2) es otra tabla ligada a `consultations`. Nada de la parte 1 asume lo contrario.

## R13 — Pruebas

Matriz rol × ruta en `router_test.go`; generador de tomas con pruebas de tabla (diaria, días de semana, cada N horas, fin, desplazamiento, medianoche, horizonte);
carreras (tope de 10 bajo bloqueo, dos marcas a la vez, dos pestañas pausando); avisos por persona con silencio; privacidad (nada en direcciones ni `error_logs`);
Vitest de los componentes y de `scheduleText`; E2E a 390 y 1280 px con dos sesiones (Tutor y Cuidador).
