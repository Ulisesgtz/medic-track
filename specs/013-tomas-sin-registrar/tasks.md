---

description: "Lista de tareas de la spec 013: tomas sin registrar automáticas"
---

# Tareas: Tomas "sin registrar" automáticas

**Entrada**: Documentos de diseño desde `/specs/013-tomas-sin-registrar/`

**Prerrequisitos**: plan.md, spec.md, research.md, data-model.md, contracts/dose-status.md, quickstart.md

**Pruebas**: obligatorias por el Principio VI (>90 % en Go y React; Playwright a 390 y 1280 px). Cada tarea de código
tiene su prueba.

**Organización**: US1 ver el estado nuevo (P1), US2 marcar/desmarcar una toma sin registrar (P1), US3 resúmenes del día
y home (P2).

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: en paralelo (archivos distintos, sin dependencias pendientes)
- **[Historia]**: US1…US3

---

## Fase 1: Configuración

- [X] T001 Línea base: `cd backend && go test ./internal/... -cover` y `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run` en verde (sin migraciones nuevas)

---

## Fase 2: Fundamental (Prerrequisitos Bloqueantes)

**Propósito**: la regla del estado en un solo lugar del backend y el campo `status` en la API y los tipos del frontend.

- [X] T002 Crear `backend/internal/consultation/dosestatus.go`: `type DoseStatus string` con `DoseStatusPending = "pending"`, `DoseStatusDue = "due"`, `DoseStatusTaken = "taken"`, `DoseStatusUnregistered = "unregistered"`, y `StatusAt(scheduledAt time.Time, taken bool, frequencyHours int, now time.Time) DoseStatus` según data-model.md: tomada si `taken`; pendiente si `now < scheduledAt`; sin registrar si `now >= scheduledAt + frequencyHours h`; si no, por marcar (research R1)
- [X] T003 [P] Pruebas en `backend/internal/consultation/dosestatus_test.go` (tabla): antes de su hora → pending; exactamente en su hora → due; 1 ns antes de hora + f → due; exactamente en hora + f → unregistered; marcada en cualquier momento → taken; frecuencia 1 h y 24 h
- [X] T004 Agregar `Status DoseStatus` a `Dose` y `DoseOverview` en `backend/internal/consultation/model.go`; en `backend/internal/consultation/repository.go` calcular `Status` con un `now` recibido como parámetro en `GetByID` (y en `Create` para la respuesta 201), `UpdateDoseStatus` (leyendo `frequency_hours` en el mismo `UPDATE … RETURNING` vía la medicación) y `GetOverview` (agregar `m.frequency_hours` al `SELECT` de tomas); `backend/internal/consultation/service.go` pasa `time.Now()` en cada lectura (research R2)
- [X] T005 En `backend/internal/consultation/handler.go`: `Status string \`json:"status" enums:"pending,due,taken,unregistered"\`` en `doseResponse` y `overviewDoseResponse`, llenado en `toDoseResponse` y en el overview; anotaciones Swagger (contracts/dose-status.md)
- [X] T006 Pruebas de backend en `backend/internal/consultation/repository_test.go`, `overview_test.go` y `handler_test.go`: una consulta con fecha de ayer devuelve `unregistered` en sus tomas de ayer, `due`/`pending` según corresponda y `taken` al marcarlas; `PATCH` que desmarca una toma vieja devuelve `status: "unregistered"`; el overview incluye `status`; actualizar las pruebas existentes que comparan `Dose`/`DoseOverview` completos
- [X] T007 [P] Agregar `export type DoseStatus = 'pending' | 'due' | 'taken' | 'unregistered'` y `status: DoseStatus` a `Dose` y `OverviewDose` en `frontend/src/features/consultations/types.ts`; actualizar los datos de prueba que construyen tomas (`ConsultationDetailPage.test.tsx`, `ChildDetailPage.test.tsx`, `HomePage.test.tsx`, `useDoseToggle.test.tsx`, `NewConsultationPage.test.tsx`, `ConsultationForm.test.tsx`, `api.test.ts`)
- [X] T008 [P] `ClaimDueDoses` en `backend/internal/reminder/repository.go`: agregar `AND d.scheduled_at + make_interval(hours => m.frequency_hours) > $1` al CTE `due` (research R4); prueba en `backend/internal/reminder/repository_test.go`: con un medicamento cada 1 h, una toma de hace 70 min sin marcar (ya sin registrar) no se reclama aunque esté dentro de la ventana, y una de hace 30 min sí
- [X] T009 Regenerar Swagger en `backend/internal/docs/` (`go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd`) y correr `go test ./internal/...`

