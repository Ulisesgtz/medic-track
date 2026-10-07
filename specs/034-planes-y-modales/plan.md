# Plan: Pantalla de planes y modales del plan completo (spec 034)

**Rama**: `feature/034-planes-y-modales` · **Spec**: [spec.md](./spec.md) · **Diseño**: [referencia/planes-decisiones.md](./referencia/planes-decisiones.md) y el mock `Planes PediTrack.dc.html`.

## Resumen

Solo frontend. Un módulo `features/plans/` con los datos (precio, listas, los siete motivos), `PlanTarjeta`, `PlansPage` (`/planes`) y `PlanAvisoCompacto`; el `FreemiumLimitModal` se reescribe con la estructura del diseño sin cambiar sus props; tres pantallas cambian su bloque «Plan completo» por el aviso compacto; la barra lateral web suma «Planes». Sin API ni migración.

## Decisiones

- **Datos en un solo lugar** (`features/plans/planCopy.ts`): `PLAN_PRICE`, `FREE_ITEMS`, `FULL_ITEMS`, `SOON_ITEMS` y `LIMIT_MOTIVES` (título, línea y tres filas de cada motivo, con `PlanLimitReason` como llave). El modal, la página y los tests leen de ahí; ningún texto de plan en otro archivo.
- **Plan actual** (`planStanding(account)`): `owner` pagado → «Plan completo»; integrante de familia (`account.family`) con plan `paid` → «Plan completo, incluido por la familia de {ownerName}»; si no, «Gratis». Sin fechas de vigencia (no hay suscripción).
- **Cobro**: `PAYMENT_AVAILABLE = false` en `planCopy.ts`; con `false` el botón es el de «Pronto» del diseño. No se construye el botón activo conectado a nada (se agrega con Mercado Pago).
- **Modal**: misma API (`reason`, `onViewPlans`, `onStayFree`, `opener`); `childName` se retira (el diseño ya no lo dice) y se quita de quien lo pasaba. «Ver el plan completo» es `<a href="/planes">` con `preventDefault` y `onViewPlans()`; el foco inicial va a «Ahora no»; la trampa de Tab cicla entre la X, «Ahora no» y el enlace. Móvil: hoja desde abajo (`items-end p-3`, esquinas completas); web: centrado `max-w-[580px]`.
- **Aviso compacto**: `PlanAvisoCompacto({ title, text })` con el pie común y un `Link` a `/planes`; lo usan `SupplementsSection`, `MisSuplementosSeccion` y `FamilyPage`.
- **`/planes` dentro de `AppShell`**; móvil con el encabezado oscuro («← Inicio» como en el diseño no existe: se usa «← Tus hijos» como en las demás pantallas) y web con el texto de encabezado como `RoutinePageFrame`. Se reutiliza `RoutinePageFrame` (ya exportado) para no duplicar el marco.
- **Barra lateral**: «Planes» (`Link` a `/planes`, activo con `useMatch`) bajo la cuenta, antes de «Cerrar sesión».
- **Documentación**: `design-tokens.md` (Modal: franja `ink` con overline «Plan completo») y los tres `CLAUDE.md` y `BACKLOG.md` (cobro, vencido, estados de pago).

## Verificación de la constitución

- **I**: sin sugerencias de salud ni descuentos/urgencia. **II**: «Tus datos de salud no se venden…». **IV**: «Lo registrado se conserva». **VI**: >90 % unitarias y E2E a 390 y 1280 px; se actualizan las E2E del modal existente.
