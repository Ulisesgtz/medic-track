# Contratos: síntomas y notas previas a la consulta (spec 012)

> Por el principio de "Idioma del Código" de la constitución, los nombres de campo del JSON están en inglés; la prosa
> en español. Todas las respuestas se escriben con `*httpx.Responder` (errores 4xx/5xx a `error_logs`).

## 1. `GET /catalog/symptoms` (nuevo, público)

Los síntomas **activos** del catálogo, en su orden (R1, R2). Sin sesión, como `/catalog/countries`.

### 200 OK

```json
[
  { "code": "fever", "name": "Fiebre", "category": "General" },
  { "code": "fatigue", "name": "Cansancio o decaimiento", "category": "General" },
  { "code": "cough", "name": "Tos", "category": "Respiratorio" }
]
```

Arreglo vacío `[]` si no hubiera ninguno activo. El frontend agrupa por `category` respetando el orden en que llegan.

## 2. `POST /children/{childId}/consultations` (cambia; base: `specs/004-detalle-consulta-hijo/contracts/post-consultations.md`)

Cambios en el request:

```json
{
  "notes": "string (opcional, default '' — antes se llamaba \"symptoms\")",
  "symptomCodes": ["fever", "cough"]
}
```

- `symptomCodes`: opcional (ausente, `null` o `[]` = sin síntomas). Los duplicados se ignoran. Cada código debe existir
  y estar activo.
- `symptoms` (texto) deja de aceptarse: el texto libre va en `notes`.
- El resto del request no cambia.

### 201 Created

El detalle completo, igual que `GET /consultations/{id}` (abajo).

### 400 Bad Request — síntoma inexistente o retirado (nuevo)

```json
{
  "error": "validation_error",
  "message": "One or more fields are invalid",
  "details": [{ "field": "symptomCodes", "message": "symptom_not_available" }]
}
```

La consulta no se crea (nada queda a medias). El frontend muestra: "Uno de los síntomas que elegiste ya no está
disponible. Revisa la lista e intenta de nuevo.", vuelve a pedir el catálogo y quita de la selección los retirados.

Los demás 400/401/403/404 no cambian.

## 3. `GET /consultations/{consultationId}` (cambia; base: `specs/004-detalle-consulta-hijo/contracts/get-consultation-detail.md`)

```json
{
  "id": "uuid",
  "childId": "uuid",
  "doctorName": "Dra. López",
  "consultDate": "2026-09-28",
  "photoBase64": "…",
  "notes": "Comió mariscos el domingo; la fiebre empezó el lunes en la noche.",
  "symptoms": [
    { "code": "fever", "name": "Fiebre", "category": "General" },
    { "code": "vomiting", "name": "Vómito", "category": "Digestivo" }
  ],
  "medications": [ … sin cambios … ]
}
```

- `notes`: antes `symptoms` (texto). Las consultas anteriores traen aquí su texto íntegro (FR-013).
- `symptoms`: en orden de catálogo, **incluidos los retirados** (FR-008). `[]` si no hay.

## 4. `GET /children/{childId}/consultations` (cambia; base: `specs/004-detalle-consulta-hijo/contracts/get-consultations.md`)

Cada elemento de `consultations`:

```json
{
  "id": "uuid",
  "doctorName": "Dra. López",
  "consultDate": "2026-09-28",
  "notes": "string (puede ser vacío)",
  "symptomNames": ["Fiebre", "Tos", "Vómito", "Diarrea"],
  "medicationCount": 2
}
```

- `symptomNames`: en orden de catálogo, incluidos retirados; `[]` si no hay. El frontend muestra hasta 3 y "+N".
- `notes`: antes `symptoms`.

## Acceso

- `GET /catalog/symptoms`: público.
- Los síntomas de una consulta solo viajan dentro de las respuestas de consultas, que ya exigen sesión y dueño
  (`RequireOwner` en `internal/server/router.go`, spec 008). No hay endpoint para leer síntomas por hijo o cuenta en esta
  funcionalidad (la relación lo permite a futuro).
