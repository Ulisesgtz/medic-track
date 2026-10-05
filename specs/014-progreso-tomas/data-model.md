# Modelo de Datos: Barra de progreso de tomas

**Sin cambios en la base de datos ni en la API.** El progreso se deriva de las tomas del medicamento
(`Dose.taken`, `Dose.status`, specs 004/013):

| Valor | Cálculo |
|---|---|
| `total` | número de tomas del medicamento |
| `taken` | tomas con `taken = true` |
| `unregistered` | tomas con `status = 'unregistered'` |

En el frontend (`features/consultations/progress.ts`): `medicationProgress(doses: Dose[]): { taken, total, unregistered }`.
