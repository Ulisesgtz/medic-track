# Plan de Implementación: Tomas "sin registrar" automáticas

**Rama**: `feature/013-tomas-sin-registrar` | **Fecha**: 2026-09-29 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/013-tomas-sin-registrar/spec.md`

## Resumen

Cada toma gana un cuarto estado visible, **sin registrar**, cuando no está marcada y ya llegó la hora de la siguiente
toma de su medicamento — que siempre es su hora + la frecuencia, también para la última (research R1). El estado se
**deriva** en el backend con su propio reloj y viaja como `status` en cada toma (detalle, alta, `PATCH` y overview); no
hay columna nueva. El frontend deja de decidir con el reloj del teléfono, pinta el chip nuevo (borde punteado + "sin
registrar") y vuelve a pedir los datos cada 60 s para que el cambio se vea solo. Los resúmenes del día cuentan las sin
registrar aparte y "Marcar tomas" no las marca (aclaración A). Los recordatorios nunca reclaman una toma sin registrar.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend); TypeScript + React 19 + Vite (frontend) — stack existente.

**Dependencias Principales**: sin dependencias nuevas.

**Almacenamiento**: PostgreSQL, **sin migración** (estado derivado, [data-model.md](./data-model.md)).

**Pruebas**: `go test` + `testify` (función de estado con tabla de casos, repositorio/handlers de `consultation`,
`ClaimDueDoses` de `reminder`); Vitest (chips, bloque, panel, tarjeta del home, conteos); Playwright a 390 y 1280 px con
consultas de ayer para no depender de la hora de la corrida. Cobertura >90 % (Principio VI).

**Plataforma Objetivo**: la PWA existente y el backend HTTP.

**Tipo de Proyecto**: aplicación web — extiende `backend/` y `frontend/`.

**Objetivos de Rendimiento**: el cambio de estado se ve en menos de un minuto (SC-002): una petición pequeña cada 60 s
por pantalla abierta y visible.

**Restricciones**: texto "Sin registrar", nunca "no tomada/olvidada" (Principio I); se distingue sin color; sin rojo ni
ámbar; estado igual en todos los dispositivos (reloj del servidor); `taken` sigue siendo lo único que el padre cambia.

**Escala/Alcance**: decenas de tomas por consulta; sin cambios de volumen.

## Verificación de la Constitución

*GATE: Debe aprobarse antes de la investigación de la Fase 0. Volver a verificar tras el diseño de la Fase 1.*

- **Principio I (Registra, Nunca Interpreta)**: el estado solo describe que **nadie marcó** la toma a tiempo, calculado
  del horario que el padre registró; no afirma que no se dio, no sugiere darla tarde ni reponerla, y no genera avisos
  (FR-005, FR-012). La palabra "Sin registrar" y la regla ("al llegar la siguiente toma") las eligió el usuario
  (BACKLOG B2, 2026-09-29), que cuenta como la confirmación explícita. ✅ Cumple.
- **Principio II (Privacidad)**: ningún dato nuevo ni tercero nuevo. ✅
- **Principio III (Stack)**: sin cambios. ✅
- **Principio IV (Freemium)**: disponible en el plan gratuito. ✅
- **Principio V (Simplicidad)**: sin columna, sin proceso periódico: una función de estado y un `refetchInterval`
  (research R2, R3). ✅
- **Principio VI (Pruebas)**: unitarias en ambos lados >90 % y E2E a 390/1280 px. ✅
- **Convención — mocks**: el chip nuevo no está en los mocks 02/03/13/tablero; se diseña con `design-tokens.md`
  (research R6), en móvil y web por separado, y se muestran capturas al usuario (anotado como desviación en la spec 007).

**Re-verificación tras la Fase 1**: el diseño no agrega datos ni avisos; sin violaciones.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/013-tomas-sin-registrar/
├── spec.md
├── plan.md               # este archivo
├── research.md           # Fase 0
├── data-model.md         # Fase 1
├── quickstart.md         # Fase 1
├── contracts/
│   └── dose-status.md    # Fase 1
├── checklists/requirements.md
└── tasks.md              # Fase 2 (/speckit-tasks)
```

### Código Fuente (raíz del repositorio)

```text
backend/internal/
├── consultation/
│   ├── dosestatus.go (+ _test)    # DoseStatus y StatusAt(scheduledAt, taken, frequencyHours, now)
│   ├── model.go                   # Status en Dose y DoseOverview
│   ├── repository.go              # frecuencia en el overview; Status al leer detalle, overview y UpdateDoseStatus
│   ├── service.go                 # pasa el reloj (now) a las lecturas
│   └── handler.go                 # "status" en doseResponse y overviewDoseResponse (+ Swagger)
├── reminder/repository.go         # ClaimDueDoses: scheduled_at + frequency_hours > now
└── docs/                          # Swagger regenerado

frontend/src/features/
├── consultations/
│   ├── types.ts                   # DoseStatus; status en Dose y OverviewDose
│   ├── doseStatus.ts              # estilos/textos por estado, compartidos por chips y panel
│   ├── MedicationCard.tsx         # DoseChip por status (sin reloj del teléfono), chip "sin registrar"
│   ├── TodayDosesBlock.tsx        # "N sin marcar · M sin registrar"; "Marcar tomas" sin las sin registrar
│   ├── TodayDosesPanel.tsx        # "Sin registrar" en el panel web
│   ├── ChildDetailPage.tsx        # SummaryCard "Tomas de hoy" con las sin registrar aparte; refetchInterval
│   └── ConsultationDetailPage.tsx # refetchInterval 60 s
└── home/ChildCard.tsx             # "N tomas hoy" sin las sin registrar

frontend/e2e/                      # detalle-consulta-*, detalle-hijo-movil, detalle-consulta-hijo
CLAUDE.md, backend/CLAUDE.md, frontend/CLAUDE.md, specs/007 (desviación del chip)
```

**Decisión de Estructura**: aplicación web, como las specs anteriores. La regla vive en una sola función de Go
(`consultation`), que usan las lecturas; `reminder` aplica la misma condición en su SQL.

## Seguimiento de Complejidad

Sin violaciones de la constitución que justificar.
