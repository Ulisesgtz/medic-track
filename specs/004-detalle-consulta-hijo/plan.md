# Plan de Implementación: Detalle de Hijo — Consultas y Recetas

**Rama**: `004-detalle-consulta-hijo` | **Fecha**: 2026-09-17 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/004-detalle-consulta-hijo/spec.md`

## Resumen

Al hacer click en un hijo desde la home page (specs/003-home-listado-hijos), el padre llega a una pantalla de detalle que lista sus consultas médicas (fecha + doctor). Desde ahí puede registrar una consulta nueva (doctor, fecha, foto de receta obligatoria, uno o más medicamentos con frecuencia/duración, síntomas), con OCR del lado del cliente como ayuda de autollenado editable. Al abrir el detalle de una consulta ya guardada, ve la receta, los medicamentos y — si definió horario de inicio — todas las tomas esperadas del tratamiento completo (generadas de una sola vez al guardar), marcables como tomada/no tomada en cualquier momento, sin importar si el tratamiento ya terminó. Las consultas son inmutables una vez guardadas, igual que los hijos en specs/001. Es la primera vez que el proyecto captura datos de salud reales (fotos de recetas, medicamentos) — la app únicamente los registra, nunca los interpreta ni valida (Principio I).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend), TypeScript + React 18 + Vite (frontend) — stack existente, sin cambios

**Dependencias Principales**: Backend: `chi`, `pgx/v5`, `google/uuid` (todas ya en uso, sin dependencias nuevas). Frontend: React Router, TanStack Query, React Hook Form, Tailwind (ya en uso), + **`tesseract.js`** (dependencia nueva, ver research.md — OCR corre en el navegador, no en el backend).

**Almacenamiento**: PostgreSQL — 3 tablas nuevas (`consultations`, `medications`, `doses`), migraciones `0006`-`0008`. La foto de la receta se guarda como `bytea` en `consultations` (ver research.md — sin proveedor de almacenamiento de objetos decidido todavía, ni infraestructura de archivos persistente entre despliegues).

**Pruebas**: `go test` + `testify` (backend, patrón table-driven ya establecido); Vitest + Testing Library (componentes/hooks de frontend, incluyendo mockear `tesseract.js`); Playwright E2E para el flujo crítico (registrar consulta → verla en el listado → abrir su detalle → marcar una toma), por Principio VI — coincide textualmente con uno de los 4 flujos críticos ya nombrados en la constitución ("escaneo de receta", "marcar dosis como tomada", "timeline de consultas").

**Plataforma Objetivo**: Misma PWA existente (mobile-first, responsive), mismo backend HTTP

**Tipo de Proyecto**: Aplicación web (Opción 2) — extiende tanto `backend/` como `frontend/`

**Objetivos de Rendimiento**: Listado de consultas visible en menos de 2s (SC-001); el detalle de una consulta con su foto y tomas debe cargar sin bloquear la interacción aunque la foto pese varios MB.

**Restricciones**: La foto de la receta MUST capturarse vía `<input type="file" accept="image/*" capture>` — MUST NOT usar `getUserMedia` (Principio III). El sistema MUST NOT calcular, validar ni opinar sobre dosis/interacciones (Principio I, NON-NEGOTIABLE) — el backend solo persiste lo que el formulario envía y lo que el padre marca. Tamaño máximo de foto: 8 MB (detalle de implementación, ver research.md — no es un requisito de negocio, solo un límite técnico razonable para el `bytea` + tiempo de subida en 3G/4G).

**Escala/Alcance**: Un padre ve solo las consultas de sus propios hijos; sin límite de consultas ni medicamentos por consulta (spec.md, Supuestos). Volumen esperado: bajo (una familia, consultas episódicas, no un flujo de alto tráfico).

## Verificación de la Constitución

*GATE: Debe aprobarse antes de la investigación de la Fase 0. Volver a verificar tras el diseño de la Fase 1.*

- **Principio I (Registra, Nunca Interpreta) — NON-NEGOTIABLE**: Esta es la funcionalidad donde este principio más se pone a prueba. El OCR (FR-006) es estrictamente una ayuda de autollenado de campos editables — nunca se guarda su salida cruda (FR-006, verificado explícitamente). El marcado de tomas (FR-011/FR-016) es un simple check tomada/no-tomada sin ningún cálculo de dosis, acumulación ni interacción entre medicamentos (FR-012). ✅ Cumple — sin excepción necesaria, pero es el área de mayor vigilancia en implementación y pruebas.
- **Principio II (Privacidad)**: Las fotos de recetas son el dato de salud más sensible capturado hasta ahora en el proyecto. Decisión de research.md: el OCR corre **del lado del cliente** (`tesseract.js`, en el navegador) precisamente para que la foto nunca se envíe a ningún servicio de OCR de terceros — solo viaja del navegador al propio backend de PediTrack. Continúa la misma postura sin autenticación real ya aceptada en specs/003 (nota heredada, sin cambios aquí). ✅ Cumple, con nota de continuidad.
- **Principio III (Stack Tecnológico Fijo)**: Go + React + PostgreSQL, sin dependencias backend nuevas. Única dependencia nueva es `tesseract.js` en el frontend, para cumplir exactamente la restricción de este mismo principio (nunca `getUserMedia`, captura vía `<input type="file" capture>`). ✅ Cumple.
- **Principio IV (Freemium Disciplinado)**: Esta funcionalidad no introduce ningún límite ni gate de plan — las consultas no se restringen por plan freemium (spec.md no lo menciona, y el principio dice explícitamente "sin limitar por volumen de uso"). ✅ Cumple.
- **Principio V (Simplicidad y MVP Real)**: Esta funcionalidad **sí forma parte del alcance MVP explícito** de la constitución ("foto→extracción→confirmación manual, timeline de consultas, recordatorios con 'dosis tomada'") — no requiere excepción en Seguimiento de Complejidad. Decisiones de research.md (tomas generadas de una sola vez, sin job recurrente; foto en `bytea` sin proveedor de almacenamiento externo) están explícitamente alineadas con YAGNI.
- **Principio VI (Cobertura de Pruebas Obligatoria)**: Todos los endpoints y componentes nuevos DEBEN tener cobertura >90%. El flujo registrar→ver→marcar toma DEBE tener cobertura Playwright E2E, por ser uno de los 4 flujos críticos nombrados explícitamente en la constitución.

**Resultado**: Aprobado. Sin excepciones que requieran Seguimiento de Complejidad.

**Re-verificación tras el diseño (Fase 1)**: research.md y data-model.md confirman que el OCR nunca toca el backend (Principio II, cliente-only vía `tesseract.js`) y que `doses.taken` es el único campo mutable de todo el modelo (Principio I — nada más se calcula ni se corrige server-side). Ningún contrato expone edición/borrado de `Consultation`/`Medication` (Principio I, FR-014). Sin cambios al resultado: Aprobado.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/004-detalle-consulta-hijo/
├── plan.md                          # Este archivo
├── research.md                      # Fase 0
├── data-model.md                    # Fase 1
├── contracts/
│   ├── get-consultations.md         # Fase 1 — GET /children/{childId}/consultations
│   ├── post-consultations.md        # Fase 1 — POST /children/{childId}/consultations
│   ├── get-consultation-detail.md   # Fase 1 — GET /consultations/{consultationId}
│   └── patch-dose.md                # Fase 1 — PATCH /consultations/{consultationId}/doses/{doseId}
├── quickstart.md                    # Fase 1
└── tasks.md                         # Fase 2 (/speckit-tasks)
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── internal/consultation/           # NUEVO — paralelo a internal/account, internal/catalog
│   ├── model.go                     # Consultation, Medication, Dose structs
│   ├── errors.go                    # ErrChildNotFound, ErrConsultationNotFound, ValidationErrors (reutiliza el patrón de account)
│   ├── repository.go                # Inserts en una transacción (Consultation + Medications + Doses generadas de una vez); GetByChild, GetByID; UpdateDoseStatus
│   ├── service.go                   # Validación de campos, orquesta la generación de tomas (horario inicio + frecuencia + duración → N tomas), reutiliza validateNameFormat-style helpers si aplica
│   └── handler.go                   # GET/POST /children/{childId}/consultations, GET /consultations/{consultationId}, PATCH .../doses/{doseId} — todos vía *httpx.Responder
├── migrations/
│   ├── 0006_create_consultations_table.sql
│   ├── 0007_create_medications_table.sql
│   └── 0008_create_doses_table.sql
└── cmd/api/main.go                  # + 4 rutas nuevas

frontend/
├── src/features/consultations/      # NUEVO
│   ├── ChildDetailPage.tsx           # Reemplaza ChildDetailPlaceholder.tsx: listado de consultas del hijo + botón "Registrar consulta"
│   ├── ConsultationCard.tsx          # Tarjeta de consulta en el listado (fecha + doctor)
│   ├── ConsultationForm.tsx          # Formulario de registro: doctor, fecha, foto (input file+capture), medicamentos (field array), síntomas
│   ├── MedicationFieldset.tsx        # Un medicamento repetible: nombre, frecuencia, duración, horario de inicio opcional
│   ├── useOcrSuggestion.ts           # Hook: corre tesseract.js sobre la foto adjunta, expone texto extraído para autollenado editable
│   ├── ConsultationDetailPage.tsx    # Detalle: foto, doctor, fecha, medicamentos, tomas marcables, síntomas
│   ├── DoseCheckbox.tsx              # Un registro de toma marcable (tomada/no tomada)
│   ├── api.ts                       # fetchConsultations, createConsultation, fetchConsultationDetail, updateDoseStatus
│   └── types.ts
└── src/App.tsx                      # La ruta /children/:childId pasa de ChildDetailPlaceholder a ChildDetailPage; + ruta /consultations/:consultationId
```

**Decisión de Estructura**: Se crea `internal/consultation` como paquete nuevo (no se extiende `internal/account`) porque introduce entidades y reglas de negocio completamente nuevas (Consultation/Medication/Dose, generación de tomas) sin relación directa con las reglas de cuenta/freemium que vive en `account` — mismo criterio de organización por dominio que separó `catalog` de `account`. En frontend, `features/consultations/` reemplaza el contenido de la ruta `/children/:childId` (el `ChildDetailPlaceholder.tsx` de specs/003 se elimina) y agrega la ruta de detalle de consulta.

## Seguimiento de Complejidad

*Sin violaciones que justificar — ver Verificación de la Constitución arriba.*
