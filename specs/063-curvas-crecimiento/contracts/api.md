# Contrato de API: Curvas de crecimiento

Todas con sesión de Clerk, por `*httpx.Responder`, nunca bajo `/child-device`. Valores y nota solo en el cuerpo.

## `GET /children/{childId}/growth-measurements` — `seesChild`, cualquier plan

200:
```json
{
  "measurements": [
    { "id": "uuid", "measuredOn": "2026-11-03", "weightKg": 12.4, "heightCm": 86.0, "note": "en ayunas",
      "createdBy": { "name": "Ana" }, "createdAt": "…", "corrected": { "at": "…", "by": { "name": "Luis" } } }
  ],
  "registered": { "weightKg": 12.0, "heightCm": 85.0 },
  "referenceSex": "male",
  "canEdit": true,
  "chartAvailable": true
}
```
- Orden: `measuredOn DESC, createdAt DESC`. `registered` = peso/talla del registro del hijo (sin fecha) o `null`.
- `corrected` y `note` pueden ser `null`. `chartAvailable` = la cuenta dueña tiene plan completo (la pantalla decide la marca).

## `POST /children/{childId}/growth-measurements` — `fullChild`, cualquier plan

Cuerpo: `{ "measuredOn": "2026-11-03", "weightKg": 12.4, "heightCm": null, "note": "" }`
- La fecha puede ser hasta un día después de la del servidor (zona del padre), como la cartilla.
- 201 con la medida. 400 `validation_error` `{ details: [{ field, message }] }` (fecha futura o antes del nacimiento, valores
  fuera de rango, ninguno de los dos, nota larga). 422 `growth_limit_exceeded` (500).

## `PUT /children/{childId}/growth-measurements/{measurementId}` — `fullChild`

Mismo cuerpo; sella `corrected`. 200 con la medida. 404 `measurement_not_found` si no es de ese hijo.

## `DELETE /children/{childId}/growth-measurements/{measurementId}` — `fullChild`

204. 404 `measurement_not_found`.

## `PUT /children/{childId}/growth-reference` — `fullChild`, cualquier plan

Cuerpo: `{ "sex": "female" | "male" }`. 204. 400 `validation_error`.

## `GET /children/{childId}/growth-chart` — `seesChild`, **plan completo**

- Sin plan completo de la cuenta dueña: 422 `{ "error": "freemium_consultation_limit_exceeded", "reason": "growth_chart" }`
  sin datos.
- 200:
```json
{
  "birthDate": "2025-06-10",
  "referenceSex": "male",
  "points": { "weight": [{ "measuredOn": "2026-11-03", "months": 16.8, "value": 12.4 }], "height": [ … ] },
  "reference": {
    "available": true,
    "source": "OMS: Patrones de Crecimiento Infantil (2006) y Referencia de Crecimiento 2007",
    "weight": { "maxMonths": 120, "curves": [{ "months": 0, "p3": 2.5, "p15": 2.9, "p50": 3.3, "p85": 3.8, "p97": 4.3 }, …] },
    "height": { "maxMonths": 228, "curves": [ … ] }
  }
}
```
- `reference` es `null` si falta `referenceSex`; `reference.available = false` (sin curvas) si `WHO_GROWTH_REFERENCE_ENABLED`
  está apagada. Nunca hay percentil ni puntuación del hijo.
