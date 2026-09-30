# Contrato: recorrer el tratamiento de un medicamento

## `POST /consultations/{consultationId}/medications/{medicationId}/extend`

Sesión obligatoria y solo el dueño de la consulta (`ownsConsultation`: 401 sin sesión, 403 de otra cuenta). Todas las
respuestas por `*httpx.Responder`.

Cuerpo:

```json
{ "doses": 3 }
```

- `doses`: entero de 1 a 60 (el número que el padre confirmó; la app lo propone con `extendableDoses`).

Respuestas:

| Estado | Cuerpo | Cuándo |
|---|---|---|
| 200 | el medicamento (`MedicationResponse`) con sus tomas, `extendableDoses` y `extensions` ya actualizados | se agregaron las tomas |
| 400 `validation_error` | `details: [{ field: "doses", message: "must be a whole number between 1 and 60" }]` | número inválido |
| 400 `nothing_to_extend` | — | finalizado, sin tomas sin registrar por recorrer, o ya recorrido (segundo clic / otro dispositivo) |
| 404 `medication_not_found` | — | no existe o no es de esa consulta (o id mal formado) |

No es idempotente a propósito: cada llamada es una decisión. Nunca duplica: un segundo intento por las mismas tomas recibe
`nothing_to_extend`.

## Cambios en `MedicationResponse` (detalle de la consulta, alta, `end`, `extend`)

| Campo | Tipo | Significado |
|---|---|---|
| `extendableDoses` | entero ≥ 0 | tomas sin registrar aún no recorridas; 0 si está finalizado. La app lo propone como número y muestra el botón solo si > 0 |
| `extensions` | lista | cada recorrido, del más antiguo al más reciente: `{ createdAt, proposedDoses, addedDoses, manual }` |

## Textos de la interfaz

| Dónde | Texto |
|---|---|
| Botón de la tarjeta | «Recorrer tratamiento» (de contorno, solo con `extendableDoses > 0` y sin finalizar) |
| Título del diálogo | «¿Recorrer el tratamiento de {medicamento}?» |
| Campo | «Tomas a agregar» (propuesto: `extendableDoses`; entero de 1 a 60) |
| Vista previa | «Quedaría hasta el 7 oct» |
| Pregunta | «¿Tu médico te indicó reponer las tomas?» |
| Aviso | «Las {n} tomas sin registrar se conservan. Esto queda registrado en tu cuenta. No se puede deshacer.» |
| Nota (número distinto del propuesto) | «Cambiaste el número propuesto: quedará registrado que lo ingresaste tú manualmente.» |
| Botones | «Cancelar» (foco inicial) / «Sí, recorrer» |
| Error del campo | «Escribe un número entero de 1 a 60.» |
| Línea de la tarjeta | «Se recorrió el 30 sep · +2 tomas» (+ « · número ingresado manualmente») |

## Calendario (spec 019, ajustado)

Nombre accesible de cada día: «30 de septiembre · inicio de 1 Amoxicilina, 2 Paracetamol», «fin de …», «inicio y fin de
…» o solo «1 Amoxicilina» (día intermedio con tomas). Inicio y fin: círculo relleno del color con el número en blanco;
día intermedio: número en color; día sin tomas: sin marca.
