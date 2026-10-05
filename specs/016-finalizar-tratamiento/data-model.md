# Modelo de Datos: Finalizar tratamiento

Migración `backend/migrations/0013_add_medication_ended_at.sql`:

```sql
ALTER TABLE medications ADD COLUMN ended_at TIMESTAMPTZ NULL;
```

`NULL` = en curso. Con valor = cuándo el padre confirmó terminarlo. **No se modifica ninguna toma.**

## Estado de una toma (extiende la spec 013)

| Estado | `status` | Regla |
|---|---|---|
| Tomada | `taken` | `taken = true` |
| Cancelada | `canceled` | no marcada, `ended_at` con valor y `scheduled_at > ended_at` |
| Pendiente | `pending` | no marcada y `ahora < scheduled_at` |
| Por marcar | `due` | no marcada y `scheduled_at <= ahora < scheduled_at + f` |
| Sin registrar | `unregistered` | no marcada y `ahora >= scheduled_at + f` |

(Cancelada se evalúa antes que pendiente, por marcar y sin registrar.)

## Go (`internal/consultation`)

- `Medication.EndedAt *time.Time`; `StatusAt(scheduledAt, taken, frequencyHours, endedAt, now)`; `DoseStatusCanceled`.
- `Repository.EndTreatment(ctx, consultationID, medicationID)` idempotente; `ErrMedicationNotFound`, `ErrNothingToEnd`.

## Frontend

`Medication.endedAt: string | null`; `DoseStatus` gana `'canceled'`; `medicationProgress` excluye las canceladas del total.
