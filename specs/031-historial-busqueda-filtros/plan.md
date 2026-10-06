# Plan de Implementación: Historial con búsqueda y filtros (plan de pago)

**Rama**: `feature/031-historial-busqueda-filtros` | **Fecha**: 2026-10-06 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `specs/031-historial-busqueda-filtros/spec.md`

## Resumen

Un hijo gana una pantalla **Historial** (solo plan de pago) con búsqueda de texto y filtros por fechas, doctor, síntomas,
medicamento y tipo, sobre las consultas que ya existen. En el servidor, dos endpoints nuevos y de solo lectura:
`POST /children/{id}/consultations/search` (el criterio va en el cuerpo para que **no viaje en la dirección**, R1) y
`GET /children/{id}/history-options` (doctores y medicamentos ya registrados, R7). Los criterios se combinan con `AND`;
el texto ignora mayúsculas y acentos con una función de plegado de español **sin extensiones ni migración** (R2). El servidor
decide el plan y rechaza al gratuito con el mismo 422 de la spec 030 (motivo nuevo `history_search`, R6). En la app, una
pantalla `/children/:childId/historial` con **dos diseños** (móvil y web, R12), el criterio guardado en `sessionStorage`
por hijo (R10) y una entrada «Buscar en el historial» en la lista del hijo que, para el plan gratuito, abre el aviso del plan
(R11). Sin tablas, migraciones ni dependencias nuevas.

## Contexto Técnico

**Lenguaje/Versión**: Go (backend) y TypeScript + React 19 (frontend). **Dependencias**: ninguna nueva.
**Almacenamiento**: PostgreSQL; **sin migración** (solo lectura sobre `consultations`, `medications`,
`consultation_symptoms`, `symptoms`, `accounts.plan`).
**Pruebas**: `go test ./... -cover` (>90 %, con `DATABASE_URL`), Vitest + Testing Library (>90 %) y Playwright a 390 y 1280 px.
**Plataforma Objetivo**: PWA (móvil y escritorio) + API en Railway; las E2E corren contra el Clerk de desarrollo.
**Tipo de Proyecto**: aplicación web (backend Go + frontend React).
**Objetivos de Rendimiento**: resultados en < 1 s con 500 consultas por hijo (SC-002); sin índice nuevo (R9).
**Restricciones**: toda respuesta pasa por `*httpx.Responder`; el texto buscado no aparece en direcciones, en `error_logs` ni
en el registro de operación (R1, FR-015); rutas nuevas con `RequireOwner` y fila en `router_test.go`; `internal/docs`
(Swagger) regenerado; móvil y web son dos diseños, `useIsDesktop`, nunca mezclados; textos del Principio I.
**Escala/Alcance**: decenas a cientos de consultas por hijo; hasta 10 hijos por cuenta; sin paginar.

## Verificación de la Constitución

*Antes de la investigación y de nuevo tras el diseño:*

- **I (registra, nunca interpreta)**: la pantalla solo encuentra y muestra lo escrito; sin resúmenes, comparaciones ni
  «parecidos» (la coincidencia es por subcadena, R2/R3); los textos del aviso son neutrales. ✅
- **II (privacidad)**: el texto de búsqueda va en el cuerpo, no en la dirección ni en los registros (R1); `sessionStorage`
  de la pestaña, no el servidor (R10). ✅
- **III (stack)**: Go + React PWA + PostgreSQL; sin tecnología nueva. ✅
- **IV (freemium disciplinado)**: el plan gratuito **sigue viendo todo** lo registrado en su lista (la lista simple no
  cambia, FR-008, SC-003); lo que se cobra es una **función** (buscar y filtrar), nunca el acceso a datos ya capturados. ✅
- **V (simplicidad)**: sin migración, sin extensión, sin paginar, un historial por hijo, reutiliza `ConsultationCard`,
  `SymptomPicker`, `FreemiumLimitModal` y el patrón de la spec 030. ✅
- **VI (pruebas)**: unidad en ambos lados, exactitud contra base real, E2E a 390 y 1280 px. ✅
- **Inmutabilidad de las consultas (spec 004)**: solo lectura. ✅

Re-evaluación tras el diseño: sin violaciones; no hay nada que justificar en «Seguimiento de Complejidad».

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/031-historial-busqueda-filtros/
├── plan.md              # Este archivo
├── research.md          # Fase 0 (R1–R14)
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/
│   └── history-search.md    # POST …/consultations/search y GET …/history-options
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Código Fuente

```text
backend/internal/consultation/
├── search.go (+ search_test.go)      # HistorySearch, validación, foldSpanish, Repository.Search/HistoryOptions, planGate
├── errors.go                         # PlanLimitHistorySearch (motivo nuevo de PlanLimitError)
├── service.go                        # SearchConsultations, HistoryOptions
├── handler.go (+ tests)              # SearchConsultations, HistoryOptions; planLimitBody con el motivo nuevo; Swagger
└── repository.go                     # (sin cambios de comportamiento; reutiliza childExists y el escaneo de la lista)
backend/internal/server/router.go (+ router_test.go)   # 2 rutas nuevas con ownsChild
backend/internal/docs/                                 # regenerado con swag

frontend/src/
├── App.tsx                                            # ruta /children/:childId/historial (RequireSession)
├── features/account-signup/FreemiumLimitModal.tsx     # motivo 'history_search'
└── features/consultations/
    ├── api.ts (+ test), types.ts                      # searchConsultations, fetchHistoryOptions, kind 'plan_limit_history_search'
    ├── historyCriteria.ts (+ test)                    # criterio: valores por omisión, validar/leer/guardar en sessionStorage, conteo de activos
    ├── useHistory.ts (+ test)                         # useHistoryCriteria (estado + debounce del texto), useHistorySearch, useHistoryOptions
    ├── HistoryEntry.tsx (+ test)                      # «Buscar en el historial»: enlace (pago) o botón + «Plan completo» + aviso (gratis)
    ├── HistoryPage.tsx (+ test)                       # los dos diseños, estados vacío/error/sin coincidencias, aviso al gratuito
    ├── HistoryFilters.tsx (+ test)                    # campos: texto, fechas, doctor, medicamento, tipo, síntomas
    ├── ActiveCriteria.tsx (+ test)                    # pastillas quitables y «Limpiar todo»
    └── ChildDetailPage.tsx (+ test)                   # la entrada en ambos diseños
frontend/e2e/historial-consultas.spec.ts               # 390 y 1280 px; pago y gratuito
frontend/e2e/helpers.ts                                # (si hace falta) sembrar varias consultas
CLAUDE.md, backend/CLAUDE.md, frontend/CLAUDE.md, BACKLOG.md
```

**Decisión de Estructura**: aplicación web existente; todo cabe en `internal/consultation` (backend) y
`features/consultations` (frontend), como las specs 019–030. Sin paquetes nuevos.

## Decisiones (ver research.md)

R1 `POST` con cuerpo (privacidad) · R2 plegado de español sin extensión · R3 qué busca el texto · R4 `AND`, fechas incluidas,
síntomas «todos» · R5 validación en el servidor · R6 plan decidido por el servidor, 422 con motivo `history_search` ·
R7 opciones en un `GET` aparte · R8 misma respuesta que la lista · R9 sin índice nuevo · R10 estado en `sessionStorage`
por hijo · R11 entrada y aviso del gratuito · R12 dos diseños sin mock · R13 pruebas · R14 documentación.

## Seguimiento de Complejidad

Sin violaciones de la constitución; no aplica.
