# Contrato de API: Editar los datos del hijo (spec 064)

## `PUT /children/{childId}`

Nivel completo sobre el hijo (`fullChild`): la dueña y un Tutor de una familia de pago. **No** existe bajo `/child-device`. Todo pasa por `*httpx.Responder`. Los nombres y los valores van solo en el cuerpo.

### Petición

```json
{
  "firstName": "Sofía",
  "lastName": "Gómez",
  "birthDate": "2021-03-14",
  "height": 88.5,
  "weight": 12.4,
  "measurement": { "measuredOn": "2026-11-09" }
}
```

- Se manda el hijo **entero**. `height` y `weight` pueden ser `null`, que significa vaciar.
- `measurement` es opcional o `null`. Si viene, crea además una medida de crecimiento con `measuredOn` y los valores no vacíos de `height` y `weight`.

### Respuestas

| Estado | Cuándo | Cuerpo |
|---|---|---|
| 200 | Guardado, o sin cambios | El hijo (`childResponse`, ver abajo) |
| 400 `validation_error` | Nombre o apellido inválido, fecha futura o mal escrita, talla o peso no positivos; medida con fecha inválida, sin valores o fuera de rango | `{ "error": "validation_error", "fields": [{ "field": "firstName" \| "lastName" \| "birthDate" \| "height" \| "weight" \| "measurement" \| "measurement.measuredOn" \| "measurement.weightKg" \| "measurement.heightCm", "message": "…" }] }` (mensajes fijos, sin repetir lo escrito) |
| 403 | Sin nivel completo | El de `fullChild` |
| 404 | El hijo no existe | — |
| 409 `birth_date_conflict` | La fecha nueva queda después de medidas o vacunas ya anotadas | `{ "error": "birth_date_conflict", "measurementCount": 2, "measurements": ["2022-03-03", "2022-04-14"], "vaccinationCount": 1, "vaccinations": ["2022-03-10"] }` (fechas ascendentes, hasta 20 de cada una) |
| 422 `freemium_consultation_limit_exceeded` | Cambia nombre, apellido o fecha y la cuenta dueña no es `paid` | `{ "error": "freemium_consultation_limit_exceeded", "reason": "child_identity" }`, sin cambiar nada |
| 422 `growth_limit_exceeded` | La medida pasaría el tope de 500 | Igual que la spec 063 |

Orden de las revisiones:
1. Validación del cuerpo (400).
2. Bloqueo del hijo (404).
3. Plan, si cambia la identidad (422).
4. Conflicto de la fecha (409).
5. Tope de la medida (422).
6. Escritura.

## El hijo en las respuestas (`childResponse`)

En `GET /accounts/me`, `GET /accounts/{accountId}`, `POST /accounts`, `POST /accounts/{accountId}/children` y `PUT /children/{childId}`, se agregan dos campos:

```json
{
  "id": "…", "firstName": "Sofía", "lastName": "Gómez", "birthDate": "2021-03-14", "height": 88.5, "weight": 12.4,
  "accountId": "…", "role": "owner", "plan": "paid", "readOnly": false,
  "correctedAt": "2026-11-09T16:20:00Z",
  "correctedBy": "Ana"
}
```

`correctedAt` y `correctedBy` son `null` si nunca se corrigió. `correctedBy` es solo el nombre de pila.

## Cambios en rutas existentes

`POST/PUT …/growth-measurements` y `POST/PATCH …/vaccinations` responden el mismo 400 de hoy («antes del nacimiento») si, bajo el bloqueo del hijo, la fecha quedó antes de un nacimiento que otra persona acaba de cambiar. El contrato no cambia.
