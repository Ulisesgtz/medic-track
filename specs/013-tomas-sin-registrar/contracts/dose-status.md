# Contrato: estado de cada toma (spec 013)

> Campos JSON en inglés, prosa en español. Respuestas por `*httpx.Responder`.

Cada toma que devuelve la API gana `status`, calculado por el servidor con su reloj al responder (research R2):

```json
{ "id": "uuid", "scheduledAt": "2026-09-29T14:00:00Z", "taken": false, "status": "unregistered" }
```

`status`: `"pending"` (su hora aún no llega) · `"due"` (por marcar) · `"taken"` · `"unregistered"` (sin registrar: llegó
la hora de la siguiente toma de su medicamento, o su hora + la frecuencia si es la última, y no está marcada).

Aparece en:

| Endpoint | Dónde |
|---|---|
| `GET /consultations/{consultationId}` | `medications[].doses[]` |
| `POST /children/{childId}/consultations` | igual que el detalle |
| `PATCH /consultations/{consultationId}/doses/{doseId}` | la toma devuelta (desmarcar una toma vieja devuelve `unregistered`) |
| `GET /children/{childId}/overview?from=&to=` | `doses[]` |

Sin cambios en requests, códigos de error ni acceso. `taken` sigue siendo el único dato que el padre cambia.

## Recordatorios (spec 011)

`ClaimDueDoses` solo reclama tomas con `scheduled_at + frequency_hours > ahora`: una toma sin registrar nunca se avisa.
