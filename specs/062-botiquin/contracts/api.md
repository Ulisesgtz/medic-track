# Contrato del API: Botiquín de la casa

Todas detrás de `RequireSession`, por `*httpx.Responder`, **nunca** bajo `/child-device`. `{accountId}` = la cuenta dueña de la
familia. Sin acceso: 403 (también para una familia ajena). Un `itemId` de otra familia o inexistente: 404 `item_not_found`.
Los textos libres viajan solo en cuerpos JSON y nunca se escriben en `error_logs`.

## `GET /accounts/{accountId}/medicine-cabinet` — `seesAccount`

`200`:

```json
{
  "items": [{
    "id": "…", "name": "Paracetamol infantil", "strength": "160 mg/5 ml",
    "quantity": 2, "unit": "bottle",
    "expires": { "year": 2027, "month": 3, "day": null },
    "note": "Uno abierto…", "hasPhoto": true,
    "createdBy": "Ana", "createdAt": "2026-11-06T…",
    "updatedBy": null, "updatedAt": null
  }],
  "canEdit": true, "canAdd": true, "limit": 200
}
```

Orden alfabético por nombre (sin mayúsculas ni acentos, el `fold` del historial). `canEdit` = nivel Full; `canAdd` = Full **y** la
dueña en `paid`.

## `POST /accounts/{accountId}/medicine-cabinet` — `fullAccount`

Cuerpo: `{ name, strength?, quantity, unit, expires: {year, month, day?}, note?, photoBase64? }` → `201` con el medicamento.

- `400 validation_error` (`details[{field, message}]`: `name`, `strength`, `quantity`, `unit`, `expires`, `note`, `photoBase64`).
- `422 freemium_consultation_limit_exceeded` `reason: "medicine_cabinet"`: la dueña no está en `paid`.
- `422 cabinet_limit_exceeded` `limit: 200`.

## `GET /accounts/{accountId}/medicine-cabinet/{itemId}` — `seesAccount`

`200` el medicamento (con `canEdit`). `404 item_not_found`.

## `PUT /accounts/{accountId}/medicine-cabinet/{itemId}` — `fullAccount` (cualquier plan)

Cuerpo como `POST`; `photoBase64` **ausente = no cambia**, `""` = quitar la foto. Sella `updated_by/at`. `200` el medicamento.

## `DELETE /accounts/{accountId}/medicine-cabinet/{itemId}` — `fullAccount` (cualquier plan)

`204`. Borra la fila y su foto.

## `GET /accounts/{accountId}/medicine-cabinet/{itemId}/photo` — `seesAccount`

`200 { "photoBase64": "…" }`; `404 item_not_found` sin foto o sin medicamento.