**Punto de Control**: la API manda el estado de cada toma y los recordatorios respetan la regla.

---

## Fase 3: Historia de Usuario 1 - Ver qué tomas quedaron sin registrar (Prioridad: P1) 🎯 MVP

**Objetivo**: el detalle de la consulta (móvil y web) pinta cada toma según `status`, con el chip nuevo, y se actualiza
solo.

**Prueba Independiente**: una consulta de ayer muestra sus tomas de ayer como "sin registrar" en 390 y 1280 px.

- [X] T010 [P] [US1] Crear `frontend/src/features/consultations/doseStatus.ts`: clases del chip por estado (tomada `bg-confirmed text-white`, por marcar `border-[1.5px] border-pending bg-pending-soft text-[#92400e]`, pendiente `bg-slate-100 text-slate-600`, sin registrar `border-[1.5px] border-dashed border-slate-400 bg-surface text-slate-700`) y el texto `UNREGISTERED_LABEL = 'Sin registrar'` (research R6); prueba en `doseStatus.test.ts`
- [X] T011 [US1] En `frontend/src/features/consultations/MedicationCard.tsx`: `DoseChip` usa `dose.status` (se quita el `isFuture` con el reloj del teléfono); con `unregistered`, debajo de la hora una línea de 11 px "sin registrar" (`aria-hidden`) y `aria-describedby` a un texto oculto "Sin registrar"; nombre fijo "Toma de HH:MM" y `aria-pressed` como hoy; misma área táctil (FR-007)
- [X] T012 [US1] En `frontend/src/features/consultations/ConsultationDetailPage.tsx`: `refetchInterval: 60_000` y `refetchIntervalInBackground: false` en la consulta del detalle (research R3)
- [X] T013 [US1] Pruebas en `frontend/src/features/consultations/ConsultationDetailPage.test.tsx`: cada estado con su estilo; el chip sin registrar tiene borde punteado, el texto "sin registrar" y `aria-describedby` que se lee "Sin registrar"; ya no depende de la hora del dispositivo (una toma futura según el reloj local pero `unregistered` según el servidor se pinta sin registrar); la consulta se vuelve a pedir cada 60 s (timers falsos)
- [X] T014 [US1] E2E en `frontend/e2e/detalle-consulta-hijo.spec.ts` (390 y 1280 px): consulta creada por API con fecha de ayer, cada 8 h por 2 días desde 08:00 → sus tomas de ayer muestran "sin registrar"; ajustar las aserciones de chips ámbar que dependan de la hora de la corrida en `e2e/detalle-consulta-movil.spec.ts` y `e2e/detalle-consulta-web.spec.ts`

**Punto de Control**: el estado nuevo se ve en el detalle.

---

## Fase 4: Historia de Usuario 2 - Marcar después una toma sin registrar (Prioridad: P1)

**Objetivo**: tocar una toma sin registrar la marca; desmarcarla la regresa a sin registrar.

**Prueba Independiente**: tocar una toma de ayer (sin registrar) → verde; tocarla otra vez → sin registrar.

- [X] T015 [US2] En `frontend/src/features/consultations/useDoseToggle.ts`: al responder el `PATCH`, usar el `status` que devuelve el servidor para la toma (en lugar de calcular `taken` solo), así desmarcar una toma vieja la deja en `unregistered`; prueba en `useDoseToggle.test.tsx`
- [X] T016 [US2] E2E en `frontend/e2e/detalle-consulta-hijo.spec.ts` (390 y 1280 px): marcar una toma sin registrar la deja tomada; desmarcarla vuelve a "sin registrar"

**Punto de Control**: el padre corrige cualquier toma, como hoy.

---

## Fase 5: Historia de Usuario 3 - "Tomas de hoy" y el home con el estado nuevo (Prioridad: P2)

**Objetivo**: resúmenes del día coherentes con el detalle (aclaración A).

