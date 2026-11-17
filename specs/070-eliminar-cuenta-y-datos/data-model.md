# Modelo de Datos: Eliminar la cuenta y descargar todos mis datos (spec 070)

## Migración `0037_account_deletions.sql`

### Tabla nueva `account_deletions`

Una fila por solicitud. **Sin llave foránea a `accounts`**: la fila sobrevive al borrado como constancia (FR-018). Nunca guarda nombres, correos ni datos de salud.

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK, `gen_random_uuid()` | |
| `account_id` | `uuid` NOT NULL | La cuenta. Al completarse queda como único rastro: un UUID aleatorio. |
| `clerk_user_id` | `text` NULL | Para borrar el usuario de Clerk; se vacía al completar. |
| `requested_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `scheduled_for` | `timestamptz` NOT NULL | `requested_at + interval '30 days'` (FR-010). |
| `canceled_at` | `timestamptz` NULL | La persona canceló dentro del plazo. |
| `completed_at` | `timestamptz` NULL | El borrado real terminó. |
| `attempts` | `int` NOT NULL DEFAULT 0 | Intentos del borrado real (R6). |
| `last_attempt_at` | `timestamptz` NULL | |

Restricciones:

- `CHECK (scheduled_for > requested_at)`
- `CHECK (canceled_at IS NULL OR completed_at IS NULL)`: cancelada o completada, nunca las dos.
- `CHECK (completed_at IS NULL OR clerk_user_id IS NULL)`: al completar no queda el usuario de Clerk.
- **Índice único parcial** `account_deletions_one_open ON (account_id) WHERE canceled_at IS NULL AND completed_at IS NULL`: una solicitud abierta por cuenta.
- Índice `account_deletions_due ON (scheduled_for) WHERE canceled_at IS NULL AND completed_at IS NULL`, para el barrido.

**Estados (derivados)**:

| Estado | Condición |
|---|---|
| `pending` | `canceled_at IS NULL AND completed_at IS NULL` |
| `canceled` | `canceled_at IS NOT NULL` |
| `completed` | `completed_at IS NOT NULL` |

Transiciones: `pending → canceled` (la persona, antes de `scheduled_for`) y `pending → completed` (el barrido, después). Una cuenta cancelada puede volver a pedir: se crea otra fila.

### Autoría opcional en datos ajenos

Quitar `NOT NULL` (R1) para poder borrar a una persona invitada sin borrar lo que creó en los hijos de la familia:

- `supplement_routines.created_by_account_id`
- `consultation_appointments.created_by_account_id`
- `vaccine_records.created_by_account_id`
- `vaccine_card_photos.created_by_account_id`
- `growth_measurements.created_by_account_id`
- `medicine_cabinet_items.created_by_account_id`
- `child_device_links.created_by_account_id`
- `family_members.invited_by_account_id`
- `family_invitations.invited_by_account_id`

Las demás columnas de autoría (`taken_by_account_id`, `corrected_by_account_id`, `updated_by_account_id`, `edited_by_account_id`, `status_by_account_id`, `revoked_by_account_id`, `ended_by_account_id`, `consent_by_account_id`) ya son nulas. Ninguna CHECK existente se rompe: la de rutinas personales (`child_id IS NOT NULL OR account_id = created_by_account_id`) solo aplica a filas propias, que se borran enteras.

## Qué se borra y qué se conserva (FR-013, FR-015)

**Cuenta A** que se elimina; **C** = sus hijos.

| Datos | Qué pasa |
|---|---|
| Todo lo que cuelga de A o de C (consultas, tomas, fotos, citas, rutinas, vacunas, medidas, botiquín, dispositivos, teléfonos de C, familia de A, sus invitaciones, aceptaciones del aviso, suscripciones, eventos de pago) | **Se borra**, en una transacción, de las hojas a la raíz (R1). |
| La membresía de A en la familia de otra persona y sus «Tus avisos» ahí | **Se borra** (A sale de la familia). |
| Lo que A marcó o creó en hijos de otra cuenta | **Se conserva sin autor** (`… = NULL`). La toma sigue marcada y conserva `taken_at`. |
| `error_logs.account_id = A` | Se pone en **NULL**. La fila (mensaje fijo, endpoint) se queda. |
| `account_deletions` de A | Queda con `completed_at`, sin `clerk_user_id`. |
| El usuario de A en Clerk | **Se borra** antes que la base (R6). |
| Copias cifradas de los respaldos (spec 069) | No se editan; caducan por su retención (máximo 6 meses). Después de restaurar, `reconcile-deleted` vuelve a borrar (R7). |

## Lo que se deriva de una solicitud abierta (R3)

Nada de esto se guarda: se calcula en cada petición, así que cancelar lo deshace todo.

- **La cuenta A**: solo puede usar las rutas permitidas; las demás responden 409 `account_deletion_pending`. No recibe recordatorios.
- **Las personas invitadas por A**: su nivel sobre los hijos de A baja a `Mark`; invitar o aceptar en esa familia responde 409 `family_deletion_pending`.
- **`GET /accounts/me`**:
  - de A trae `deletion: {scheduledFor}`;
  - de cada persona invitada trae `family.deletionScheduledFor`.

## El archivo de datos (R8)

No se guarda. Se arma en cada petición con lo que A tiene en ese momento:

```text
peditrack-datos-2026-11-12.zip
├── LEEME.txt
├── datos.json
├── hijos.csv
├── consultas.csv            (de los hijos y propias; columna "de": hijo o titular)
├── medicamentos.csv
├── tomas.csv                (estado, hora, quién marcó: nombre de pila)
├── citas.csv
├── vacunas.csv
├── crecimiento.csv
├── suplementos_y_actividades.csv
├── tomas_de_rutinas.csv
├── botiquin.csv
└── fotos/
    ├── recetas/<consultationId>.<jpg|png|…>
    ├── cartilla/<photoId>.<…>
    └── botiquin/<itemId>.<…>
```

Fechas en ISO 8601 con la zona. Solo lo registrado, tal cual (FR-005): sin estados de alerta ni interpretaciones. El estado de una toma (`pending`/`due`/`taken`/`unregistered`/`canceled`) va como lo muestra la app.
