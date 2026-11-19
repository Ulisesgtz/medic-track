# Plan de Implementación: Tipos de actividad

**Rama**: `feature/075-tipos-de-actividad` | **Fecha**: 2026-11-19 | **Especificación**: [spec.md](spec.md)

**Entrada**: Especificación de la funcionalidad desde `specs/075-tipos-de-actividad/spec.md`

## Resumen

Cada actividad (de un hijo o propia) tiene un **tipo** de un catálogo fijo y ampliable con SQL (Escolar, Deportiva,
Artística y cultural, Terapia y seguimiento, Hábitos y cuidado diario, Otra), obligatorio al crear; las existentes
quedan en «Hábitos y cuidado diario». La sección «Actividades» del detalle del hijo y de `/yo` se separa en segmentos
por tipo. Backend: migración `0041` (tabla `activity_types` + `supplement_routines.activity_type` con su CHECK),
`GET /catalog/activity-types`, `activityType` en crear/editar/respuestas y la ruta `PUT /routines/{id}/activity-type`
que cambia solo el tipo **sin plan** y en cualquier estado. Frontend: campo en el formulario, «Tipo · Cambiar» en el
detalle y agrupación pura en `RegistroCompacto`. Detalle en [research.md](research.md).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.2; TypeScript + React 19 (Vite, PWA).

**Dependencias Principales**: chi, pgx, `httpx.Responder`, `internal/catalog`, `internal/supplement`, `access`,
`dataexport`; TanStack Query. Ninguna dependencia nueva.

**Almacenamiento**: PostgreSQL, migración `0041_activity_types.sql` ([data-model.md](data-model.md)).

**Pruebas**: Go (unidad + repositorio con Postgres), Vitest > 90 %, Playwright a 390 y 1280 px con
`scripts/e2e-local.sh`.

**Plataforma Objetivo**: API en Railway; PWA en Cloudflare Pages.

**Tipo de Proyecto**: aplicación web (backend + frontend).

**Objetivos de Rendimiento**: sin cambio perceptible; el catálogo son 6 filas, cacheadas 10 min en el cliente.

**Restricciones**: Principio I (el tipo solo organiza; sin sugerir tipo, sin colores de alerta); Principio IV (cambiar
el tipo no se cobra); tomas, marcas y avisos intactos; web y teléfono separados.

**Escala/Alcance**: 1 tabla de catálogo + 1 columna, 2 rutas nuevas, 1 campo en las respuestas de rutina; formulario,
detalle y sección de actividades en el frontend.

## Verificación de la Constitución

| Principio | ¿Cumple? | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | El padre elige; la app no sugiere ni corrige el tipo; textos con prueba de redacción; sin rojo/verde/ámbar. |
| II. Privacidad | ✅ | Categoría elegida de una lista, no un dato de salud nuevo; nada en direcciones ni `error_logs`; entra en la descarga. |
| III. Stack fijo | ✅ | Go + React + PostgreSQL. |
| IV. Freemium | ✅ | Crear sigue las reglas del plan de hoy; cambiar solo el tipo, en cualquier plan y estado. |
| V. Simplicidad | ✅ | Patrón de catálogo existente (`symptoms`, `vaccine_catalog`); agrupar en el cliente; una ruta pequeña en vez de reglas de plan por campo. |
| VI. Pruebas | ✅ | Unidad > 90 % en lo nuevo; prueba de la CHECK y del relleno; E2E de crear, segmentos y cambiar tipo. |
| Reglas del repo | ✅ | `Responder` en todo; fila en `router_test.go`; nada nuevo bajo `/child-device`; mock tal cual; mapas `CLAUDE.md`. |

Re-verificación tras el diseño: sin violaciones.

## Estructura del Proyecto

### Documentación

```text
specs/075-tipos-de-actividad/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md · contracts/ui.md (se completa con el mock)
├── checklists/requirements.md
├── referencia/prompt-claude-design.md   # y el mock cuando llegue
└── tasks.md                             # /speckit-tasks
```

### Código Fuente

```text
backend/
├── migrations/0041_activity_types.sql
├── internal/catalog/              # ListActivityTypes (modelo, repo, handler, tests)
├── internal/supplement/           # activityType: modelo, validate, create/update, ruta de cambio de tipo, tests
├── internal/server/router.go      # GET /catalog/activity-types, PUT /routines/{id}/activity-type; router_test.go
├── internal/dataexport/collect.go # columna tipo_de_actividad
├── internal/accountdeletion/      # el catálogo en la lista de tablas sin cuenta (TestPurge_KnowsEveryTable)
└── internal/docs/                 # swagger regenerado

frontend/
├── src/shared/catalog/            # fetchActivityTypes, useActivityTypes
├── src/features/supplements/      # types, api, routineValues, RoutineForm (campo), RoutineDetailPage (Tipo · Cambiar),
│                                  # ActivityTypeDialog, groupByActivityType.ts, RegistroCompacto (segmentos), activityTypeText.ts
├── src/shared/offline/persistPolicy.ts   # catálogo persistido, si hace falta
└── e2e/tipos-de-actividad.spec.ts
```

## Orden sugerido

1. Migración `0041` y backend completo (no depende del mock).
2. Frontend: catálogo, tipos, agrupación pura y textos.
3. Con el mock: formulario, detalle, segmentos, E2E y medición a 390/1280 px.
4. Mapas `CLAUDE.md`, BACKLOG (marcar en spec), pendientes del dueño.

## Pendientes del dueño

- El mock de Claude Design (prompt en `referencia/prompt-claude-design.md`).
- Aplicar la `0041` en DEV antes del merge.

## Seguimiento de Complejidad

| Elemento | Por qué | Alternativa más simple descartada |
|---|---|---|
| Ruta propia para cambiar el tipo | Cambiar el tipo sin plan y en una actividad finalizada, sin tocar las reglas del `PATCH` | Comparar campo por campo en el `PATCH` para saltar el plan: frágil y mezcla reglas |
