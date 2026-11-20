# Quickstart — validar la spec 078

1. A 390 y 1280 px, elegir una opción en cada control del inventario de `spec.md` (formulario de actividad y suplemento,
   tipo de actividad, aviso de la cita, ficha del hijo, invitar a la familia, unir hijos, rango de crecimiento, unidad del
   botiquín): la elegida se ve en azul de acción con texto blanco (o borde y punto azules en las tarjetas de opción).
2. Lo sin elegir, el borde de error del tipo de actividad, el calendario del tratamiento, las pestañas de crecimiento y «Tu plan
   actual» se ven como antes.

```bash
cd frontend && npx vitest run --coverage
```

```bash
scripts/e2e-local.sh --workers=2 e2e/actividades.spec.ts e2e/tipos-de-actividad.spec.ts e2e/crecimiento.spec.ts e2e/ficha-del-hijo.spec.ts e2e/botiquin.spec.ts e2e/familia.spec.ts e2e/unir-hijos.spec.ts e2e/proxima-cita.spec.ts
```
