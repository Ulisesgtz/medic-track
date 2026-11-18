# Plan de Implementación: Un hijo registrado dos veces al unirse a una familia

**Rama**: `feature/074-unir-hijo-duplicado` | **Fecha**: 2026-11-18 | **Especificación**: [spec.md](spec.md)

**Entrada**: Especificación de la funcionalidad desde `specs/074-unir-hijo-duplicado/spec.md`

## Resumen

Al aceptar una invitación, quien tiene hijos propios elige: **unir** (mover todo lo de su hijo al hijo de la familia,
sin borrar nada, conservando autores; irreversible, con resumen y descarga), **ocultar** sus hijos (sin borrarlos) o
**conservar ambos**. Backend: migración `0040` (`children.hidden_at`, `child_merges`, cuatro FK diferibles), paquete
`internal/childmerge` (opciones, vista previa y unión por pareja en una transacción que mueve filas con `UPDATE`
directo al hijo de la familia), ocultar en `account`, filtros en avisos e inicio, limpieza al salir de la familia,
purga y descarga. Frontend: `features/family/merge/` del mock de Claude Design. Detalle en [research.md](research.md).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.2; TypeScript + React 19 (Vite, PWA).

**Dependencias Principales**: chi, pgx, `httpx.Responder`, `access`, `family`, `account`, `childrecord` (fundir la
ficha), `childdevice` (quitar accesos), `reminder` (filtro de ocultos), `accountdeletion`, `dataexport`; TanStack
Query. Ninguna dependencia nueva.

**Almacenamiento**: PostgreSQL, migración `0040_child_merge_and_hide.sql` ([data-model.md](data-model.md)).

**Pruebas**: Go (unidad + repositorio con Postgres, incluida `TestMerge_KnowsEveryChildTable`), Vitest > 90 %,
Playwright a 390 y 1280 px con `scripts/e2e-local.sh`.

**Plataforma Objetivo**: API en Railway; PWA en Cloudflare Pages.

**Tipo de Proyecto**: aplicación web (backend + frontend).

**Objetivos de Rendimiento**: una unión es una transacción con ~10 `UPDATE` indexados por `child_id`; se espera bajo
un segundo con cientos de filas.

**Restricciones**: Principio I (nada decide cuál registro vale; la sugerencia solo dice «Se llaman igual»); Principio
II (nombres solo en cuerpos; `child_merges` sin datos de salud; la persona decide que sus datos pasan a la familia);
todo o nada por pareja; el teléfono del hijo no ve nada nuevo.

**Escala/Alcance**: 4 rutas nuevas + cambios en 2 respuestas, 1 migración, 1 paquete nuevo, filtros en avisos y
cuenta, 3 pantallas nuevas (A, B–E, H) y entradas en «Familia», «Mi cuenta» y el detalle del hijo.

## Verificación de la Constitución

| Principio | ¿Cumple? | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | La app sugiere por nombre igual y nunca aplica la sugerencia; la persona elige cada dato distinto; vacunas repetidas se conservan; prueba de redacción. |
| II. Privacidad | ✅ | Los datos pasan a la familia solo por decisión explícita con resumen, advertencia y descarga (decisión del dueño 2026-11-18); `child_merges` solo con números; nada en direcciones ni `error_logs`. Pendiente del dueño: aviso de privacidad. |
| III. Stack fijo | ✅ | Go + React + PostgreSQL. |
| IV. Freemium | ✅ | Ocultar en cualquier plan; unir exige ser Tutor de una familia de pago (ya es la regla de nivel `Full`); ocultar no secuestra datos (se descargan y se vuelven a mostrar). |
| V. Simplicidad | ✅ | Mover con `UPDATE` sin copiar ids; FK diferibles solo las cuatro necesarias; sin deshacer (decisión del dueño). |
| VI. Pruebas | ✅ | Unidad > 90 % en `childmerge` y lo nuevo del frontend; prueba de inventario de tablas; E2E de unir, ocultar y Cuidador. |
| Reglas del repo | ✅ | `Responder` en todo; filas en `router_test.go`; `phoneRoutes` sin cambios; pasos en `purgeSteps`; `routePatterns.ts`; mock tal cual; web y teléfono separados. |

Re-verificación tras el diseño: sin violaciones.

## Estructura del Proyecto

### Documentación

```text
specs/074-unir-hijo-duplicado/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md · contracts/ui.md (se completa con el mock)
├── checklists/requirements.md
├── referencia/prompt-claude-design.md   # y el mock cuando llegue
└── tasks.md                             # /speckit-tasks
```

### Código Fuente

```text
backend/
├── migrations/0040_child_merge_and_hide.sql
├── internal/childmerge/            # NUEVO: model, pairing (sugerencia), options, preview, merge (transacción), handler, tests
├── internal/childrecord/           # función para fundir dos fichas dentro de una transacción ajena
├── internal/childdevice/           # quitar los accesos de un hijo dentro de una transacción ajena
├── internal/account/               # hidden_at: filtros, hiddenChildren, merges, PUT hidden-children
├── internal/family/repository.go   # Leave/RemoveMember limpian hidden_at
├── internal/reminder/              # candidates.go, appointment.go: sin avisos a cuentas de hijos ocultos
├── internal/server/router.go       # 4 rutas; filas en router_test.go
├── internal/accountdeletion/purge.go   # child_merges
├── internal/dataexport/collect.go      # uniones
└── cmd/api/main.go                     # wiring

frontend/
├── src/features/family/merge/      # NUEVO: MergeFlow, HowToContinuePage, pairing, mergeText, api, hooks
├── src/features/family/InvitationPage.tsx   # navega a /familia/como-seguir
├── src/features/family/FamilyPage.tsx       # entradas de unir y ocultar
├── src/features/account/AccountPage.tsx     # «Hijos ocultos»
├── src/features/childDetail/                 # línea «Se unió…»
├── src/App.tsx · src/shared/clientErrors/routePatterns.ts
└── e2e/unir-hijos.spec.ts
```

## Orden sugerido

1. Migración `0040` y la unión en el backend con su prueba de inventario (no depende del mock).
2. Ocultar: columna, filtros (cuenta, avisos), `PUT hidden-children`, limpieza al salir.
3. Purga, descarga, `merges` en las respuestas.
4. Frontend: api/hooks/`pairing.ts`/textos.
5. Con el mock: pantallas A–H, entradas, E2E y medición a 390/1280 px.
6. Mapas `CLAUDE.md`, BACKLOG, pendientes del dueño.

## Pendientes del dueño

- El mock de Claude Design (prompt en `referencia/prompt-claude-design.md`).
- Aplicar la `0040` en DEV antes del merge.
- Aviso de privacidad: la persona puede pasar los datos de su hijo a la familia que la invitó.

## Seguimiento de Complejidad

| Elemento | Por qué | Alternativa más simple descartada |
|---|---|---|
| Cuatro FK `DEFERRABLE` | Mover consultas con síntomas y citas en una transacción sin cambiar ids | Copiar y borrar: cambia ids y rompe avisos ya enviados e idempotencia de «Tomada» |
