# Contrato del API — Ficha del hijo

Ambas rutas con sesión, en `internal/server/router.go`, **nunca** bajo `/child-device`. Cualquier plan.

## `GET /children/{childId}/record` — `seesChild` (Mark)

```json
200
{
  "exists": true,
  "version": 3,
  "canEdit": true,
  "bloodType": "O+",
  "generalNote": "Usa lentes desde los 4 años.",
  "pediatrician": { "name": "Dra. Ruiz", "phone": "+52 33 1234 5678", "office": "Torre Médica, piso 4" },
  "allergies": [
    { "name": "Penicilina", "kind": "medication", "note": "le salen ronchas" },
    { "name": "Cacahuate", "kind": "food", "note": null }
  ],
  "conditions": [ { "name": "Asma", "note": "usa inhalador en crisis" } ],
  "updated": { "at": "2026-11-17T18:05:00Z", "by": "Ana" }
}
```

Sin ficha: `{"exists": false, "version": 0, "canEdit": true, "bloodType": null, "generalNote": null,
"pediatrician": null, "allergies": [], "conditions": [], "updated": null}`.

403 sin acceso (o el hijo no existe), 404 id mal formado — como el resto de rutas de hijo.

## `PUT /children/{childId}/record` — `fullChild` (Full)

Cuerpo = la ficha entera + `expectedVersion`:

```json
{
  "expectedVersion": 3,
  "bloodType": "O+",
  "generalNote": null,
  "pediatrician": { "name": "Dra. Ruiz", "phone": "+52 33 1234 5678", "office": null },
  "allergies": [ { "name": "Penicilina", "kind": "medication", "note": "le salen ronchas" } ],
  "conditions": []
}
```

| Estado | Cuándo | Cuerpo |
|---|---|---|
| 200 | Guardado (o sin cambios) | la ficha como en el `GET` |
| 400 `validation_error` | un campo fuera de regla, tope pasado | `details: [{field: "allergies[2].name", message}]` — nunca el valor |
| 400 `invalid_request` | JSON mal formado, falta `expectedVersion` | — |
| 409 `record_conflict` | `expectedVersion` ≠ versión guardada | `{error, message, current: <ficha como en el GET>}` |
| 403 / 404 | como el resto | — |

Todo por `*httpx.Responder`. Un 409 de conflicto se escribe con `WriteJSONUnlogged` (estado esperado, no falla).

## `POST /children/{childId}/export` (spec 050) — cambio

`documentResponse` gana `record`: la ficha (sin `canEdit` ni `version`) o `null` si no existe o no se pidió. La
petición gana `sections.record` (booleano, por omisión `true`: la casilla «Incluir la ficha» del panel, activada de
inicio). Pedir solo la ficha no basta: sigue haciendo falta `consultations` o `vaccinations` (regla de la spec 050).
