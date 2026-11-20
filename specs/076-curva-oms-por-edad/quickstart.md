# Quickstart — validar la spec 076

## API

1. Hijo nacido el 2014-01-15 (plan completo, tabla elegida) con peso el 2024-01-15 (cumple 10) y el 2024-01-16.
   `GET /children/{id}/growth-chart` → `points.weight` trae la del 2024-01-15 y no la del 2024-01-16; `limits.weight.later` = 1.
2. Sin tabla elegida (`reference: null`) → `limits` igual y el mismo corte.
3. `GET …/growth-measurements` → trae las dos.

## App (390 y 1280 px)

- Mateo (A): pestaña Peso con 3 puntos, eje a 10 años y la nota; Talla sin nota; ‹ › solo 3 medidas, «Medida 2 de 3…».
- Sofía (B/B2): Peso con el bloque celeste y «Ir a Medidas anotadas ↓»; Talla con gráfica, sin «0–3 años».
- Daniel (C): sin pestañas, la frase de las dos curvas.

## Pruebas

```bash
cd backend && go test ./internal/growth/... -cover
```

```bash
cd frontend && npx vitest run src/features/growth
```

```bash
scripts/e2e-local.sh e2e/crecimiento.spec.ts
```