**Prueba Independiente**: con una toma sin registrar y otra por marcar hoy, revisar bloque, panel y tarjeta del home.

- [X] T017 [US3] En `frontend/src/features/consultations/TodayDosesBlock.tsx`: "sin marcar" = no tomadas y no `unregistered`; resumen `"N sin marcar · M sin registrar · Nombres"` (omitiendo lo que sea 0); si solo quedan sin registrar: estado menta "Sin tomas pendientes" y una línea "M sin registrar", sin botón; "Marcar tomas" manda solo las sin marcar (FR-009)
- [X] T018 [US3] En `frontend/src/features/consultations/TodayDosesPanel.tsx`: las tomas `unregistered` usan el estilo de `doseStatus.ts` y el botón dice "Sin registrar" (sigue siendo un toggle que las marca); en `frontend/src/features/consultations/ChildDetailPage.tsx`, el `SummaryCard` "Tomas de hoy" cuenta las sin marcar y su línea dice `"sin marcar · M sin registrar"` cuando hay; `refetchInterval: 60_000` en la consulta del overview
- [X] T019 [US3] En `frontend/src/features/home/ChildCard.tsx`: el chip "N tomas hoy" no cuenta las `unregistered` (y `refetchInterval: 60_000` en su overview)
- [X] T020 [US3] Pruebas en `frontend/src/features/consultations/ChildDetailPage.test.tsx` (bloque móvil y panel/tarjeta web: conteos, texto, "Marcar tomas" sin las sin registrar, solo sin registrar → menta sin botón) y `frontend/src/features/home/HomePage.test.tsx` (chip del home sin las sin registrar)
- [X] T021 [US3] E2E en `frontend/e2e/detalle-hijo-movil.spec.ts` (y el web correspondiente si aplica): con una consulta de ayer y otra de hoy, el bloque dice "sin registrar" aparte y "Marcar tomas" no cambia las de ayer

**Punto de Control**: resúmenes y detalle dicen lo mismo.

---

## Fase 6: Pulido y Transversales

- [X] T022 Diseño: capturas del chip "sin registrar" en el detalle (390 y 1280 px), del bloque "Tomas de hoy" y del panel web; revisar contraste (≥ 4.5:1) y que se distinga en escala de grises (SC-005); mostrarlas al usuario para aprobarlas
- [X] T023 [P] Revisar textos contra el Principio I (SC-004): ningún "no tomada", "olvidada", "atrasada" ni sugerencia de reponer
- [X] T024 [P] Anotar en `specs/007-homologar-pantallas-a-mocks/spec.md` la desviación: chip "sin registrar" nuevo en los mocks 02/03/13 y el tablero
- [X] T025 [P] Actualizar mapas: `CLAUDE.md` (feature 013), `backend/CLAUDE.md` (`StatusAt`, `status` en la API, condición de `ClaimDueDoses`), `frontend/CLAUDE.md` (estados de los chips, `doseStatus.ts`, `refetchInterval`, conteos del día); marcar B2 como hecho en `BACKLOG.md`
- [X] T026 Cobertura y calidad: `gofmt`, `go vet ./...`, `go test ./internal/... -cover` (>90 %); `npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage` (>90 %)
- [X] T027 E2E afectados en Chromium, Firefox y WebKit y validación manual de quickstart.md §1–§4
- [ ] T028 Commit(s), push de `feature/013-tomas-sin-registrar`, PR a `develop` y code review

---

## Dependencias y Orden de Ejecución

- Fase 1 → Fase 2 (bloquea todo) → US1 → US2 y US3 → Pulido.
- US2 depende de US1 (el chip ya pinta `status`). US3 depende de la Fase 2 y reutiliza `doseStatus.ts` de US1 (T010).
- T008 (recordatorios) es independiente del frontend.

## Oportunidades de Paralelismo

- Fase 2: T003 (pruebas de la regla) con T004; T007 (tipos del frontend) y T008 (recordatorios) en paralelo con el
  backend de consultas.
- US1: T010 en paralelo con T012.
- Pulido: T023, T024, T025.

## Estrategia de Implementación

- **MVP**: Fases 1–3 (el estado se ve en el detalle). US2 es pequeña y va inmediatamente después; US3 cierra la
  coherencia de los resúmenes. Un solo PR al terminar.
