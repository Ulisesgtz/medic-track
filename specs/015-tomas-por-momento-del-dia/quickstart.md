# Quickstart: validar tomas por momento del día

Sin migraciones ni endpoints nuevos.

1. Registrar una consulta con un medicamento cada 8 h, primera toma 00:00 (tomas 00:00, 08:00, 16:00).
2. Detalle (390 y 1280 px): tres grupos con título — **Mañana** (08:00), **Tarde** (16:00), **Noche** (00:00).
3. Con un medicamento cada 24 h desde las 09:00: solo **Mañana**. Los grupos vacíos no aparecen.
4. Tocar una toma de cualquier grupo la marca igual; el selector de día rearma los grupos; la barra (spec 014) no cambia.

```bash
cd frontend && npx vitest run --coverage
cd frontend && npx playwright test e2e/detalle-consulta-movil.spec.ts e2e/detalle-consulta-web.spec.ts
```
