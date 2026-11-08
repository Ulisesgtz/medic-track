# Plan de Implementación: Botiquín de la casa

**Rama**: `feature/062-botiquin` | **Fecha**: 2026-11-06 | **Spec**: [spec.md](spec.md) | **Mock**: [referencia/Botiquín PediTrack.dc.html](referencia/)

## Resumen

Un botiquín por familia (el de la cuenta dueña): tabla nueva `medicine_cabinet_items` (migración `0033`), paquete backend
`internal/cabinet` con seis rutas bajo `/accounts/{accountId}/medicine-cabinet…` protegidas por la regla de familia que ya existe
(`access.OnAccount`: ver = Mark, cambiar = Full), agregar pide el plan de la dueña y un tope de 200. Frontend
`features/medicineCabinet/`: lista con buscador, formulario con foto y lectura en el teléfono (`parseMedicineText`), detalle con
visor y quitar, la fila «Checa tus medicamentos» del inicio, «Botiquín» en la barra lateral web y el atajo «Agregar al botiquín»
en las tarjetas de medicamento del detalle de la consulta. Construido del mock entregado, medido a 390 y 1280 px.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend), TypeScript + React 19 (PWA)
**Dependencias**: pgx v5, chi; TanStack Query, React Router, Tailwind v4, tesseract.js (ya en el proyecto)
**Almacenamiento**: PostgreSQL, tabla nueva `medicine_cabinet_items` (foto como `bytea`, como la cartilla)
**Pruebas**: `go test` contra la base real (con y sin `pool_max_conns=4`), Vitest + Testing Library, Playwright (CI)
**Plataforma**: Railway (API) y Cloudflare Pages (PWA)
**Tipo**: web (backend + frontend)
**Metas**: la lista trae metadatos sin las fotos; cada foto se pide sola al mostrarla
**Restricciones**: `*httpx.Responder`, textos libres solo en cuerpos, la lectura de la foto en el teléfono
**Escala**: hasta 200 medicamentos por familia

## Verificación de la Constitución

| Principio | Cómo se cumple |
|---|---|
| I. Registra, nunca interpreta | La caducidad es solo un dato (sin «caducado», colores ni orden por fecha); la lectura solo propone; prueba de redacción. |
| II. Privacidad | Lectura en el teléfono; nombre/nota solo en cuerpos; el atajo pasa datos por el estado del router, no la dirección. |
| III. El servidor decide | Nivel (`OnAccount`), plan y tope en el servidor, en una transacción con la fila de la dueña. |
| IV. Corregir no se cobra | Editar y quitar en cualquier plan; agregar pide el plan completo. |
| V. Piezas pequeñas | Un paquete backend y un módulo frontend, reutilizando foto, OCR, encabezado y diálogos. |
| VI. Pruebas | Backend contra la base real, frontend > 90 %, E2E a 390 y 1280 px. |

**Gate**: pasa. Revisado tras el diseño: sin cambios.

## Estructura

### Documentación

```text
specs/062-botiquin/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md · tasks.md
├── contracts/api.md
├── checklists/requirements.md
└── referencia/Botiquín PediTrack.dc.html (+ desviaciones.md al terminar)
```

### Código

```text
backend/migrations/0033_medicine_cabinet.sql
backend/internal/cabinet/            # model, validate (puro), repository, service, handler (+ Swagger), pruebas
backend/internal/server/router.go    # seis rutas (seesAccount / fullAccount) + filas en router_test.go
backend/cmd/api/main.go              # cableado
backend/internal/docs/               # Swagger regenerado

frontend/src/features/medicineCabinet/
├── types.ts · api.ts · hooks.ts · cabinetAccess.ts
├── cabinetText.ts (+ test) · parseMedicineText.ts (+ test) · expiresText.ts
├── CabinetPage.tsx (lista) · CabinetFormPage.tsx · CabinetItemPage.tsx · CabinetRow.tsx
├── CabinetEntry.tsx (fila del inicio) · AddToCabinetLink.tsx (atajo de la consulta)
frontend/src/App.tsx                                     # rutas /botiquin…
frontend/src/features/home/HomePage.tsx, ChildrenSidebar.tsx
frontend/src/features/consultations/MedicationCard.tsx   # el atajo
frontend/src/features/account-signup/FreemiumLimitModal.tsx, features/plans/planCopy.ts  # motivo medicine_cabinet
frontend/e2e/botiquin.spec.ts
```

## Seguimiento de Complejidad

Sin violaciones.
