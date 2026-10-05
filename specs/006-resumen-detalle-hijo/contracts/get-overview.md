# Contrato: `GET /children/{childId}/overview`

> Los nombres de campo del JSON están en inglés (Principio de "Idioma del Código"); la prosa, en español.

Devuelve las tomas de un hijo dentro de un rango de tiempo (el "hoy" del padre) y el tratamiento que sigue
vigente. Alimenta las tarjetas de resumen y el panel *Tomas de hoy* del detalle del hijo (spec 006).

## Request

`childId` es un UUID en la ruta. Query obligatoria:

| Parámetro | Formato | Nota |
|---|---|---|
| `from` | RFC 3339 | Inicio del rango (incluido). El cliente envía la medianoche local. |
| `to` | RFC 3339 | Fin del rango (excluido). Debe ser posterior a `from` y a lo sumo 48 h después. |

## Responses

### 200 OK

```json
{
  "childId": "uuid",
  "doses": [
    {
      "id": "uuid",
      "consultationId": "uuid",
      "medicationName": "Amoxicilina",
      "scheduledAt": "2026-09-18T16:00:00-06:00",
      "taken": false
    }
  ],
  "activeTreatment": {
    "medicationName": "Amoxicilina",
    "endsAt": "2026-09-23T00:00:00-06:00",
    "otherCount": 1
  }
}
```

- `doses` son las tomas de **todas** las consultas del hijo con `scheduledAt` en `[from, to)`, ordenadas por hora y
  nombre de medicamento. Es `[]` (no `null`) si no hay ninguna.
- `activeTreatment` es `null` si ningún medicamento tiene tomas después de "ahora" (hora del servidor). Si hay
  varios, es el de la última toma más lejana; `endsAt` es esa última toma y `otherCount` cuántos más siguen
  vigentes. Se deriva solo del calendario de tomas.
- Marcar o desmarcar una toma usa el `PATCH /consultations/{consultationId}/doses/{doseId}` existente.

### 400 Bad Request

`from` o `to` ausentes o que no son RFC 3339, `to` no posterior a `from`, o rango mayor a 48 h.

```json
{
  "error": "validation_error",
  "message": "One or more fields are invalid",
  "details": [{ "field": "to", "message": "the window cannot exceed 48 hours" }]
}
```

### 404 Not Found

`childId` inexistente o que no es un UUID.

```json
{ "error": "child_not_found", "message": "Child not found" }
```
