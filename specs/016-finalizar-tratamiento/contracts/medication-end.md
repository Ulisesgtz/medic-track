# Contrato: finalizar tratamiento (spec 016)

## `POST /consultations/{consultationId}/medications/{medicationId}/end` (nuevo, solo el dueño)

Sin cuerpo. `RequireOwner` de la consulta (401 sin sesión, 403 de otra cuenta).

- `200 OK`: la medicación como en el detalle, con `endedAt` (ISO-8601) y sus tomas con `status`. **Idempotente**: si ya
  estaba terminada devuelve la misma `endedAt`.
- `404 medication_not_found`: no existe o no es de esa consulta.
- `400 validation_error` (`details[{field: "medicationId", message: "nothing_to_end"}]`): no tiene tomas por delante.

## `GET /consultations/{id}` y `POST /children/{id}/consultations` (cambian)

Cada medicación gana `"endedAt": "2026-09-30T14:02:00Z" | null`; `doses[].status` gana `"canceled"`.

## `GET /children/{childId}/overview` (cambia)

Sin tomas canceladas entre `doses`; `activeTreatment` ignora las medicaciones terminadas.
