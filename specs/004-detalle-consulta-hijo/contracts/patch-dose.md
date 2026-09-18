# Contrato: `PATCH /consultations/{consultationId}/doses/{doseId}`

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Marca o desmarca una toma esperada como tomada (FR-011, FR-016). Es la única operación de
escritura sobre datos ya persistidos en todo este alcance — todo lo demás (Consultation,
Medication) es inmutable (FR-014).

## Request

```json
{
  "taken": "boolean (requerido)"
}
```

## Responses

### 200 OK

```json
{
  "id": "uuid",
  "scheduledAt": "string ISO-8601 datetime",
  "taken": "boolean"
}
```

### 404 Not Found

Si `consultationId` o `doseId` no existen, o si `doseId` no pertenece a esa `consultationId`.

```json
{
  "error": "dose_not_found",
  "message": "Dose not found"
}
```

## Notas de contrato

- No hay ninguna validación de fecha/estado de tratamiento — una toma se puede marcar/desmarcar sin importar si `scheduledAt` ya pasó o si el tratamiento ya terminó (FR-016, Aclaraciones de spec.md).
- El sistema únicamente persiste el valor de `taken` tal como lo envía el padre — nunca calcula, infiere ni corrige ese valor (Principio I).
