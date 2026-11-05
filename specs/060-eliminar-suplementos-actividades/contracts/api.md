# Contrato del API: Eliminar suplementos y actividades

Detrás de `RequireSession`, escrito por `*httpx.Responder`, **no** bajo `/child-device`.

## `DELETE /routines/{routineId}` — `fullRoutine`

Sin cuerpo.

- `204` — borrados la rutina, sus tomas, sus recordatorios (personas y teléfono del hijo) y «Tus avisos».
- `409 {"error":"routine_has_marks","message":"A routine with marked doses is finished, not deleted"}` — alguna toma está marcada;
  no se borra nada.
- `404 routine_not_found` — no existe (o ya se borró) o el id está mal formado.
- `403` — la sesión no tiene nivel `Full` (Cuidador, Tutor de familia vencida, la rutina personal de otra persona).
- `401` — sin sesión.

Cualquier plan: no responde 422.

## Cambia la respuesta

`GET /routines/{routineId}`, `GET /children/{childId}/routines`, `GET /accounts/{accountId}/routines` y las respuestas de las
acciones de una rutina ganan `hasMarks: boolean`.
