# Plan: Suplementos y Actividades por separado (spec 035)

**Rama**: `feature/035-actividades-y-suplementos` · **Spec**: [spec.md](./spec.md) · **Diseño**: [referencia/actividades-decisiones.md](./referencia/actividades-decisiones.md) y el mock `Actividades PediTrack.dc.html` (+ `SuplementoTarjeta`, `ActividadTarjeta`, `RegistroSeccion`, `SuplementoDetalle`, `ActividadDetalle`, `ActividadForm`).

## Resumen

Se reutilizan las tablas de la parte 1 (`supplement_routines`, `supplement_doses`, avisos, silencios, cupos, acceso y plan): una **actividad** es una rutina de otro **tipo**. Cambia la forma de calcular sus tomas (por ventana del día), se quita el periodo `interval`, y el frontend separa las dos secciones, rediseña la tarjeta y el detalle del suplemento (sin calendario) y agrega la tarjeta, el detalle y el formulario de la actividad.

## Backend

- **Migración `0022`**: `kind` (`supplement`|`activity`, por omisión `supplement`), `window_start`, `window_end`, `interval_minutes`; se retiran `interval_hours` y `first_time`; el `CHECK` de forma de periodo se rehace (suplemento: `daily`/`weekdays`; actividad: `window`); las rutinas `interval` existentes pasan a actividad (`window_start = first_time` acotada a 23:58, `window_end = 23:59`, `interval_minutes = interval_hours * 60`, todos los días), se borran sus tomas futuras sin marcar y sin aviso y `generated_until = now()` para que el planificador las regenere; índices de tope por tipo.
- **Modelo y generador** (`internal/supplement`): `Kind`, `PeriodWindow`; `Generate` calcula la ventana por día local (respeta días y fechas); `validate.go` por tipo.
- **Tope por tipo** (`checkActiveCap`, `checkPersonalCap`, `Resume`) y **listas por tipo** (`ListByChild`, `ListPersonal`, parámetro `kind` en el handler, por omisión suplemento).
- **`POST /routines/{id}/done`** (`Repository.MarkNext`): `UPDATE … WHERE id = (SELECT … ORDER BY scheduled_at LIMIT 1 FOR UPDATE SKIP LOCKED)`, nivel `Mark`, sin plan; 409 `nothing_to_mark`.
- **Overview** (`overview_supplements.go`): solo `kind = 'supplement'`.
- **Avisos** (`internal/reminder`): `ClaimDueSupplementDoses` lee el tipo; `SourceActivity`; el payload de una actividad lleva `source: "activity"` (la acción «Realizado» y el texto los pone el dispositivo). La acción con ficha marca la toma igual.
- Respuestas: `kind`, `windowStart`, `windowEnd`, `intervalMinutes`; sin `intervalHours` ni `firstTime`. Swagger regenerado; fila nueva en `router_test.go`.

## Frontend

- **Tipos y API**: `kind`, ventana; `fetchRoutines(…, kind)`, `fetchPersonalRoutines(…, kind)`, `markNextDone`; hooks por tipo.
- **Texto** (`scheduleText.ts`): suplemento «Todos los días · 6 tomas», actividad «Cada hora, de 08:00 a 20:00» / «Cada 30 min, de 09:00 a 18:00»; se retira todo lo de «cada N horas» y el calendario (`RoutineCalendar`).
- **`RegistroSeccion`** (`kind`, `scope`) reemplaza `SupplementsSection` y `MisSuplementosSeccion`; `SuplementoTarjeta` y `ActividadTarjeta` reemplazan `RoutineCard`; el detalle se divide en `SuplementoDetallePage` (sin calendario) y `ActividadDetallePage` («Realizado», «Quitar la última marca», próxima y última); formulario de suplemento (sin «cada N horas», horas vacías) y `ActividadForm` (con vista previa de avisos).
- **Rutas**: `/children/:id/suplementos/nueva`, `/children/:id/actividades/nueva`, `/suplementos/:id` y `/editar`, `/actividades/:id` y `/editar`, `/mis-suplementos` y `/nueva`, `/mis-actividades` y `/nueva`; un detalle abierto con el tipo equivocado redirige al correcto (los avisos antiguos apuntan a `/suplementos/:id`).
- **Inicio y barra lateral**: «Personal · solo lo ves tú» con «Mis suplementos» (panel de tomas) y «Mis actividades» («Tus actividades de hoy», «Realizado» por fila); grupo «Personal» con las dos entradas; «Tus avisos» también en lo personal.
- **Aviso push**: `notification.ts` con `source: "activity"` (títulos del diseño, acción «Realizado»).

## No se adopta del diseño (se anota en `BACKLOG.md`)

«← Tus hijos» → «← Inicio» (B16): el inicio sigue llamándose «Tus hijos» hasta que se decida la propuesta de la parte 3 de la spec 033.

## Verificación de la constitución

I (sin ejemplos ni evaluación del progreso), II (el aviso genérico sin nombre), IV (plan caducado: todo se ve y se marca), VI (>90 %, E2E a 390 y 1280 px con dos sesiones).
