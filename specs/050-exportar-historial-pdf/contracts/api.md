# Contrato de la API: Exportar el historial a PDF (spec 050)

Todas las respuestas pasan por `*httpx.Responder`. Ningún texto libre del pedido (búsqueda, doctor, medicamento) va en la dirección ni en `error_logs`.

## `POST /children/{childId}/export` — `seesChild` (Mark)

Petición:

```json
{
  "period": {
    "kind": "all | range | filters",
    "from": "2026-01-01",
    "to": "2026-10-24",
    "filters": { "q": "", "from": null, "to": null, "doctor": "Dra. Laura Cázares", "medication": "", "symptomCodes": ["fever"], "kind": "all" }
  },
  "sections": { "consultations": true, "vaccinations": true, "photos": false }
}
```

- `range` exige `from` y `to` (días, `from ≤ to`); `filters` usa las reglas de la búsqueda del historial (spec 031).
- Al menos una de `consultations` / `vaccinations` en `true`; si no, 400 `validation_error` campo `sections`.

`200`:

```json
{
  "child": { "firstName": "Mateo", "lastName": "Morales", "birthDate": "2021-03-14", "height": 112, "weight": 19.4 },
  "activeTreatment": { "medicationName": "Amoxicilina", "frequencyHours": 8, "since": "2026-10-18T14:00:00Z", "doctorName": "Dra. Laura Cázares" },
  "nextAppointment": { "scheduledAt": "2026-10-28T16:30:00Z", "doctorName": "Dra. Laura Cázares", "location": "Consultorio 204, Torre Médica Satélite" },
  "consultations": [
    {
      "id": "…", "consultDate": "2026-10-18", "doctorName": "Dra. Laura Cázares", "recordOnly": false,
      "notes": "…", "symptoms": [{ "code": "fever", "name": "Fiebre" }], "hasPhoto": true,
      "medications": [
        {
          "name": "Amoxicilina", "frequencyHours": 8, "durationDays": 7, "startTime": "08:00",
          "endedAt": null, "extensions": [{ "createdAt": "…", "addedDoses": 2 }],
          "doses": { "taken": 16, "unregistered": 2, "due": 0, "pending": 3, "total": 21, "sequence": "tttttuttttttutttttppp" },
          "firstDoseAt": "…", "lastDoseAt": "…",
          "lastMark": { "at": "2026-10-24T14:05:00Z", "by": "Ana" }
        }
      ],
      "appointment": { "scheduledAt": "…", "doctorName": "…", "location": "…" }
    }
  ],
  "vaccinations": [
    { "id": "…", "name": "Hepatitis B", "custom": false, "doseNumber": 1, "appliedOn": "2021-03-15", "lot": "…", "place": "…", "notes": "…",
      "corrected": { "at": "2026-10-03T…", "by": "Ana" } }
  ],
  "photos": {
    "consultations": [{ "consultationId": "…", "consultDate": "2026-10-18", "doctorName": "…" }],
    "card": [{ "id": "…", "createdAt": "2026-10-03T…" }]
  }
}
```

- `consultations` y `vaccinations` son `[]` si su sección no se pidió. `photos` es `null` si no se pidieron.
- `doses.total` no cuenta las tomas canceladas al finalizar un tratamiento; `pending` = por venir; `unregistered` = sin registrar (spec 013); `due` = ya llegó su hora y nadie la marcó («por marcar»).
- `doses.sequence`: el estado de cada toma contada **en el orden del horario**, una letra por toma (`t` marcada, `u` sin registrar, `d` por marcar, `p` por venir), para que el documento dibuje las fichas en el orden en que pasaron y no agrupadas por estado (el mock las dibuja en orden: las «sin registrar» entre las marcadas). Agregado el 2026-10-30 al construir el documento.
- La cartilla es **siempre completa** (no la filtra el periodo).

Errores:

| Estado | Cuerpo |
|---|---|
| 400 | `validation_error` (periodo o secciones inválidos; campos como en la búsqueda) |
| 403 | sin acceso al hijo (mismo que cualquier recurso ajeno) |
| 404 | `child_not_found` (id mal formado) |
| 422 | `freemium_consultation_limit_exceeded`, `reason: "pdf_export"` — la familia no tiene plan completo; **sin datos** |

## `GET /consultations/{consultationId}/photo` — `seesConsultation` (Mark)

`200`: `{ "photoBase64": "…" }` (vacío si la consulta se guardó sin foto). Sin regla de plan propia (la foto ya se ve en el detalle); se usa solo durante la exportación.

## Ya existente

`GET /children/{childId}/vaccine-card-photos/{photoId}` — la imagen de una foto de la cartilla (spec 046).
