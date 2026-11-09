# Plan de Implementación: Curvas de crecimiento

**Rama**: `feature/063-curvas-crecimiento` | **Fecha**: 2026-11-08 | **Spec**: [spec.md](spec.md) | **Mock**: ninguno (sistema visual)

## Resumen

Un historial de medidas por hijo (peso y/o talla con fecha y nota): tabla nueva `growth_measurements` y columna opcional
`children.growth_reference_sex` (migración `0034`). Paquete backend `internal/growth` con la lista, anotar, corregir y borrar
(`seesChild` / `fullChild`, cualquier plan, tope de 500 bajo el bloqueo del hijo), elegir la tabla de la OMS y **la gráfica**:
`GET /children/{childId}/growth-chart`, que decide el plan de la cuenta dueña del hijo (`consultation.RequirePaid`, 422
`growth_chart`) y solo entonces devuelve las medidas **y las curvas P3–P97 de la OMS del sexo elegido**, embebidas en el backend
(el plan gratuito nunca las recibe). Frontend `features/growth/`: la sección «Crecimiento» del detalle del hijo, la pantalla
`/children/:childId/crecimiento` (lista, formulario, gráfica SVG propia con tabla alternativa), en dos diseños. Las curvas quedan
detrás de `WHO_GROWTH_REFERENCE_ENABLED` hasta que el dueño confirme el permiso de la OMS (research R1).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend), TypeScript + React 19 (frontend)
**Dependencias Principales**: chi, pgx v5, TanStack Query, Tailwind v4 — **ninguna nueva** (la gráfica es SVG propio)
**Almacenamiento**: PostgreSQL (`growth_measurements`, `children.growth_reference_sex`); las curvas de la OMS son datos fijos
generados como código Go (`internal/growth/whodata_gen.go`)
**Pruebas**: `go test` contra la base real con y sin `pool_max_conns=4`; Vitest > 90 %; Playwright `crecimiento.spec.ts`
(Chromium, 390 y 1280 px)
**Plataforma Objetivo**: API en Railway; PWA (iOS Safari, Android Chrome, escritorio)
**Tipo de Proyecto**: aplicación web (backend + frontend)
**Metas de Rendimiento**: la gráfica de un hijo con 500 medidas se arma en una petición (< 50 KB de curvas por sexo y vista)
**Restricciones**: Principio I (nunca percentil del hijo ni juicios), textos libres solo en cuerpos, todo por `*httpx.Responder`,
teléfono y web con diseños separados (`useIsDesktop`)
**Escala/Alcance**: hasta 500 medidas por hijo; curvas de 0 a 228 meses (talla) y 0 a 120 meses (peso)

## Verificación de la Constitución

| Principio | Cumple | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | La constitución permite «graficar … curvas de crecimiento». Se grafican los puntos y las curvas de referencia; nada calcula ni guarda el percentil o la puntuación z del hijo (no hay LMS en el código, solo los cinco percentiles publicados), ni colores, flechas o palabras que evalúen (`growthText.test.ts`). Texto fijo: la referencia es de la OMS y la interpreta el pediatra. |
| II. Privacidad | ✅ | Valores y nota solo en cuerpos; `error_logs` sin ellos; la gráfica no sale a terceros (SVG en el teléfono). El sexo para la tabla es opcional y solo sirve para la gráfica. |
| III. Captura de fotos | n/a | Sin fotos. |
| IV. Freemium sin perder datos | ✅ | Anotar, corregir, borrar y ver la lista en cualquier plan; solo la gráfica pide el plan completo, lo decide el servidor y bajar de plan no oculta nada. |
| V. Piezas pequeñas | ✅ | Un paquete nuevo, una tabla, una columna, seis rutas. |
| VI. Pruebas | ✅ | Backend contra la base real, roles en `router_test.go`, frontend > 90 %, E2E a 390 y 1280. |

**Gate**: pasa. Riesgo externo (licencia de la OMS) documentado en R1 con una salida que no bloquea la entrega.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/063-curvas-crecimiento/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── migrations/0034_growth_measurements.sql
├── tools/whogrowth/convert.py         # genera whodata_gen.go desde los archivos de la OMS (no se despliega)
└── internal/growth/
    ├── model.go  errors.go  validate.go        # puro
    ├── whodata_gen.go  reference.go            # curvas fijas + recorte por edad
    ├── repository.go  service.go  handler.go
    └── *_test.go
backend/internal/server/router.go (+ router_test.go)
backend/cmd/api/main.go

frontend/src/features/growth/
├── types.ts  api.ts  hooks.ts
├── growthText.ts (+ prueba de redacción)  growthAge.ts  growthForm.ts
├── GrowthSection.tsx          # tarjeta del detalle del hijo
├── GrowthPage.tsx             # /children/:childId/crecimiento
├── GrowthFormPage.tsx         # /…/crecimiento/nueva y /…/crecimiento/:measurementId/editar
├── GrowthChart.tsx            # SVG + tabla alternativa
└── *.test.ts(x)
frontend/src/features/childDetail/… (entrada), App.tsx (rutas),
features/account-signup/FreemiumLimitModal.tsx + features/plans/planCopy.ts (motivo growth_chart)
frontend/e2e/crecimiento.spec.ts
```

**Decisión de Estructura**: aplicación web, como las specs 046 (cartilla) y 062 (botiquín).

## Seguimiento de Complejidad

| Violación | Por Qué es Necesaria | Alternativa Más Simple Rechazada Porque |
|---|---|---|
| Curvas de la OMS como código generado (~6 tablas × 2 sexos) | El plan gratuito no debe recibirlas y no cambian | Un JSON estático en el frontend lo descarga cualquiera, también el plan gratuito |
