# Contrato: editar una consulta (spec 051)

## `PUT /consultations/{consultationId}`

Sesión de Clerk. Nivel `Full` sobre la consulta (`fullConsultation`): dueña o Tutor de una familia de pago. No existe bajo
`/child-device`. Cuerpo máximo: el de la creación (11 MiB, por la foto). Todo por `*httpx.Responder`; ningún texto del
cuerpo va en un mensaje de error.

### Cuerpo

```json
{
  "expectedVersion": "2026-10-20T14:02:11.123456Z",
  "doctorName": "Dra. Laura Cázares",
  "consultDate": "2026-10-18",
  "utcOffsetMinutes": -360,
  "photoBase64": "",
  "notes": "La fiebre empezó el domingo",
  "symptomCodes": ["fever", "cough"],
  "medications": [
    { "id": "6f1c…", "name": "Amoxicilina", "frequencyHours": 8, "durationDays": 7, "startTime": "08:00" },
    { "name": "Ambroxol jarabe", "frequencyHours": 12, "durationDays": 5, "startTime": "09:00" }
  ]
}
```

- `expectedVersion`: el `edited.at` del detalle, o su `createdAt` si `edited` es `null`. Requerido.
- `photoBase64`: vacío u omitido = la foto no cambia; con valor = la reemplaza (JPEG/PNG/GIF/WebP/HEIC, 8 MiB).
- `medications`: con `id` = un medicamento existente de esta consulta (se actualiza); sin `id` = nuevo; un existente que no
  aparece = se quita. Al menos uno. En una consulta «solo registro» `startTime` se ignora (siempre `null`).
- No hay `recordOnly`: el tipo de la consulta no cambia.

### Respuestas

| Estado | Cuerpo | Cuándo |
|---|---|---|
| 200 | `ConsultationDetailResponse` (con `createdAt` y `edited`) | guardado |
| 400 | `validation_error` con `details[{field, message}]` | campo inválido (como al crear), `expectedVersion` ausente, `medications[i].id` `medication_not_found`, `…` `treatment_ended`, `symptomCodes` `symptom_not_available` |
| 403 | `forbidden` | la sesión no tiene nivel `Full` (Cuidador, Tutor de familia vencida, Hijo, otra familia) |
| 404 | `consultation_not_found` | no existe o el id está mal formado |
| 409 | `edit_conflict` | otra edición se guardó después de abrir el formulario; nada cambió |
| 409 | `medication_has_marks` | se quitó un medicamento que tiene al menos una toma marcada; nada cambió |
| 422 | `freemium_consultation_limit_exceeded` `reason: "active_treatment"` | plan gratuito: la edición dejaría a esta consulta con tomas por delante mientras otra tiene un tratamiento activo |
| 422 | `photo_limit_exceeded` | foto nueva en una consulta sin foto con el tope de la cuenta lleno (spec 043) |

## `GET /consultations/{consultationId}` (cambio compatible)

El detalle gana dos campos (también en la respuesta del `PUT` y del `POST` de creación):

```json
{
  "createdAt": "2026-10-18T15:20:00Z",
  "edited": { "at": "2026-10-26T17:05:00Z", "by": "Ana" }
}
```

`edited` es `null` si nunca se editó; `by` es el nombre de pila de la cuenta que editó, nunca el correo.
