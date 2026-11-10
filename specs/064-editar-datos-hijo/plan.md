# Plan de Implementación: Editar los datos del hijo

**Rama**: `feature/064-editar-datos-hijo` | **Fecha**: 2026-11-09 | **Spec**: [spec.md](spec.md)

## Resumen

Una ruta nueva, `PUT /children/{childId}`, en el paquete nuevo `internal/childprofile` (nivel completo):
- Corrige el nombre, el apellido, la fecha de nacimiento, la talla y el peso del registro, y sella quién corrigió y cuándo (migración `0035`).
- La talla y el peso se corrigen en cualquier plan; la identidad solo con el plan completo de la cuenta dueña (422 `child_identity`).
- Una fecha de nacimiento posterior a medidas o vacunas ya anotadas se rechaza con 409 `birth_date_conflict` y sus fechas.
- La casilla crea además una medida de crecimiento en la misma transacción.

Para que la regla de la fecha no se pueda evadir, las escrituras de medidas (spec 063) y vacunas (spec 046) vuelven a revisar la fecha contra el nacimiento con la fila del hijo bloqueada.

En el frontend, la fila «Editar datos» en «Lo demás» del detalle del hijo y la página `/children/:childId/editar`, con dos diseños.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.2 (backend), TypeScript + React 19 (frontend PWA)
**Dependencias Principales**: chi, pgx v5, swag (backend); React Router, TanStack Query, react-hook-form, Tailwind v4 (frontend). Sin dependencias nuevas.
**Almacenamiento**: PostgreSQL. Migración `0035` (dos columnas en `children` + CHECK).
**Pruebas**: `go test` contra la base real (con y sin `pool_max_conns=4`), vitest + Testing Library, Playwright (Chromium, 390 y 1280; en el CI)
**Plataforma Objetivo**: API en Railway; PWA en Cloudflare Pages
**Tipo de Proyecto**: web (backend + frontend)
**Metas de Rendimiento**: una transacción corta por guardado. Las consultas de conflicto usan los índices `(child_id, measured_on…)` y `(child_id, applied_on…)` que ya existen.
**Restricciones**: textos libres solo en cuerpos; todo por `*httpx.Responder`; la ruta solo con `fullChild` y nunca en `/child-device`; cobertura > 90 %.
**Escala/Alcance**: 1 tabla tocada, 1 ruta nueva, 4 escrituras endurecidas, 1 página y 1 fila nuevas.

No quedan incógnitas: [research.md](research.md) R1–R10.

## Verificación de la Constitución

| Principio | Cumple | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Solo se corrigen datos capturados. Los textos no evalúan talla ni peso; prueba de redacción en `childProfileText.ts`. |
| II. Privacidad | ✅ | Nombres y valores solo en el cuerpo, nunca en la dirección ni en `error_logs`. No se guarda historial de valores anteriores, solo quién y cuándo. |
| III. Stack | ✅ | Go + pgx + React, sin dependencias. |
| IV. Freemium disciplinado | ✅ | La talla y el peso en cualquier plan. La identidad, con plan completo: la decide el servidor y conserva el propósito de la FR-006a de la spec 001 (no reciclar un hijo). Nada se pierde al bajar de plan. |
| V. Simplicidad | ✅ | Una ruta, dos columnas, la casilla reutiliza `growth`. |
| VI. Pruebas | ✅ | Backend contra la base real con concurrencia y roles en `router_test.go`, frontend > 90 %, E2E a 390 y 1280. |

**Gate**: pasa. Cambia una regla escrita de la spec 001 (FR-006a): se anota allí que la spec 064 la reemplaza, con la decisión del dueño (2026-11-09).

**Re-verificación tras el diseño**: pasa. El contrato no expone datos nuevos más allá del nombre de pila de quien corrigió, que ya se muestra igual en medidas y vacunas.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/064-editar-datos-hijo/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md            (/speckit-tasks)
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── migrations/0035_child_corrections.sql            (nuevo)
├── internal/childprofile/                            (nuevo: model, errors, validate, repository, service, handler, pruebas)
├── internal/account/                                 (ValidateName exportada; childResponse + correctedAt/correctedBy; JOIN del autor en las 4 lecturas de children)
├── internal/growth/repository.go                     (InsertInTx; Create/Update revisan birth_date bajo bloqueo)
├── internal/vaccination/repository.go                (Create/Update bloquean el hijo FOR SHARE y revisan birth_date)
├── internal/server/router.go + router_test.go        (PUT /children/{childId} con fullChild)
├── cmd/api/main.go                                   (cablea childprofile)
└── docs/ (swagger regenerado)

frontend/
├── src/features/childProfile/                        (nuevo: EditChildPage, childProfileText, editChildForm, api, hooks, pruebas)
├── src/features/home/types.ts                        (Child + correctedAt/correctedBy)
├── src/features/childDetail/ChildDetailParts.tsx     (fila «Editar datos» en MoreRows)
├── src/features/account-signup/FreemiumLimitModal.tsx + src/features/plans/planCopy.ts  (reason child_identity)
├── src/App.tsx                                       (ruta /children/:childId/editar)
└── e2e/editar-hijo.spec.ts                           (nuevo)
```

**Decisión de estructura**: un paquete nuevo en cada lado, como las specs 046 y 063. `account` solo gana los dos campos de la respuesta.

## Seguimiento de Complejidad

Sin violaciones que justificar.
