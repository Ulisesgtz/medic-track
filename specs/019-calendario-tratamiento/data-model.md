# Modelo de Datos: Calendario del tratamiento

Sin cambios de base de datos ni de API. Todo se deriva de `ConsultationDetail` (types.ts) y del «hoy» local.

| Concepto | Se deriva de | Forma |
|---|---|---|
| Día | `scheduledAt` de una toma, en hora local | `YYYY-MM-DD` (`dayKey`) |
| Rango de un medicamento | sus tomas y `endedAt` | `{ start, end } \| null` (R2 de la investigación): primer día a último día; con `endedAt`, hasta `min(último día, día de endedAt)`; `null` si queda vacío |
| Número y color del medicamento | su posición en `consultation.medications` | `n = índice + 1`; color `med-((n − 1) % 6 + 1)` |
| Marcas de un día | los rangos que lo contienen | lista ordenada de `n` |
| Tomas de un día | tomas de todos los medicamentos con ese `dayKey` | ordenadas por hora; cada una con su medicamento y su `status` (spec 013/016) |
| Meses navegables | del mes del primer día al mes del último día de todos los rangos | `[{ year, month }]` |
| Día seleccionado inicial | hoy (`useLocalDay`) si está dentro de algún rango; si no, el primer día | `YYYY-MM-DD` |

Nada de esto se guarda; el calendario no modifica tomas, rangos ni estados (FR-008).
