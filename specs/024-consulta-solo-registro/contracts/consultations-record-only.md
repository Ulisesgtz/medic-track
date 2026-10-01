# Contrato: `recordOnly` en las consultas

Cambios **aditivos** sobre `contracts/` de las specs 004 y 012; todo lo demás queda igual.

## `POST /children/{childId}/consultations`

Petición — campo nuevo:

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `recordOnly` | boolean | no (`false`) | `true`: la consulta se guarda sin horarios ni tomas |

Con `recordOnly: true`:
- `medications[i].startTime` **no se valida y se descarta** (se guarda vacío aunque llegue);
- `name`, `frequencyHours` y `durationDays` se validan igual que hoy;
- `consultDate`: sin restricción nueva.

Respuesta `201`: la del detalle (más abajo), con `recordOnly` y cada medicamento con `startTime: null`, `doses: []`,
`extendableDoses: 0`, `extensions: []`.

Errores: sin cambios (`400 validation_error` con `details[].field`, `404 child_not_found`, `422 freemium_child_limit…`
no aplica aquí).

## `GET /children/{childId}/consultations`

Cada elemento de `consultations[]` gana:

```json
{ "recordOnly": false }
```

## `GET /consultations/{id}`

La respuesta gana `recordOnly` (siempre presente):

```json
{ "id": "…", "recordOnly": true, "medications": [{ "startTime": null, "doses": [] }] }
```

Sin otros endpoints nuevos. `GET /children/{id}/overview` no cambia: una consulta solo-registro no tiene tomas, así que no
aporta nada a «tomas de hoy» ni al «tratamiento activo».
