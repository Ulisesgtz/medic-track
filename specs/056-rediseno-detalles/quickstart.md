# Quickstart: validar el rediseño de las pantallas de detalle (spec 056)

## Pruebas automáticas

```bash
cd frontend && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4
cd frontend && npx tsc --noEmit && npx eslint .
cd frontend && npx playwright test e2e/detalle-hijo.spec.ts e2e/mi-dia.spec.ts e2e/detalle-consulta-movil.spec.ts --project=chromium
```

(Las E2E necesitan `VITE_CLERK_PUBLISHABLE_KEY` en `frontend/.env.local`; si no está, las corre el CI.)

## Revisión contra los diseños (390 y 1280 px)

Con el arnés de la spec 055 (Clerk sustituido, API falsa) y cada diseño servido con su `support.js`:

1. **Encabezado**: Familia (H1), detalle de suplemento (H2), Cartilla (H3), nuevo suplemento (H4, «Guardar» fijo abajo),
   Mi día (H5), solo lectura (H6), Historial (H7, búsqueda pegada), consulta con doctor largo (H8), cargando y error.
2. **Detalle del hijo**: día normal, todo marcado, hijo recién agregado, plan gratuito, Cuidador, cargando.
3. **Detalle de la consulta**: hoy, otro día con una cancelada, terminado y recorrido, solo registro, Cuidador, cargando,
   error.
4. **Mi día**: con cosas por marcar, todo marcado, sin nada creado, plan gratuito, cargando.

En el teléfono: marcar una toma de hoy desde el detalle del hijo y de la consulta sin bajar la pantalla (SC-001). Lo que no
coincida va a `referencia/desviaciones.md` con su motivo.
