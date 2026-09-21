# Contrato: `POST /children/{childId}/consultations`

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Registra una consulta médica nueva para un hijo (FR-003, FR-004).

## Request

```json
{
  "doctorName": "string (requerido)",
  "consultDate": "string ISO-8601 date (requerido, no futura)",
  "utcOffsetMinutes": "integer entre -840 y 840 (opcional, por omisión 0 = UTC; spec 006 — el `startTime` de cada medicamento se lee en ese desfase para que las tomas sean instantes reales)",
  "photoBase64": "string (requerido — foto codificada en base64, máx. 8 MB decodificada)",
  "symptoms": "string (opcional, default '')",
  "medications": [
    {
      "name": "string (requerido)",
      "frequencyHours": "number (requerido, entero positivo)",
      "durationDays": "number (requerido, entero positivo)",
      "startTime": "string HH:MM (obligatorio — de él se generan todas las tomas; sin él, 400 validation_error en medications[i].startTime)"
    }
  ]
}
```

`medications` DEBE tener al menos un elemento (FR-015).

## Responses

### 201 Created

Devuelve el detalle completo de la consulta recién creada, mismo cuerpo que `GET /consultations/{consultationId}` (contracts/get-consultation-detail.md) — así el frontend puede navegar directo a su detalle sin una segunda petición.

### 400 Bad Request — validación de campos

```json
{
  "error": "validation_error",
  "message": "One or more fields are invalid",
  "details": [
    { "field": "medications[0].frequencyHours", "message": "must be a positive integer" }
  ]
}
```

Casos que producen esta respuesta: campos requeridos faltantes, `consultDate` futura, `medications` vacío (FR-015), `frequencyHours`/`durationDays` no positivos, foto ausente o que excede 8 MB.

### 404 Not Found

Si `childId` no corresponde a ningún hijo existente.

```json
{
  "error": "child_not_found",
  "message": "Child not found"
}
```

## Notas de contrato

- La foto viaja codificada en base64 dentro del JSON (research.md) — se decodifica y persiste como `bytea` server-side.
- El OCR (FR-006) corre enteramente en el navegador antes de este request — el backend nunca recibe ni produce sugerencias de OCR, solo persiste los valores finales que el padre confirmó en el formulario.
- Todas las tomas esperadas de cada medicamento con `startTime` se generan en la misma transacción que crea la consulta (research.md) — no hay un paso separado para esto.
- Una vez creada, esta consulta es inmutable (FR-014) — no existe `PUT`/`PATCH`/`DELETE` para la consulta ni sus medicamentos en este alcance (solo `PATCH .../doses/{doseId}`, ver contracts/patch-dose.md).
