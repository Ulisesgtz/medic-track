# Tareas: Pantalla de planes y modales del plan completo (spec 034)

**Entrada**: [plan.md](./plan.md), [spec.md](./spec.md), [referencia/planes-decisiones.md](./referencia/planes-decisiones.md). Un solo PR; un commit por fase.

## Fase 1: Datos y componentes

- [x] T301 `frontend/src/features/plans/planCopy.ts`: `PLAN_PRICE`, `PAYMENT_AVAILABLE`, `FREE_ITEMS`, `FULL_ITEMS`, `SOON_ITEMS`, `LIMIT_MOTIVES` (los siete motivos con sus tres filas) y `planStanding(account)`; pruebas
- [x] T302 `PlanTarjeta.tsx` y `PlanAvisoCompacto.tsx` (+ pruebas)
- [x] T303 `PlansPage.tsx` (`/planes`, dos diseños, estados gratuita / de pago / invitada, bloques fijos y «Próximamente»), ruta en `App.tsx` y «Planes» en la barra lateral web (+ pruebas)

## Fase 2: Modal y avisos

- [x] T311 Reescribir `FreemiumLimitModal` con la estructura del diseño (franja `ink`, comparación, precio, «Ahora no» / «Ver el plan completo»), mismas props; quitar `childName`; actualizar sus pruebas y las de quien lo abre
- [x] T312 Aviso compacto en `SupplementsSection`, `MisSuplementosSeccion` y `FamilyPage` (+ pruebas)
- [x] T313 Verificar: `npx tsc -p tsconfig.app.json --noEmit && npx eslint . && npx vitest run --coverage` (>90 %), commit

## Fase 3: E2E y cierre

- [x] T321 E2E `planes.spec.ts` (390 y 1280 px: cuenta gratuita, de pago, invitada; los siete motivos que ya tienen camino) y actualizar las E2E del modal existente
- [x] T322 Documentación (`CLAUDE.md` ×2, `design-tokens.md`, `BACKLOG.md`, `README.md`), code review, PR a `develop`
