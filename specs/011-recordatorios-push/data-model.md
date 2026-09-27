# Modelo de Datos: Recordatorios de tomas por notificaciones push

Migración `0011_create_reminders.sql`. Tablas y columnas en inglés (convención del proyecto).

## Tabla nueva: `reminder_devices`

Un navegador o PWA instalada en el que un padre activó los recordatorios.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `UUID` PK | `gen_random_uuid()` |
| `account_id` | `UUID` NOT NULL → `accounts(id)` | Cuenta a la que avisa hoy este dispositivo |
| `endpoint` | `TEXT` NOT NULL **UNIQUE** | URL del servicio de avisos del navegador para este dispositivo. Nunca se registra en `error_logs` ni en logs |
| `p256dh` | `TEXT` NOT NULL | Clave pública del dispositivo para cifrar el aviso |
| `auth` | `TEXT` NOT NULL | Secreto de autenticación del dispositivo para el cifrado |
| `active` | `BOOLEAN` NOT NULL DEFAULT `true` | `false` al desactivar, al cerrar sesión o cuando el servicio de avisos responde 404/410 |
| `activated_at` | `TIMESTAMPTZ` NOT NULL DEFAULT `now()` | Se actualiza cada vez que se (re)activa; decide qué tomas le corresponden (R5) |
| `deactivated_at` | `TIMESTAMPTZ` NULL | Cuándo dejó de avisar |

Índice: `idx_reminder_devices_account_active (account_id) WHERE active`.

**Reglas**
- Activar con un `endpoint` existente actualiza esa fila: nueva cuenta (la de la sesión), claves nuevas, `active = true`,
  `activated_at = now()`, `deactivated_at = NULL` (R10: un navegador avisa a una sola cuenta).
- Desactivar: `active = false`, `deactivated_at = now()`. Solo la cuenta dueña puede hacerlo.
- No se borran filas (no hay borrado de cuentas en el proyecto).

## Columna nueva: `accounts.reminder_detail`

| Columna | Tipo | Notas |
|---|---|---|
| `reminder_detail` | `TEXT` NULL, `CHECK (reminder_detail IN ('detailed','generic'))` | `NULL` = aún no elegida (la primera activación la pide, FR-008) |

Se agrega a las respuestas de cuenta como `reminderDetail` (`"detailed" | "generic" | null`).

## Columna nueva: `doses.reminder_sent_at`

| Columna | Tipo | Notas |
|---|---|---|
| `reminder_sent_at` | `TIMESTAMPTZ` NULL | Cuándo se reclamó la toma para avisar (R5/R6). Nunca vuelve a `NULL` |

Índice parcial para la búsqueda de cada vuelta:
`idx_doses_pending_reminder (scheduled_at) WHERE reminder_sent_at IS NULL AND taken = false`.

## Toma a avisar (consulta, no tabla)

Una toma se reclama cuando:
- `taken = false` y `reminder_sent_at IS NULL`;
- `scheduled_at <= now()` y `scheduled_at > now() - interval '60 minutes'`;
- su cuenta (dosis → medicamento → consulta → hijo → cuenta) tiene al menos un `reminder_devices` con `active` y
  `activated_at <= scheduled_at`.

Los datos que se leen para armar el aviso: `doses.id`, `scheduled_at`, `consultations.id`, `medications.name`,
`children.first_name`, `accounts.reminder_detail`, y los dispositivos activos de la cuenta con
`activated_at <= scheduled_at`.

## Token de acción "Tomada" (no se guarda)

Cadena firmada con HMAC-SHA256 (`REMINDER_ACTION_SECRET`) sobre `doseId`, `deviceId` y el vencimiento (24 h). Se valida
al usarse: firma correcta, no vencido, el dispositivo existe, está activo y su cuenta es la dueña de la toma.

## Transiciones

```text
reminder_devices:  (no existe) --activar--> active
                   active --desactivar / cerrar sesión / 404-410--> inactive
                   inactive --activar (mismo endpoint, cualquier cuenta)--> active

doses.reminder_sent_at: NULL --reclamada en una vuelta--> fecha   (irreversible)
doses.taken:            false --"Tomada" desde el aviso o la app--> true   (la app puede volver a false, spec 004)
```
