# Modelo de datos: Primer uso guiado

## Migración `0038_first_use_guide.sql`

**Se aplica en DEV antes de desplegar el backend nuevo** (a mano, como las anteriores).

```sql
-- specs/071-primer-uso-guiado: the first-use guide on the home.
-- NULL = the guide is not closed; a date = the account closed it with «Ahora no» (reopening sets it back to NULL).
ALTER TABLE accounts ADD COLUMN first_use_guide_dismissed_at timestamptz NULL;

-- GET /accounts/me now tells whether the account has a consultation (its oldest one): one index over every
-- consultation of the account, a child's or its own.
CREATE INDEX consultations_account_created ON consultations (account_id, created_at, id);
```

- Sin datos de salud. Sin relleno: toda cuenta existente empieza con la guía sin cerrar (la verá si cumple FR-024 y no la completó en ese dispositivo).
- El borrado de la cuenta (spec 070) borra la fila de `accounts` completa: no hace falta un paso nuevo en `purge.go`.
- La descarga de datos (spec 070): si exporta las columnas de `accounts` por lista, agregar `first_use_guide_dismissed_at`.

## Estado por cuenta (servidor)

| Campo | Origen | Regla |
|---|---|---|
| `dismissed` | `accounts.first_use_guide_dismissed_at IS NOT NULL` | Lo cambia solo la dueña con el `PUT` (contrato). |
| `firstConsultation` | la consulta más antigua con `consultations.account_id = cuenta`, por `created_at, id` | `null` si la cuenta no tiene consultas. Incluye las de sus hijos y las propias, «solo registro» incluidas. Nunca cambia de hecho a pendiente (las consultas no se borran). |

`firstConsultation` = `{ id, doctorName, childId }` (`childId` nulo para una consulta propia; el frontend arma «Ver consulta» con `/consultations/:id` o la ruta de la propia).

## Estado por dispositivo (navegador)

| Dato | Dónde | Regla |
|---|---|---|
| Guía completa en este dispositivo | `localStorage` `peditrack.firstUse.done.<accountId>` = `"1"` | Se escribe cuando todos los pasos mostrados están hechos. Desde ahí: la despedida una vez (8 s o al salir) y después nada. |
| Instalada | `display-mode: standalone` o `navigator.standalone` | Se lee al abrir; nunca se guarda. |
| Puede instalar | evento `beforeinstallprompt` guardado desde el arranque | Desaparece al instalar (`appinstalled`). |
| Recordatorios | el estado del hook de recordatorios existente | `on` / `off` / `denied` / `ios-needs-install` / `unsupported` / `unavailable` / `loading`. |

## Lógica de los pasos (función pura `guideSteps`)

Entradas: `platform` (`android` · `ios-safari` · `ios-other` · `desktop`), `installed`, `canInstall`, `reminders` (estado de arriba), `firstConsultation`, `ownChildren` (cuántos).

| Paso | Hecho | Pendiente | Bloqueado | No se muestra |
|---|---|---|---|---|
| 1 Consulta | `firstConsultation != null` | si no | — | — |
| 2 Instalar | `installed` | `android` (botón si `canInstall`, si no instrucciones del menú) · `ios-safari` (instrucciones) · `ios-other` («Abrir en Safari») · `desktop` con `canInstall` (Opcional) | — | `desktop` sin `canInstall` y sin instalar |
| 3 Avisos | `reminders = on` | `off`, `denied` (instrucciones + «Ya los activé») | `ios-needs-install` | `unsupported`, `unavailable` |

- Numeración: 1..n según los pasos mostrados. Subtítulo: «Tres pasos…» o «Dos pasos…» (o uno).
- Botón sólido: el primer paso pendiente con botón que no sea opcional ni bloqueado; el resto, contorno.
- Mientras `reminders = loading`, el paso 3 se muestra pendiente sin botón (no salta el diseño).

## Cuándo se ve la guía (función pura `guideVisibility`)

`hidden` si: sin hijo propio, cuenta en pausa, aviso sin confirmar (la ventana va primero) o `dismissed`. Si no: `done-line` si todos los pasos mostrados están hechos y el dispositivo aún no tiene la marca de completa (se escribe la marca y se muestra la línea); `gone` si ya la tiene; `card` en otro caso. La fila «Primeros pasos · Ver guía» aparece solo con `dismissed` y la guía no completa en el dispositivo.
