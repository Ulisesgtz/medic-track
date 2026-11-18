# Plan de Implementación: Ficha de datos permanentes del hijo

**Rama**: `feature/073-ficha-del-hijo` | **Fecha**: 2026-11-17 | **Especificación**: [spec.md](spec.md)

**Entrada**: Especificación de la funcionalidad desde `specs/073-ficha-del-hijo/spec.md`

## Resumen

Una ficha por hijo —alergias, tipo de sangre, padecimientos, pediatra con «Llamar» y una nota— escrita y mostrada tal
cual (Principio I), en cualquier plan. Backend: paquete `internal/childrecord`, migración `0039` (tres tablas),
`GET`/`PUT /children/{childId}/record` (Mark / Full) con reemplazo completo y versión entera (409 `record_conflict`),
borrado y descarga de la spec 070, bloque `record` en el PDF. Frontend: `features/childRecord/` (sección en el detalle,
página de edición, portada del PDF), guardada sin conexión. Las pantallas se construyen del mock de Claude Design
cuando llegue. Detalle en [research.md](research.md).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.2; TypeScript + React 19 (Vite, PWA).

**Dependencias Principales**: chi, pgx, `httpx.Responder`, `access`/`authmw` (`seesChild`/`fullChild`),
`accountdeletion`, `dataexport`, `historyexport`; React Hook Form (`useFieldArray`), TanStack Query,
`@react-pdf/renderer` (portada). Ninguna dependencia nueva.

**Almacenamiento**: PostgreSQL, migración `0039` (`child_records`, `child_record_allergies`, `child_record_conditions`).

**Pruebas**: Go (unidad + repositorio con Postgres), Vitest > 90 %, Playwright a 390 y 1280 px con
`scripts/e2e-local.sh`.

**Plataforma Objetivo**: API en Railway; PWA en Cloudflare Pages.

**Tipo de Proyecto**: aplicación web (backend + frontend).

**Objetivos de Rendimiento**: una lectura y una escritura por ficha; sin consultas extra en el detalle del hijo más
allá del `GET` de la ficha.

**Restricciones**: Principio I (nada compara ni avisa); Principio II (solo cuerpos JSON, nunca en `error_logs`,
direcciones, correos ni avisos); el teléfono del hijo no la alcanza; cualquier plan.

**Escala/Alcance**: 2 rutas, 1 migración, 1 paquete de backend, 1 carpeta de frontend, cambios en purga, descarga, PDF
y sin conexión; 6 estados de diseño.

## Verificación de la Constitución

| Principio | ¿Cumple? | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Texto libre mostrado tal cual; sin catálogos médicos, sin cruces con recetas, sin avisos ni colores; prueba de redacción. **Confirmado por el dueño** (FR-020). |
| II. Privacidad | ✅ | Solo en cuerpos; prueba de que `error_logs` no la guarda; descarga y borrado completos (spec 070); sin conexión con las reglas de la 067. **Confirmado por el dueño** (FR-020). Pendiente del dueño: aviso de privacidad. |
| III. Stack fijo | ✅ | Go + React + PostgreSQL. |
| IV. Freemium | ✅ | Cualquier plan (decisión del dueño). |
| V. Simplicidad | ✅ | Reemplazo completo con versión entera; sin historial de versiones; sin catálogos. |
| VI. Pruebas | ✅ | Unidad > 90 % en `childrecord` y lo nuevo del frontend; E2E de editar, ver como Cuidador, conflicto y PDF. |
| Reglas del repo | ✅ | `Responder` en todo; filas en `router_test.go` (niveles) y `phoneRoutes` sin cambios; paso en `purgeSteps`; `routePatterns.ts`; mocks tal cual; web y teléfono separados. |

Re-verificación tras el diseño: sin violaciones.

## Estructura del Proyecto

### Documentación

```text
specs/073-ficha-del-hijo/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md · contracts/ui.md (se completa con el mock)
├── checklists/requirements.md
├── referencia/            # el mock de Claude Design cuando llegue
└── tasks.md               # /speckit-tasks
```

### Código Fuente

```text
backend/
├── migrations/0039_child_records.sql
├── internal/childrecord/          # NUEVO: model, validate, repository (Get, Save con versión), handler, tests
├── internal/server/router.go      # GET seesChild / PUT fullChild; filas en router_test.go
├── internal/accountdeletion/purge.go   # pasos de las tres tablas + autor a NULL
├── internal/dataexport/collect.go      # ficha, ficha_alergias, ficha_padecimientos
├── internal/historyexport/             # `record` en documentResponse
└── cmd/api/main.go                     # wiring

frontend/
├── src/features/childRecord/      # NUEVO: api, hooks, ChildRecordSection, EditChildRecordPage, recordText, callLink
├── src/features/consultations/ChildDetailPage.tsx   # la sección (lugar según el mock)
├── src/features/pdfExport/document/Cover.tsx         # la ficha en la portada
├── src/shared/offline/persistPolicy.ts               # raíz `child-record`
├── src/shared/clientErrors/routePatterns.ts          # /children/:childId/ficha/editar
├── src/App.tsx                                       # la ruta
└── e2e/ficha-del-hijo.spec.ts
```

## Orden sugerido

1. Migración + `childrecord` + rutas + pruebas (no depende del mock).
2. Purga, descarga y `record` en el PDF (backend).
3. Frontend: api/hooks/textos/validación del formulario y la raíz sin conexión.
4. Al llegar el mock: sección, página de edición, portada del PDF, E2E y medición.
5. Mapas `CLAUDE.md`, BACKLOG (ficha del titular, QR), pendientes del dueño.

## Pendientes del dueño

- El mock de Claude Design (estados A–F).
- Aplicar la `0039` en DEV antes del merge.
- Aviso de privacidad: alergias, tipo de sangre, padecimientos y pediatra.

## Seguimiento de Complejidad

Sin violaciones.
