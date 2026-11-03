# Modelo de Datos: Consultas del titular

Migración `backend/migrations/0032_own_consultations.sql` (una transacción). **Aplicarla en DEV antes del merge.**

## `consultations` (cambia)

| Columna | Antes | Después |
|---|---|---|
| `account_id` | — | `UUID NOT NULL REFERENCES accounts (id)`: la cuenta dueña (la del hijo, o la persona de una consulta propia). Rellenada con `children.account_id` antes del `SET NOT NULL` |
| `child_id` | `UUID NOT NULL REFERENCES children` | `UUID NULL REFERENCES children`: nulo = consulta propia de `account_id` |

Restricciones nuevas:
- `UNIQUE (id, account_id)` (la usan las llaves de abajo).
- `FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id)`: una consulta de un hijo es de la cuenta de ese hijo.
- Índice `idx_consultations_own ON consultations (account_id, consult_date DESC) WHERE child_id IS NULL`.

Reglas:
- `child_id` y `account_id` se fijan al crear y nunca cambian (la edición de la spec 051 no los toca).
- Una consulta propia nunca se borra (FR-007), igual que la de un hijo.

## `consultation_symptoms` (cambia)

- `child_id` pasa a nulo.
- Nueva `FOREIGN KEY (consultation_id, account_id) REFERENCES consultations (id, account_id)`, que se revisa siempre (la de
  `(consultation_id, child_id)` solo cuando hay hijo).
- Se inserta con la cuenta y el hijo **de la consulta**.

## `consultation_appointments` (cambia)

- `child_id` pasa a nulo: sin hijo = cita de la persona de `account_id` (con consulta propia o sin consulta, spec 044).
- Nueva `FOREIGN KEY (consultation_id, account_id) REFERENCES consultations (id, account_id)`.
- Índice `idx_consultation_appointments_own ON consultation_appointments (account_id, starts_at) WHERE child_id IS NULL`.

## `own_consultation_sharing` (nueva)

| Columna | Tipo | Regla |
|---|---|---|
| `account_id` | `UUID PRIMARY KEY REFERENCES accounts (id)` | La persona cuyas consultas propias se comparten |
| `shared` | `BOOLEAN NOT NULL` | Encendido = los Tutores de su familia las ven y marcan (Mark) |
| `changed_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Cuándo cambió por última vez (auditoría) |

Sin fila = apagado. Encender pide una familia de pago con otra persona (R5); apagar siempre.

## `own_consultation_reminder_optins` (nueva)

| Columna | Tipo | Regla |
|---|---|---|
| `consultation_id` | `UUID NOT NULL REFERENCES consultations (id)` | Una consulta propia de otra persona |
| `account_id` | `UUID NOT NULL REFERENCES accounts (id)` | El Tutor que pidió sus avisos |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |
| PK | `(consultation_id, account_id)` | Encender = insertar (idempotente), apagar = borrar |

Solo cuenta mientras el Tutor tenga acceso Mark (R3); sin acceso la fila no hace nada.

## Lo que no cambia

`medications`, `doses`, `medication_extensions`, `dose_reminders`, `child_dose_reminders`, `supplement_routines` y las tablas de
la familia. Las tomas de una consulta propia guardan su autor como siempre (`taken_by_account_id`).

## Nivel de acceso a una consulta propia (derivado, nada guardado)

| Quién pregunta | Interruptor apagado | Interruptor encendido |
|---|---|---|
| La persona dueña | Full | Full |
| Dueña de su familia o Tutor activo de su familia | None | Mark |
| Cuidador, integrante Hijo, quitado, de otra familia, extraño | None | None |
| Teléfono de un hijo | sin ruta | sin ruta |

«Su familia» = la familia de la que la persona es dueña (con algún integrante activo) o de la que es integrante activa.
