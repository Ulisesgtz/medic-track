# Modelo de Datos: Tomas por momento del día

**Sin cambios en la base de datos ni en la API.** El momento se deriva de la hora local de la toma:

| Momento | Hora local | Clave |
|---|---|---|
| Mañana | 05:00–11:59 | `morning` |
| Tarde | 12:00–18:59 | `afternoon` |
| Noche | 19:00–04:59 | `night` |

Frontend (`features/consultations/dayPeriods.ts`): `PERIODS`, `periodOf(iso)`, `groupByPeriod(doses)`.
