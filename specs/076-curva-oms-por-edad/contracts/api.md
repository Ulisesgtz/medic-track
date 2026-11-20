# Contrato de API — Spec 076

## `GET /children/{childId}/growth-chart` (cambia, compatible hacia atrás)

- `points.weight` y `points.height` traen **solo** las medidas cuya fecha es igual o anterior a `birthDate` + `maxMonths`
  meses de calendario de su indicador.
- Campo nuevo `limits` (siempre presente, también con `reference: null` o con las curvas apagadas):

```json
"limits": {
  "weight": { "maxMonths": 120, "later": 1 },
  "height": { "maxMonths": 228, "later": 0 }
}
```

`later` = medidas de ese indicador posteriores a su edad máxima (no vienen en `points`).

Todo lo demás igual (plan primero → 422 `growth_chart`; `reference`, `referenceSex`, `birthDate`). Swagger regenerado.

## Sin cambios

`GET/POST/PUT/DELETE …/growth-measurements`, `PUT /children/{id}` (spec 064), la tabla Niña/Niño.
