# Contrato: `GET /children/{childId}/consultations`

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), los nombres de campo
> del JSON están en inglés. La prosa explicativa se mantiene en español.

Obtiene el listado de consultas médicas de un hijo, para poblar la pantalla de detalle (FR-001).

## Request

Sin cuerpo. `childId` es un UUID en la ruta.

## Responses

### 200 OK

```json
{
  "childId": "uuid",
  "consultations": [
    {
      "id": "uuid",
      "doctorName": "string",
      "consultDate": "string (YYYY-MM-DD)"
    }
  ]
}
```

Ordenadas de la más reciente a la más antigua (FR-001). `consultations` es `[]` (no `null`) cuando el hijo no tiene ninguna consulta — el frontend usa esto para decidir el estado vacío (FR-002).

### 404 Not Found

Cuando `childId` no corresponde a ningún hijo existente (mismo tratamiento que un `accountId`/`childId` inválido en specs/003 — 404, nunca un error críptico).

```json
{
  "error": "child_not_found",
  "message": "Child not found"
}
```

## Notas de contrato

- Sin autenticación — continúa la misma postura de specs/003-home-listado-hijos.
- No incluye la foto ni los medicamentos de cada consulta (esos solo se devuelven en el detalle, `GET /consultations/{consultationId}`) — mantiene el listado liviano.
