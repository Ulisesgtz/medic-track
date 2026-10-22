# Contrato: API de la cartilla de vacunación

Todas las rutas van detrás de `RequireSession` y escriben por `*httpx.Responder`. Las rutas con `{childId}` llevan `RequireAccess`: **leer = `Mark`** (el Cuidador ve), **escribir = `Full`** (dueña y Tutor con plan vigente). Los ids de registro y de foto se verifican contra el hijo de la ruta: de otro hijo = 404. Los textos libres solo viajan en cuerpos JSON.

| Método y ruta | Nivel | Descripción |
|---|---|---|
| `GET /catalog/vaccines` | público | Vacunas activas del catálogo, en orden: `[{ code, name }]` (un arreglo, como `/catalog/symptoms`) |
| `GET /children/{childId}/vaccinations` | Mark | `{ vaccinations: [Registro] }` del más reciente al más antiguo (`appliedOn DESC, createdAt DESC`) |
| `POST /children/{childId}/vaccinations` | Full | Crea una dosis. Cuerpo: `{ vaccineCode? , customName? , appliedOn, doseNumber?, lot?, place?, notes?, allowDuplicate? }` → 201 `Registro` |
| `PATCH /children/{childId}/vaccinations/{vaccinationId}` | Full | Corrige (mismos campos; solo los enviados cambian; `allowDuplicate` también) → 200 `Registro` con `correctedByName` y `correctedAt` |
| `DELETE /children/{childId}/vaccinations/{vaccinationId}` | Full | Borrado real → 204 |
| `GET /children/{childId}/vaccine-card-photos` | Mark | `{ photos: [{ id, createdAt, createdByName }], limit: 10 }` (sin imágenes) |
| `POST /children/{childId}/vaccine-card-photos` | Full | Cuerpo `{ photoBase64 }` → 201 `{ id, createdAt, createdByName }` |
| `GET /children/{childId}/vaccine-card-photos/{photoId}` | Mark | `{ id, photoBase64 }` |
| `DELETE /children/{childId}/vaccine-card-photos/{photoId}` | Full | Borrado real → 204 |

## Registro (respuesta)

```json
{
  "id": "…", "vaccineCode": "hepatitis_b", "name": "Hepatitis B", "customName": null,
  "appliedOn": "2021-03-14", "doseNumber": 1, "lot": null, "place": "Centro de salud", "notes": null,
  "createdByName": "Ana", "createdAt": "2026-10-17T18:00:00Z",
  "correctedByName": null, "correctedAt": null
}
```

`name` es el del catálogo (aunque la vacuna se haya retirado) o el `customName`. **Nunca** hay correos ni ids de cuenta.

## Errores

| Estado | `error` | Cuándo |
|---|---|---|
| 400 | `validation_error` | `details: [{ field, message }]`: `vaccine` (falta o vienen ambos: `vaccineCode` y `customName`; código desconocido), `customName` (1–100), `appliedOn` (obligatoria, formato `AAAA-MM-DD`, no futura —hasta un día de tolerancia sobre la fecha UTC del servidor—, no anterior al nacimiento), `doseNumber` (1–20), `lot` (≤ 60), `place` (≤ 120), `notes` (≤ 500), `photoBase64` (no es una imagen reconocible o pasa de 5 MiB) |
| 401 | — | sin sesión (como todas, sin escribir en `error_logs`) |
| 403 | — | sin el nivel de la ruta |
| 404 | `vaccination_not_found` / `photo_not_found` | id inexistente o de otro hijo |
| 409 | `duplicate_vaccination` | misma vacuna, dosis y fecha ya registradas; se repite con `allowDuplicate: true` si el padre confirma |
| 422 | `photo_limit_exceeded` | el hijo ya tiene 10 fotos; `reason: "vaccine_card"`, `limit: "10"` |

Los mensajes son fijos: **no repiten** el nombre «otra», el lote, el lugar ni las notas. Un `vaccineCode` retirado (`active = false`) se rechaza al crear (`vaccine`), pero un registro que ya lo tiene se puede corregir sin cambiarlo.

## Compatibilidad

Sin cambios a respuestas existentes. `GET /accounts/me` no cambia. El frontend nuevo no afecta al anterior (rutas nuevas); el backend nuevo es compatible hacia atrás.
