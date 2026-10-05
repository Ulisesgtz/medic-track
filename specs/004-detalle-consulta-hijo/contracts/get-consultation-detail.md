# Contrato: `GET /consultations/{consultationId}`

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Obtiene el detalle completo de una consulta: receta, medicamentos, tomas marcables y síntomas
(FR-013).

## Request

Sin cuerpo. `consultationId` es un UUID en la ruta.

## Responses

### 200 OK

```json
{
  "id": "uuid",
  "childId": "uuid",
  "doctorName": "string",
  "consultDate": "string (YYYY-MM-DD)",
  "photoBase64": "string (la foto, codificada en base64)",
  "symptoms": "string",
  "medications": [
    {
      "id": "uuid",
      "name": "string",
      "frequencyHours": "number",
      "durationDays": "number",
      "startTime": "string HH:MM | null",
      "doses": [
        {
          "id": "uuid",
          "scheduledAt": "string ISO-8601 datetime",
          "taken": "boolean"
        }
      ]
    }
  ]
}
```

`doses` es `[]` cuando el medicamento no tiene `startTime` definido (FR-010) — nunca `null`.
`doses` viene ordenado por `scheduledAt` ascendente.

### 404 Not Found

Cuando `consultationId` no corresponde a ninguna consulta existente.

```json
{
  "error": "consultation_not_found",
  "message": "Consultation not found"
}
```

## Notas de contrato

- Sin autenticación — continúa la misma postura de specs/003.
- Esta es la única respuesta que incluye la foto completa (el listado de contracts/get-consultations.md no la incluye), para no cargar bytes innecesarios en la pantalla de listado.
