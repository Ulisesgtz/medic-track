# Plan de Implementación: Síntomas seleccionables y notas previas a la consulta

**Rama**: `feature/012-sintomas-notas-consulta` | **Fecha**: 2026-09-28 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/012-sintomas-notas-consulta/spec.md`

## Resumen

Al registrar una consulta, el padre elige los síntomas tocando chips agrupados por categoría, y el cuadro de texto
"Síntomas" pasa a ser "Notas previas a la consulta". El catálogo vive en una tabla `symptoms` del backend (sembrada con
23 síntomas, ampliable con un `INSERT`) y se sirve público en `GET /catalog/symptoms`. Lo elegido se guarda en
`consultation_symptoms`, que vincula consulta, hijo, cuenta y síntoma; la base garantiza con llaves compuestas que hijo
y cuenta son los de la consulta. Se escribe en la misma transacción que la consulta y es inmutable. La columna
`consultations.symptoms` se renombra a `notes`, conservando el texto de las consultas anteriores. El listado y el
detalle muestran los síntomas. Detalle de cada decisión en [research.md](./research.md).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend); TypeScript + React 19 + Vite (frontend) — stack existente.

**Dependencias Principales**: sin dependencias nuevas (chi, pgx, clerk-sdk-go; React Hook Form, TanStack Query,
Tailwind).

**Almacenamiento**: PostgreSQL, migración `0012`: tablas `symptoms` (con siembra) y `consultation_symptoms`, renombre
`consultations.symptoms → notes`, `UNIQUE (id, child_id)` en `consultations` y `UNIQUE (id, account_id)` en `children`
([data-model.md](./data-model.md)).

**Pruebas**: `go test` + `testify` con BD real (repositorios de `consultation` y `catalog`, servicio, handlers,
`router_test.go`); Vitest + Testing Library (`SymptomPicker`, formulario, tarjeta, detalle, `useSymptoms`); Playwright a
390 y 1280 px (research R9). Cobertura >90% (Principio VI).

**Plataforma Objetivo**: la PWA existente (móvil y escritorio) y el backend HTTP.

**Tipo de Proyecto**: aplicación web — extiende `backend/` y `frontend/`.

**Objetivos de Rendimiento**: marcar 3 síntomas en menos de 10 s (SC-001): chips visibles sin abrir nada; el catálogo
se pide una vez y queda en caché. Sin impacto medible en el guardado (un `INSERT … SELECT` más en la misma transacción).

**Restricciones**: la relación nunca puede apuntar a otro hijo u otra cuenta (llaves compuestas); consultas inmutables;
texto anterior conservado carácter por carácter; nada de sugerencias a partir de síntomas; el OCR no toca síntomas ni
notas; `aria-pressed` y 44 px por chip.

**Escala/Alcance**: 23 síntomas en 6 categorías; pocos síntomas por consulta.

## Verificación de la Constitución

*GATE: Debe aprobarse antes de la investigación de la Fase 0. Volver a verificar tras el diseño de la Fase 1.*

- **Principio I (Registra, Nunca Interpreta)**: la funcionalidad registra lo que el padre **observó** ("lo que el
  padre/madre observó" es justamente lo que el principio manda guardar). Los nombres describen observaciones, no
  diagnósticos ("Dolor de oído", no "otitis"), y no hay sugerencias, alertas, gravedad ni recomendaciones (FR-005). El
  catálogo y sus textos los pidió y revisó el usuario el 2026-09-28 (BACKLOG, sección A), que cuenta como la
  confirmación explícita que exige la constitución para cambios que tocan este principio. ✅ Cumple.
- **Principio II (Privacidad)**: los síntomas son datos de salud del menor y se guardan igual que el resto de la
  consulta: en la base propia, solo visibles para el dueño (spec 008), sin terceros. El catálogo público no contiene
  datos de nadie. No se agregan servicios externos. ✅ Cumple.
- **Principio III (Stack Fijo)**: Go + React PWA + PostgreSQL, sin librerías nuevas. ✅ Cumple.
- **Principio IV (Freemium)**: disponible en el plan gratuito, sin límites. ✅ Cumple.
- **Principio V (Simplicidad)**: dos tablas (las que pidió el usuario), sin tabla de categorías, sin pantalla de
  administración del catálogo (se mantiene con SQL), sin intensidad ni estadísticas. El "hijo y cuenta" en la relación
  es una columna más de lo mínimo, pedida explícitamente y protegida por la base en vez de por código. ✅ Cumple.
- **Principio VI (Pruebas)**: unitarias en ambos lados con >90% y E2E del registro a 390 y 1280 px. ✅ Cumple.
- **Convención del proyecto — mocks**: no hay mock de los chips. Se diseñan con
  `specs/005-identidad-visual-front-end/design-tokens.md` (research R7/R8), en móvil y en web sin mezclar, y se muestran
  capturas al usuario para aprobarlas (FR-019). Sacar el cuadro de notas del grupo "Leído de tu receta" en el web se
  anota como desviación del mock 14 en la spec 007.

**Re-verificación tras la Fase 1**: el diseño (catálogo público de solo lectura, relación con llaves compuestas,
inserción en la transacción de la consulta, renombre `notes`) no cambia ninguna conclusión. Sin violaciones.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/012-sintomas-notas-consulta/
├── spec.md
├── plan.md                  # este archivo
├── research.md              # Fase 0
├── data-model.md            # Fase 1
├── quickstart.md            # Fase 1
├── contracts/
│   └── symptoms-api.md      # Fase 1
├── checklists/requirements.md
└── tasks.md                 # Fase 2 (/speckit-tasks)
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── migrations/0012_create_symptoms.sql          # symptoms (+ siembra), consultation_symptoms, notes, UNIQUE compuestos
├── docs/                                        # Swagger regenerado
└── internal/
    ├── catalog/                                 # Symptom, Repository.ListSymptoms, Handler.ListSymptoms (+ tests)
    ├── consultation/
    │   ├── model.go                             # Notes, Symptoms []Symptom, SymptomNames []string
    │   ├── service.go                           # CreateConsultationInput.Notes/SymptomCodes, sin duplicados
    │   ├── repository.go                        # INSERT … SELECT en la transacción; lectura en listado y detalle
    │   ├── errors.go                            # ErrSymptomNotAvailable → 400 symptom_not_available
    │   ├── handler.go                           # notes, symptomCodes, symptoms, symptomNames (+ Swagger)
    │   └── *_test.go
    └── server/router.go (+ router_test.go)      # GET /catalog/symptoms público

frontend/
├── src/
│   ├── shared/catalog/                          # fetchSymptoms + useSymptoms (+ tests)
│   └── features/consultations/
│       ├── SymptomPicker.tsx                    # chips por categoría, aria-pressed, catálogo fallido (+ test)
│       ├── SymptomChips.tsx                     # pastillas de solo lectura del detalle (+ test)
│       ├── ConsultationForm.tsx                 # sección síntomas + "Notas previas a la consulta" en ambos diseños
│       ├── ConsultationCard.tsx                 # "Fiebre, Tos, Vómito +2 · N medicamentos", notas como respaldo
│       ├── ConsultationDetailPage.tsx           # síntomas y notas, móvil y web
│       ├── api.ts, types.ts                     # notes, symptomCodes, symptoms, symptomNames; error symptom_not_available
│       └── *.test.tsx
└── e2e/                                         # detalle-consulta-hijo, nueva-consulta-movil/web, helpers (symptoms → notes)

.github/workflows/ci.yml                          # sin cambios (aplica todas las migraciones en orden)
CLAUDE.md, backend/CLAUDE.md, frontend/CLAUDE.md # mapas
specs/007-homologar-pantallas-a-mocks/spec.md    # desviación del mock 14 (notas fuera del grupo de la receta)
```

**Decisión de Estructura**: aplicación web (backend + frontend), como las specs anteriores. El catálogo va en el paquete
`catalog` existente (mismo patrón que países), la relación en `consultation`; en el frontend el hook del catálogo va en
`shared/catalog` y los componentes en `features/consultations`.

## Seguimiento de Complejidad

Sin violaciones de la constitución que justificar.
