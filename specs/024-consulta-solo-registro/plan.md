# Plan de Implementación: Consulta «solo como registro»

**Rama**: `feature/023-calendario-selector-de-dia` (misma rama que la spec 023) | **Fecha**: 2026-10-01 | **Especificación**: [spec.md](./spec.md)

## Resumen

Una consulta gana una marca fija `record_only` puesta al crearla (R1). El servidor, cuando la marca está puesta, **no pide
ni guarda la hora de inicio** de sus medicamentos; como el repositorio solo genera tomas para un medicamento con hora de
inicio, **no se crea ninguna toma** y todo lo que se deriva de las tomas (tomas de hoy, tratamiento activo, recordatorios,
estados) queda vacío sin tocar su código (R2). El frontend agrega el checkbox, quita «Primera toma» mientras está marcado
(R4) y muestra la etiqueta «Solo registro» en el listado y en el detalle, donde además no aparecen la tarjeta «Tratamiento
activo» ni el calendario (R5). Las consultas existentes y las nuevas sin la marca no cambian (R3).

## Contexto Técnico

**Lenguaje/Versión**: Go (backend) y TypeScript + React 19 (frontend). **Dependencias**: ninguna nueva.
**Almacenamiento**: PostgreSQL; migración `0016` de solo agregar una columna con valor por omisión.
**Pruebas**: `go test ./... -cover` (>90 %, con `DATABASE_URL`), Vitest + Testing Library y Playwright a 390/1280 px (>90 %).
**Restricciones**: toda respuesta del backend pasa por `*httpx.Responder` (ya es así); `internal/docs` (Swagger) se
regenera y se confirma en CI; móvil y web son dos diseños (`variant`); textos del Principio I.

## Verificación de la Constitución

- **I**: texto informativo, sin consejo ni evaluación; la etiqueta dice qué es la consulta, no qué hacer. ✅
- **II (privacidad)**: la foto sigue guardándose solo en la cuenta; ningún dato nuevo sensible. ✅
- **III, IV**: sin cuentas ni planes nuevos; la regla de un hijo gratis no cambia. ✅ **V**: sin librerías. ✅
- **VI**: pruebas de unidad y de extremo a extremo (backend, frontend, 390 y 1280 px). ✅
- **Inmutabilidad (spec 004, FR-014)**: la marca se fija al crear y no hay forma de cambiarla. ✅

## Estructura del Proyecto

```text
backend/
├── migrations/0016_add_consultation_record_only.sql   # consultations.record_only BOOLEAN NOT NULL DEFAULT false
└── internal/consultation/
    ├── service.go (+ tests)       # CreateConsultationInput.RecordOnly; la hora de inicio no se pide ni se guarda si está marcada
    ├── repository.go (+ tests)    # inserta record_only; lo lee en el detalle y en el listado
    ├── model.go                   # Consultation.RecordOnly
    ├── handler.go (+ tests)       # recordOnly en la petición y en el listado y el detalle (+ doc Swagger)
    └── …
backend/internal/docs/             # regenerado con swag
frontend/src/features/consultations/
├── types.ts, api.ts               # recordOnly (opcional al leer: un backend viejo no lo manda)
├── ConsultationForm.tsx (+ test)  # checkbox, aviso, envío sin hora de inicio
├── MedicationFieldset.tsx (+ test)# sin «Primera toma» (los dos diseños) cuando está marcado; no se pierde lo escrito
├── missingFields.ts (+ test)      # no pide la hora de inicio con la marca
├── ConsultationCard.tsx (+ test)  # etiqueta «Solo registro»
├── ConsultationDetailPage.tsx (+ test)  # etiqueta; sin «Tratamiento activo» (web)
└── RecordOnlyBadge.tsx (+ test)   # la etiqueta, compartida por la tarjeta y el detalle
frontend/e2e/consulta-solo-registro.spec.ts   # a 390 y 1280 px
CLAUDE.md, backend/CLAUDE.md, frontend/CLAUDE.md, BACKLOG.md
```

## Decisiones (ver research.md)

R1 una columna `record_only` · R2 sin hora de inicio no hay tomas (nada más cambia) · R3 API compatible hacia atrás ·
R4 el formulario · R5 el listado y el detalle · R6 pruebas · R7 documentación y Swagger.
