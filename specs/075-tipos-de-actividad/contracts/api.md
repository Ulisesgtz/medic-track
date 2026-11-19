# Contrato de API — Spec 075

Todas las respuestas por `*httpx.Responder`. Errores de validación con el formato de campo de siempre.

## `GET /catalog/activity-types` (público, sin sesión)

200:

```json
[
  { "code": "school", "name": "Escolar", "active": true },
  { "code": "sports", "name": "Deportiva", "active": true },
  { "code": "arts", "name": "Artística y cultural", "active": true },
  { "code": "therapy", "name": "Terapia y seguimiento", "active": true },
  { "code": "habits", "name": "Hábitos y cuidado diario", "active": true },
  { "code": "other", "name": "Otra", "active": true }
]
```

Ordenado por `sort_order`; **incluye los retirados** (`active: false`) para nombrar los segmentos de actividades que
aún los tienen. El formulario ofrece solo `active: true`.

## Rutina: campo nuevo `activityType`

En toda respuesta de rutina (`GET /children/{childId}/routines`, `GET /accounts/{accountId}/routines`,
`GET /routines/{routineId}`, crear, editar, pausar, reanudar, finalizar): `"activityType": "sports"` en una actividad,
`null` en un suplemento.

## `POST /children/{childId}/routines` y `POST /accounts/{accountId}/routines` (crear)

Cuerpo actual + `activityType`:

- `kind: "activity"`: obligatorio; un código **activo** del catálogo. Falta o no existe o está retirado → 400 campo
  `activityType` (`required` / `invalid`).
- `kind: "supplement"`: no debe venir → 400 campo `activityType` (`not_allowed`).

Plan, tope y demás reglas sin cambios.

## `PATCH /routines/{routineId}` (editar)

`activityType` **opcional**: ausente o `null` = conserva el guardado; presente = mismas reglas que al crear (activo,
solo actividades). Sigue pidiendo plan y rechazando una rutina finalizada, como hoy.

## `PUT /routines/{routineId}/activity-type` (nueva)

Cambia **solo** el tipo. Nivel `fullRoutine` (dueña y Tutor de familia de pago; lo personal, su dueña). **Sin plan.**
Cualquier estado (activa, pausada, finalizada).

Cuerpo: `{ "activityType": "arts" }`

| Resultado | Respuesta |
|---|---|
| Cambiado (o ya era ese) | 200 con la rutina |
| La rutina es un suplemento | 400 campo `activityType` `not_allowed` |
| Tipo inexistente o retirado (y distinto del actual) | 400 campo `activityType` `invalid` |
| Sin nivel `Full` | 403 / 404 como las demás rutas de rutina |
| Cuenta en pausa (spec 070) | 409 `account_deletion_pending` (no va en `AllowedWhilePending`) |

No toca tomas, marcas, avisos ni estado. Fila nueva en `router_test.go`; **no** se expone bajo `/child-device`.

## Descarga de datos (spec 070)

Tabla `suplementos_y_actividades`: columna nueva `tipo_de_actividad` con el nombre del tipo (vacía en suplementos).
