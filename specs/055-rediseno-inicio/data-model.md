# Modelo de datos: Rediseño del inicio (spec 055)

**Sin migración ni tablas nuevas.** El inicio arma, en el teléfono o el navegador, dos vistas derivadas de las respuestas que
ya existen (ver `research.md` R1). Nada se guarda.

## ChildDay (por hijo y día local) — `home/daySummary.ts`

| Campo | Tipo | De dónde sale |
|---|---|---|
| `medications` | `{ total, toMark, unregistered, marked } \| null` | tomas del overview con `kind !== 'supplement'` y `status !== 'canceled'`; `null` si no hay ninguna (la fila no se muestra) |
| `supplements` | `{ marked, total } \| null` | tomas del overview con `kind === 'supplement'` y `status !== 'canceled'` |
| `activities` | `{ done, total } \| null` | tomas de hoy de las rutinas `kind=activity` con `status === 'active'` |
| `next` | `OverviewDose \| null` | la toma más temprana de medicamento o suplemento con `status` `pending` o `due` |
| `state` | `'pend' \| 'ok' \| 'vacio' \| 'sinreg'` | `sinreg` si `unregistered > 0`; si no `pend` si hay por marcar; si no `ok` si hay algo hoy; si no `vacio` |
| `unregisteredText` | `string \| null` | la primera sin registrar: «Paracetamol · 08:00 · sin registrar» |

Reglas: `toMark` = `pending` + `due`; `marked` = `taken`. El estado lo decide el **servidor** (`status`): la tarjeta nunca usa
el reloj del teléfono para decidir si una toma «ya pasó».

## PersonalDay — `home/daySummary.ts`

| Campo | Tipo | De dónde sale |
|---|---|---|
| `doses` | `{ marked, total, next: { name, time } \| null } \| null` | tomas de hoy de los suplementos personales activos |
| `activities` | `{ done, total, next: { name, time, routineId } \| null } \| null` | actividades personales activas; «✓ Realizado» marca con `POST /routines/{id}/done` (spec 035) |
| `allMarked` | `boolean` | nada por marcar que ya haya llegado |
| `mode` | `'card' \| 'todo' \| 'vacio' \| 'plan'` | `plan` = plan gratuito (lo dice el servidor con `paidPlan`); `vacio` = sin rutinas personales; `todo` = `allMarked`; si no `card` |

Con varias actividades personales, «✓ Realizado» de «Tu día» marca la de la **próxima** toma (la más temprana sin marcar).

## Llaves de consulta (compartidas con el detalle)

- `['overview', childId, day.from.toISOString()]` — ya existe.
- `['routines', childId, 'activity', day]` — ya existe (`useRoutines`).
- `['routines', 'personal', accountId, kind, day]` — ya existe (`usePersonalRoutines`).

Todas se refrescan cada 60 s (spec 013) y al volver al primer plano.
