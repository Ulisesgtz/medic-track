# Quickstart: Curvas de crecimiento

## Preparación

1. Aplicar `backend/migrations/0034_growth_measurements.sql` en la base local (y en DEV **antes del merge**).
2. Backend con `WHO_GROWTH_REFERENCE_ENABLED=true` para ver las curvas (apagada = solo los puntos).
3. `cd backend && go test ./internal/growth/... ./internal/server/... -cover` con `DATABASE_URL` local, y otra vez con
   `&pool_max_conns=4`.
4. `cd frontend && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4`, `npx tsc -b`, `npm run build`, `npx eslint .`.
5. E2E (CI): `npx playwright test e2e/crecimiento.spec.ts`.

## Escenarios

| # | Pasos | Resultado esperado |
|---|---|---|
| 1 | Cuenta gratuita → detalle del hijo → «Crecimiento» → «Anotar medida» (fecha, 12.4 kg, 86 cm) | La medida aparece arriba con «1 año 5 meses» |
| 2 | Fecha de mañana o anterior al nacimiento | Error en el campo Fecha, nada se guarda |
| 3 | Solo peso | Se guarda; la fila no muestra talla |
| 4 | Cuenta gratuita → «Ver la curva» | Aviso del plan (`growth_chart`); la API responde 422 sin datos |
| 5 | Cuenta de pago sin tabla elegida → «Ver la curva» | «Niña · Niño»; al elegir, las curvas P3–P97 grises y los puntos |
| 6 | Tocar un punto | «3 nov 2026 · 12.4 kg · 1 año 5 meses»; la tabla alternativa lo lista igual |
| 7 | Corregir 124 → 12.4 | La fila dice «Corregida el … por Luis»; la gráfica se mueve |
| 8 | Quitar y confirmar | Desaparece de la lista y la gráfica |
| 9 | Cuidador | Ve la lista y la gráfica (si la familia paga), sin botones; POST/PUT/DELETE → 403 |
| 10 | Hijo con peso/talla del registro | «Anotado al registrar a Mateo, sin fecha» con «Anotarla con fecha» |
| 11 | `WHO_GROWTH_REFERENCE_ENABLED` apagada | Solo los puntos y «La referencia de la OMS aún no está disponible» |
| 12 | Revisar textos | Ninguna palabra que evalúe (prueba de redacción) |

## Pasos del dueño

- Pedir a la OMS el permiso para usar sus tablas en una app de pago (formulario de permisos de who.int) antes de prender
  `WHO_GROWTH_REFERENCE_ENABLED` en producción.
- Aplicar la `0034` en DEV antes del merge.
