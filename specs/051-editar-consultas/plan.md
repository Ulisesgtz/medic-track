# Plan de Implementación: Editar consultas ya guardadas

**Rama**: `feature/051-editar-consultas` | **Fecha**: 2026-10-26 | **Especificación**: [spec.md](spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/051-editar-consultas/spec.md`

## Resumen

Un `PUT /consultations/{consultationId}` (nivel `Full`, cualquier plan) recibe la consulta entera y, en una sola transacción con
la cuenta, la consulta y sus medicamentos bloqueados, actualiza datos y síntomas, quita los medicamentos sin marcas que ya no
vienen, agrega los nuevos y, a los que cambiaron de horario, les quita solo las tomas futuras sin marcar y les crea las del
nuevo horario que aún no llegan y no repiten una hora conservada. Guarda quién y cuándo editó (migración `0030`) y rechaza una
edición sobre una versión vieja (409). En la app, «Editar consulta» abre el mismo formulario de «Nueva consulta» en modo
edición, con una confirmación neutral cuando el cambio rehace tomas. Detalle en [research.md](research.md).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend), TypeScript + React 19 (frontend)

**Dependencias Principales**: chi, pgx/v5, Clerk (sesión); React Hook Form, TanStack Query, Tailwind v4. Ninguna nueva.

**Almacenamiento**: PostgreSQL; migración `0030` (dos columnas y un CHECK en `consultations`)

**Pruebas**: `go test` contra la base real (con y sin `pool_max_conns=4`), Vitest + Testing Library, Playwright (Chromium, 390 y 1280 px)

**Plataforma Objetivo**: API en Railway; PWA en Cloudflare Pages (iPhone/Android instalada y navegador de escritorio)

**Tipo de Proyecto**: aplicación web (backend + frontend)

**Objetivos de Rendimiento**: guardar una edición en < 1 s con 10 medicamentos y 60 días de tomas (una transacción, inserciones por lote)

**Restricciones**: lo marcado y lo pasado nunca cambia (FR-009); atómico (FR-014); textos libres solo en el cuerpo (FR-017)

**Escala/Alcance**: un endpoint, una migración, una página (dos diseños) y un modo del formulario existente

## Verificación de la Constitución

| Principio | Cómo se cumple |
|---|---|
| I. Registra, nunca interpreta | La edición corrige lo que el padre capturó; ningún texto evalúa ni aconseja («Las tomas que ya marcaste no cambian…»); textos en `editText.ts` con prueba de redacción |
| II. Privacidad | Doctor, notas y nombres solo en el cuerpo; nunca en la dirección ni en `error_logs` (prueba); «Editada por» muestra el nombre de pila, no el correo |
| III. Stack fijo | Go + PostgreSQL + React PWA; sin dependencias nuevas |
| IV. Freemium disciplinado | Editar no se cobra; solo se conserva la regla del plan gratuito al crear (un tratamiento activo a la vez) |
| V. Simplicidad | Un endpoint que reutiliza la validación, `generateDoseSchedule`, `checkPlan`/`checkPhotoCap` y el formulario de creación; sin historial de versiones |
| VI. Cobertura | > 90 % en backend y frontend; E2E del flujo a 390 y 1280 px |

**Resultado**: sin violaciones. Re-evaluado después del diseño (Fase 1): igual. La spec 004 (FR-014, consultas inmutables)
gana su cuarta excepción; se anota en los mapas y en la spec 004 al cerrar.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/051-editar-consultas/
├── spec.md
├── plan.md              # este archivo
├── research.md          # R1–R9
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── migrations/0030_consultation_edits.sql          # nuevo
└── internal/
    ├── consultation/
    │   ├── edit.go            # nuevo: UpdateConsultationInput, Service.UpdateConsultation, Repository.Update (R2–R6)
    │   ├── edit_handler.go    # nuevo: PUT, request/response, mapeo de errores
    │   ├── errors.go          # ErrEditConflict, ErrMedicationHasMarks, mensajes
    │   ├── model.go           # Consultation.EditedAt/EditedBy
    │   ├── repository.go      # getByID lee edited_at/por quién; symptoms helper compartido
    │   ├── handler.go         # detalle con createdAt y edited
    │   └── edit_test.go, edit_handler_test.go   # nuevos
    └── server/router.go (+ router_test.go)      # r.With(fullConsultation).Put(...)

frontend/src/
├── App.tsx                                           # ruta /consultations/:consultationId/editar
└── features/consultations/
    ├── EditConsultationPage.tsx (+ test)             # nuevo
    ├── ConsultationForm.tsx (+ tests)                # modo edición
    ├── MedicationFieldset.tsx                        # campos bloqueados / «Quitar» condicionado
    ├── editText.ts (+ test)                          # textos y prueba de redacción
    ├── editValues.ts (+ test)                        # detalle → valores, cambio de horario, cuerpo del PUT
    ├── api.ts, types.ts                              # updateConsultation, ConsultationApiError kinds nuevos
    └── ConsultationDetailPage.tsx                    # «Editar consulta» y «Editada el … por …»

frontend/e2e/editar-consulta.spec.ts                  # nuevo
```

**Decisión de Estructura**: la de siempre (backend + frontend). La edición vive en el paquete `consultation` (es su dominio y
reutiliza su validación y su transacción); en el frontend, un modo del formulario existente, no un formulario nuevo.

## Seguimiento de Complejidad

Sin violaciones que justificar.
