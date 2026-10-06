# Contrato: búsqueda del historial y sus opciones

Dos endpoints **nuevos**, solo para el plan de pago. Nada de lo existente cambia: la lista simple
(`GET /children/{childId}/consultations`) sigue igual y es lo que ve el plan gratuito. Ambos van detrás de la sesión y del
dueño del hijo (`RequireOwner` sobre `childId`, como la lista) y escriben todas sus respuestas por el `*httpx.Responder`.

## `POST /children/{childId}/consultations/search`

Busca y filtra las consultas **de un hijo**. Es un `POST` solo para que el criterio (puede ser un dato de salud) **no viaje en
la dirección** (research R1); no crea ni cambia nada.

### Petición (cuerpo JSON; todos los campos son opcionales)

| Campo | Tipo | Regla |
|---|---|---|
| `q` | string | Texto. Se recorta; vacío no filtra. ≤ 100 caracteres. Coincide con el doctor, las notas o el nombre de algún medicamento, **sin distinguir mayúsculas ni acentos** (`áéíóúüñ`), por subcadena |
| `from` | string | `YYYY-MM-DD`. Consultas con `consultDate ≥ from` |
| `to` | string | `YYYY-MM-DD`. Consultas con `consultDate ≤ to`. Debe ser `≥ from` si ambos vienen |
| `doctor` | string | Igualdad exacta (recortada) con el doctor registrado. ≤ 200 caracteres |
| `medication` | string | Alguna medicina de la consulta con ese nombre exacto (recortado). ≤ 200 caracteres |
| `symptomCodes` | string[] | Códigos del catálogo (`GET /catalog/symptoms`; también los retirados). La consulta debe tener **todos**. ≤ 30, sin repetidos (se ignoran los repetidos) |
| `kind` | string | `all` (por omisión, no filtra), `treatment` (con tratamiento) o `record` (solo registro) |

Los criterios dados se combinan **todos a la vez**. Un cuerpo `{}` devuelve todas las consultas del hijo.

### Respuesta `200`

La misma forma que `GET /children/{childId}/consultations`:

```json
{
  "childId": "…",
  "consultations": [
    { "id": "…", "childId": "…", "doctorName": "Dra. López", "consultDate": "2026-09-12", "notes": "Fiebre y tos",
      "symptomNames": ["Fiebre", "Tos"], "medicationCount": 2, "recordOnly": false }
  ]
}
```

Orden: `consultDate` descendente, luego `createdAt` descendente. Sin paginar. Ninguna fila trae foto.

### Errores

| Estado | `error` | Cuándo |
|---|---|---|
| 400 | `validation_error` | Cuerpo mal formado, o un campo inválido: `details[]` con `field` (`q`, `from`, `to`, `doctor`, `medication`, `symptomCodes`, `kind`) y `message`. Un código de síntoma que nunca existió: `field: "symptomCodes"`, `message: "symptom_not_available"` |
| 401 | — | Sin sesión |
| 403 | — | El hijo es de otra cuenta |
| 404 | `child_not_found` | `childId` mal formado o inexistente |
| 422 | `freemium_consultation_limit_exceeded` | La cuenta es del plan gratuito: `{ error, message, reason: "history_search" }`. **Nunca** devuelve resultados |

## `GET /children/{childId}/history-options`

Lo que ya está registrado para ese hijo, para armar las listas de elección del Historial. No lleva criterio ni datos en la
dirección.

### Respuesta `200`

```json
{ "doctors": ["Dr. Iván Robles", "Dra. Laura Cázares"], "medications": ["Amoxicilina 250 mg", "Paracetamol"] }
```

Nombres **distintos**, recortados, tal como el padre los escribió (no se unifican ni corrigen), ordenados sin distinguir
mayúsculas ni acentos. Listas vacías si el hijo no tiene consultas. Los síntomas salen del catálogo (`GET /catalog/symptoms`).

### Errores

`401`, `403`, `404 child_not_found` y `422 freemium_consultation_limit_exceeded` (`reason: "history_search"`), igual que arriba.

## Compatibilidad y privacidad

- Endpoints nuevos y aditivos: una versión de la app anterior no los usa.
- El texto buscado **no** se registra: ni en `error_logs` (que guarda solo la ruta con plantilla) ni en el registro de
  operación (la dirección no lo lleva). Tampoco se guarda en base.
- Rutas nuevas en `internal/server/router.go` con `RequireOwner`, y una fila cada una en `routes()` de `router_test.go`.
