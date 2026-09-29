# Modelo de Datos: Tomas "sin registrar" automáticas

**Sin cambios en la base de datos.** El estado se deriva (research R1, R2).

## Estado de una toma (derivado)

Con `ahora` = reloj del servidor, `hora` = `doses.scheduled_at`, `f` = `medications.frequency_hours`:

| Estado | JSON `status` | Regla |
|---|---|---|
| Tomada | `taken` | `doses.taken = true` |
| Pendiente | `pending` | no tomada y `ahora < hora` |
| Por marcar | `due` | no tomada y `hora <= ahora < hora + f horas` |
| Sin registrar | `unregistered` | no tomada y `ahora >= hora + f horas` |

`hora + f` es la hora de la siguiente toma del mismo medicamento (las tomas van separadas por `f`); para la última, es
cuando tocaría la siguiente (FR-002).

## En Go (`internal/consultation`)

- `DoseStatus` (`"pending" | "due" | "taken" | "unregistered"`) y `StatusAt(scheduledAt, taken, frequencyHours, now)`.
- `Dose` y `DoseOverview` ganan `Status`, calculado al leer (detalle, overview, `UpdateDoseStatus`) con el `now` del
  servicio; `DoseOverview` necesita la frecuencia del medicamento en su consulta.

## En el frontend (`features/consultations/types.ts`)

- `DoseStatus` y `status` en `Dose` y `OverviewDose`. `taken` se conserva (la marca del padre).
