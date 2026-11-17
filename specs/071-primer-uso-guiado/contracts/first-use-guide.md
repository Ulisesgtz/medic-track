# Contrato: guía de primer uso

## 1. Respuesta de la cuenta (cambio compatible)

`GET /accounts/me` y `GET /accounts/{accountId}` suman el campo `firstUseGuide`. Los clientes que no lo conocen lo ignoran.

```json
{
  "id": "…",
  "firstName": "Ana",
  "children": [ … ],
  "disclaimerVersion": "2026-11-02",
  "disclaimerAccepted": true,
  "firstUseGuide": {
    "dismissed": false,
    "firstConsultation": {
      "id": "3f0c…",
      "doctorName": "Dra. López",
      "childId": "9a1b…"
    }
  }
}
```

- `firstConsultation` es `null` si la cuenta no tiene consultas. `childId` es `null` para una consulta propia del titular (spec 058).
- `doctorName` es el texto guardado en la consulta, sin cambios.
- Se calcula para toda cuenta; el frontend decide si la muestra (FR-024).

## 2. Cerrar o reabrir la guía

`PUT /accounts/{accountId}/first-use-guide` — solo la dueña de la cuenta (`ownsAccount`); escribe a través de `*httpx.Responder`.

Petición:

```json
{ "dismissed": true }
```

Respuestas:

| Estado | Cuándo | Cuerpo |
|---|---|---|
| 200 | guardado (también si ya estaba así: idempotente) | `{ "dismissed": true, "firstConsultation": { … } \| null }` |
| 400 `invalid_request` | cuerpo que no es JSON o sin `dismissed` booleano | error de siempre |
| 401 | sin sesión | (no se registra en `error_logs`, como hoy) |
| 403 / 404 | otra cuenta / id malformado o inexistente | como las demás rutas de cuenta |
| 409 `account_deletion_pending` | cuenta en pausa (spec 070): la ruta **no** está en `AllowedWhilePending` | como hoy |

- El cuerpo nunca lleva datos de salud; `error_logs` registra la ruta y el estado como siempre.
- Swagger: anotar el handler y regenerar `internal/docs`.
