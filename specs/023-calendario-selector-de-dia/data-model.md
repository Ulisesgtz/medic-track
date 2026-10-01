# Modelo de datos: El calendario como selector de día de «Medicamentos»

Sin cambios en la base de datos, la API ni los tipos del backend. Solo estado de pantalla, derivado:

| Concepto | Dónde vive | Forma | Regla |
|---|---|---|---|
| Día tocado | estado de `ConsultationDetailPage` | `string \| null` (`AAAA-MM-DD`, hora local) | `null` hasta que el padre toca un día; no se guarda |
| Día efectivo | derivado en la página | `string \| null` | `tocado ?? initialDay(medicamentos, hoy)` (spec 019); `null` si ninguna toma |
| Mes que se ve | estado de `TreatmentCalendar` | `{ year, month }` | no afecta al día efectivo |
| Tomas del día de un medicamento | derivado en `MedicationCard` | `Dose[]` | `medication.doses` con `dayKey(scheduledAt) === día efectivo`, agrupadas por `groupByPeriod` |

Sin contratos nuevos (no hay endpoints).
