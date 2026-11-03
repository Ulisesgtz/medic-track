# Tareas: Consultas del titular

**Entrada**: documentos de diseño de `specs/058-consultas-del-titular/` (spec, plan, research R1–R9, data-model, contracts/api.md,
quickstart).
**Rama**: `feature/058-consultas-del-titular` · **un commit por fase** (mensaje `feat(058): …` / `test(058): …` / `docs(058): …`,
con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

**Pruebas**: la constitución (Principio VI) las exige: > 90 % por paquete en Go y en el frontend, E2E a 390 y 1280 px. Cada fase
incluye las suyas.

**Reglas que valen para todas las tareas**:
- Los archivos del repo son CRLF: editarlos con scripts de Python que conserven el final de línea (los heredocs de bash se rompen
  con apóstrofes).
- Dentro de una transacción todo va por `tx`, nunca por el pool (lección de la spec 045). Las pruebas se corren también con
  `pool_max_conns=4`.
- Toda respuesta del API va por `*httpx.Responder`.
- Los textos libres (doctor, notas, medicamentos, búsqueda) nunca van en una dirección ni en `error_logs`.
- `DATABASE_URL=postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable`.
- Vitest: `--testTimeout=30000 --maxWorkers=4`; `npm run build` compila también las pruebas.
- La E2E necesita las llaves de Clerk, que no hay en este equipo: la corre el CI.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración (la migración)

**Propósito**: el esquema que todo lo demás usa. Aplicarla en la base local; **mostrarle al usuario el SQL completo** para
aplicarlo en DEV antes del merge.

- [X] T001 Escribir `backend/migrations/0032_own_consultations.sql` en una transacción (`BEGIN; … COMMIT;`, comentarios en español
  sin acentos como las demás), en este orden:
  - `consultations`: `ADD COLUMN account_id UUID REFERENCES accounts (id)`; `UPDATE consultations c SET account_id = ch.account_id
    FROM children ch WHERE ch.id = c.child_id`; `ALTER COLUMN account_id SET NOT NULL`; `ALTER COLUMN child_id DROP NOT NULL`;
    `ADD CONSTRAINT consultations_id_account_id_key UNIQUE (id, account_id)`; `ADD CONSTRAINT consultations_child_account_fkey
    FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id)`; índice `idx_consultations_own ON consultations
    (account_id, consult_date DESC) WHERE child_id IS NULL`.
  - `consultation_symptoms`: `ALTER COLUMN child_id DROP NOT NULL`; `ADD CONSTRAINT consultation_symptoms_consultation_account_fkey
    FOREIGN KEY (consultation_id, account_id) REFERENCES consultations (id, account_id)`.
  - `consultation_appointments`: `ALTER COLUMN child_id DROP NOT NULL`; `ADD CONSTRAINT
    consultation_appointments_consultation_account_fkey FOREIGN KEY (consultation_id, account_id) REFERENCES consultations (id,
    account_id)`; índice `idx_consultation_appointments_own ON consultation_appointments (account_id, starts_at) WHERE child_id IS
    NULL`.
  - `CREATE TABLE own_consultation_sharing (account_id UUID PRIMARY KEY REFERENCES accounts (id), shared BOOLEAN NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now())`.
  - `CREATE TABLE own_consultation_reminder_optins (consultation_id UUID NOT NULL REFERENCES consultations (id), account_id UUID
    NOT NULL REFERENCES accounts (id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (consultation_id, account_id))`.
- [X] T002 Aplicar la `0032` a la base local (`psql "$DATABASE_URL" -f backend/migrations/0032_own_consultations.sql`) y
  comprobar `SELECT count(*) FROM consultations WHERE account_id IS NULL` = 0.
- [X] T003 [P] Prueba de la migración en `backend/internal/consultation/migration_0032_test.go`: cada consulta de un hijo tiene el
  `account_id` de su hijo; un `INSERT` de una consulta de un hijo con el `account_id` de otra cuenta falla (llave compuesta); un
  síntoma o una cita con `(consultation_id, account_id)` que no coincide con su consulta falla; una consulta sin hijo se inserta.
- [X] T004 Agregar la `0032` a la lista de migraciones de `backend/CLAUDE.md` y de los pasos de CI (`.github/workflows/ci.yml`, si
  ahí se aplican una por una); commit de la fase; **mostrar al usuario el SQL completo de la `0032`** para aplicarlo en DEV.

---

## Fase 2: Fundamental (backend: la cuenta dueña y el acceso)

**Propósito**: que todo lo que hoy encuentra la cuenta dueña por `children.account_id` la lea de `consultations.account_id`, y que
el acceso sepa qué hacer con una consulta propia. **Bloquea todas las historias.**

- [X] T005 `backend/internal/consultation/repository.go`: `Create` escribe `consultations.account_id` (la cuenta del hijo,
  leída en la misma `tx`); el `INSERT … SELECT` de `consultation_symptoms` toma `child_id` y `account_id` **de la consulta**, no de
  `children`; las consultas de lectura que unen `children` solo para llegar a la cuenta (`accountPlanOf`, la del detalle en ~701,
  la del tope de fotos `checkPhotoCap` en ~234/275/299) usan `co.account_id`. El tope de fotos cuenta **por
  `consultations.account_id`** (las fotos propias entran en el mismo tope de 100, R2). La regla del plan gratuito de la spec 030
  (`checkPlan`, «otro tratamiento activo en la cuenta») sigue contando **solo consultas con hijo** (`child_id IS NOT NULL`, R4).
- [X] T006 `backend/internal/consultation/edit.go`: síntomas por la cuenta de la consulta (~416); la consulta de ~438 por
  `co.account_id`; la regla `active_treatment` de `Update` solo aplica si la consulta tiene hijo y solo cuenta consultas con hijo.
- [X] T007 [P] `backend/internal/appointment/repository.go`: las lecturas del plan de una consulta (~84, ~222) por
  `co.account_id`; `Create` llena `child_id` desde la consulta (puede ser nulo) y `account_id` desde `consultations.account_id`.
- [X] T008 [P] `backend/internal/ownership/repository.go`: `OwnsConsultation` por `consultations.account_id` (si todavía se usa
  en alguna ruta; si no, dejarlo coherente y probado).
- [X] T009 `backend/internal/access/access.go`:
  - `onConsultationQuery`: `LEFT JOIN children ch ON ch.id = k.child_id`, `JOIN accounts owner ON owner.id = k.account_id`; nivel
    = `levelCase(...)` si `k.child_id IS NOT NULL`, si no `ownLevel`: 2 si `a.id = k.account_id`; 1 si hay fila
    `own_consultation_sharing` con `shared` del dueño **y** el que pregunta es la dueña de la familia del dueño o un integrante
    activo `tutor` de esa familia (familia del dueño = él mismo si tiene algún integrante activo, o su `family_account_id` activo);
    0 en otro caso. Escribir `ownLevel` una sola vez como fragmento SQL reutilizable.
  - `onAppointmentQuery`: igual con `ap.child_id` nulo y `ap.account_id`.
  - Nuevo `OnPerson(ctx, clerkUserID, accountID)`: 2 si la sesión es esa cuenta, 1 por la misma regla de compartir, 0 si no.
  - Nuevo `OfAccountOnConsultation(ctx, accountID, consultationID) (Level, error)` (para «Tomada»).
- [X] T010 [P] Pruebas de acceso en `backend/internal/access/access_test.go` (tabla): consulta propia con el interruptor sin fila,
  `false`, `true` y de nuevo `false` × dueño, dueña de la familia (cuando el dueño es invitado), Tutor activo, Cuidador,
  integrante Hijo, Tutor quitado, Tutor de otra familia, extraño, sesión sin cuenta; con la familia `free` el Tutor sigue en Mark
  si el interruptor está encendido (R5); `OnAppointment` de una cita propia; `OnPerson`; `OfAccountOnConsultation`; las consultas
  de hijos dan exactamente lo de antes (filas de regresión).
- [X] T011 [P] Prueba de aislamiento en `backend/internal/consultation/own_isolation_test.go`: con una consulta propia (y su cita,
  síntomas, tomas de hoy, tratamiento activo y foto) en la cuenta de un hijo, **ninguna** de estas la devuelve ni la cuenta: lista
  del hijo, `GetOverview`, `Search` y `HistoryOptions` del hijo, `ListWithoutPhoto`/export del hijo, citas del hijo, `checkPlan`
  (spec 030) y `active_treatment` de la edición.
- [X] T012 [P] Prueba en `backend/internal/childdevice/` (`own_isolation_test.go`): `ConsultationOfChild`, el overview del teléfono
  y `ClaimDueChildDevices` nunca devuelven ni marcan una toma de una consulta propia de la cuenta dueña; `childdevice_router_test.go`
  sigue verde sin cambios.
- [X] T013 Correr `go vet ./... && go test ./... -cover` y lo mismo con `pool_max_conns=4` en `consultation`, `access`,
  `appointment`, `reminder`, `childdevice`; cobertura > 90 %; commit de la fase.

**Punto de control**: todo lo de los hijos funciona igual y una consulta propia escrita a mano en la base ya tiene acceso correcto.

---

## Fase 3: Historia de Usuario 1 – Mis consultas (Prioridad: P1) 🎯 MVP

**Objetivo**: la persona con plan completo registra sus consultas y sigue sus tomas en su perfil `/yo`.

**Prueba independiente**: con una cuenta de pago, crear una consulta propia, verla en el perfil y en «Tu día», marcar sus tomas
y recibir su recordatorio; ningún hijo la muestra (quickstart 1–3, 10–12).

### Backend

- [X] T014 [US1] `backend/internal/consultation/repository.go`: `CreateOwn(ctx, accountID, in)` (o `Create` con un sujeto): una
  `tx` que bloquea `accounts` `FOR UPDATE`, lee el plan con el mismo `personalPlanSQL` de `internal/supplement/personal.go`
  (moverlo a un lugar común o duplicarlo con una prueba que los mantenga iguales) y, si no paga, `*PlanLimitError{Reason:
  PlanLimitOwnConsultations}` (`"own_consultations"`); luego `checkPhotoCap`, inserta con `child_id` NULL y `account_id`, síntomas,
  medicamentos, tomas y la cita opcional, igual que `Create`. Las reglas de la spec 030 no aplican.
- [X] T015 [US1] Mismo archivo: `ListOwn(ctx, accountID)` (forma de la lista del hijo, `WHERE c.child_id IS NULL AND c.account_id
  = $1`) y `GetOwnOverview(ctx, accountID, from, to)` (tomas de medicamentos de consultas propias en la ventana + tratamiento
  activo, la misma regla de `GetOverview`, sin suplementos).
- [X] T016 [US1] `ExtendTreatment`: si la consulta no tiene hijo, dentro de la `tx` y con la cuenta bloqueada, pedir
  `personalPlanSQL` → `*PlanLimitError` `own_consultations`; la consulta de un hijo no cambia.
- [X] T017 [US1] El detalle (`GetByID`) devuelve `childId` (nulo) y `accountId`; `model.go` y la respuesta JSON del handler.
- [X] T018 [US1] `backend/internal/consultation/own_handler.go` (nuevo, `*httpx.Responder`, Swagger completo): `GET/POST
  /accounts/{accountId}/consultations`, `GET /accounts/{accountId}/overview?from=&to=` (ventana ≤ 48 h); `accountId` mal formado
  → 404; mismos códigos que las rutas del hijo (contracts/api.md).
- [X] T019 [P] [US1] `backend/internal/appointment/`: `ListOwn`/`CreateOwn` y `GET/POST /accounts/{accountId}/appointments` (plan
  `appointments` con `personalPlanSQL`); una cita propia sin consulta se inserta con `child_id` y `consultation_id` nulos.
- [X] T020 [US1] `backend/internal/reminder/candidates.go` y `repository.go`: `medicationCandidates` con `LEFT JOIN children`,
  `owner_id = c.account_id`, el nombre (`COALESCE(ch.first_name, owner.first_name)`) y una marca `own` (consulta sin hijo);
  `ClaimDueDoses`: en una consulta propia el destinatario es **solo el dueño** en esta fase (los Tutores llegan en la US2); el
  nombre va vacío para el dueño. `MarkTakenByAction`: una toma de una consulta propia se resuelve con
  `access.OfAccountOnConsultation` (Mark) y marca como la cuenta del dispositivo. `internal/reminder/appointment.go`: citas
  propias, solo al dueño.
- [X] T021 [US1] `backend/internal/server/router.go`: guardas `seesPerson` (`RequireAccess("accountId", Mark, OnPerson)`) y
  `fullPerson` (Full); registrar las rutas de T018 y T019; `cmd/api/main.go` si hace falta cablear algo. Filas en
  `backend/internal/server/router_test.go` para cada ruta nueva × dueño, Tutor (sin interruptor → 404/403 según el patrón del
  test), Cuidador, extraño; ninguna bajo `/child-device`.
- [X] T022 [P] [US1] Pruebas contra la base real en `backend/internal/consultation/own_test.go`, `own_handler_test.go`,
  `backend/internal/appointment/own_test.go`, `backend/internal/reminder/own_test.go`: crear con plan propio, con plan de familia y
  sin plan (422 sin guardar nada); el tope de fotos cuenta las propias; lista y overview solo propios; editar (spec 051),
  finalizar y marcar con el plan vencido sí; recorrer con el plan vencido no; aviso al dueño sin nombre; «Tomada» desde el
  dispositivo del dueño sí y desde otro no; `error_logs` sin doctor, notas ni medicamentos.
- [X] T023 [US1] Regenerar Swagger (`go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd`).

### Frontend

- [X] T024 [P] [US1] `frontend/src/shared/subject.ts` (+ prueba): tipo `Subject = { kind: 'child'; childId } | { kind: 'person';
  accountId }` y funciones puras para las rutas del API (`consultationsPath`, `overviewPath`, `appointmentsPath`, `searchPath`,
  `historyOptionsPath`, `exportPath`) y de la app (`profileHref`, `newConsultationHref`, `historyHref`).
- [X] T025 [P] [US1] `frontend/src/features/profile/profileText.ts` (+ `profileText.test.ts`, prueba de redacción: sin «debes»,
  «deberías», «riesgo», «alerta», «recomend…», como las demás): títulos del perfil, «Nueva consulta», aviso del plan, textos del
  perfil compartido y del interruptor (los usa la US2).
- [X] T026 [US1] API y tipos: `frontend/src/features/consultations/api.ts` y `types.ts` con las funciones por sujeto
  (`listConsultations(subject)`, `createConsultation(subject, body)`, `getOverview(subject, from, to)`), el detalle con `childId:
  string | null` y `accountId`; `frontend/src/features/appointments/api.ts` igual; `reason: "own_consultations"` en el aviso del
  plan (`FreemiumLimitModal` / `planCopy.ts`: el motivo y sus filas).
- [X] T027 [US1] `frontend/src/features/childDetail/`: parametrizar por `Subject` las partes que usa el perfil (`ChildDetailParts`,
  `ChildTodayCard`) sin cambiar lo que ve un hijo; la cartilla y «Acceso del hijo» solo para `kind: 'child'`.
- [X] T028 [US1] `frontend/src/features/profile/ProfilePage.tsx` (+ prueba): dos diseños con `useIsDesktop`, el sistema de la spec
  056 (`PageHeader` con el nombre de pila, «Hoy» primero con las tomas de sus medicamentos + suplementos + actividades marcables,
  tratamiento activo y próxima cita, `SectionIndex` Consultas · Suplementos · Actividades, «Lo demás», «Nueva consulta» único
  sólido); lo de suplementos y actividades viene de `MyDayPage` (reutilizar sus partes de `features/supplements`). Plan
  gratuito: «Nueva consulta» con la marca «Plan completo» abre el aviso del plan (como `NewConsultationEntry`).
- [X] T029 [US1] `frontend/src/App.tsx`: `/yo` → `ProfilePage`, `/yo/consultas/nueva` → `NewConsultationPage` con sujeto
  persona; `/mi-dia`, `/mis-suplementos`, `/mis-actividades` → `<Navigate to="/yo…" replace />` conservando el ancla;
  `/mis-suplementos/nueva` y `/mis-actividades/nueva` siguen; retirar `MyDayPage` (o dejarlo solo como partes) y mover sus pruebas.
- [X] T030 [US1] `NewConsultationPage`, `ConsultationDetailPage`, `EditConsultationPage` (`frontend/src/features/consultations/`)
  con sujeto: el detalle de una consulta propia vuelve a `/yo` con «←», muestra editar, finalizar, recorrer y la cita solo si
  `accountId` es la cuenta de la sesión; sin datos del hijo. Pruebas de los dos sujetos.
- [X] T031 [US1] Inicio: `frontend/src/features/home/TuDia.tsx` y `ChildrenSidebar.tsx` enlazan a `/yo` (no a `/mi-dia`) y «Tu
  día» suma las tomas del día de `GET /accounts/{id}/overview`; `MoreLinks` y textos que digan «Mi día» se actualizan. Pruebas.
- [X] T032 [US1] `npx vitest run --coverage` (> 90 %), `npm run build`, `npx eslint .`; commit de la fase.

**Punto de control**: la US1 sola ya es entregable (MVP).

---

## Fase 4: Historia de Usuario 2 – Compartir con los Tutores (Prioridad: P2)

**Objetivo**: el dueño decide con un interruptor; los Tutores ven y marcan, con avisos opcionales.

**Prueba independiente**: quickstart 4–8.

### Backend

- [X] T033 [US2] `backend/internal/consultation/sharing.go` (+ handler en `own_handler.go`): `SetSharing(ctx, accountID,
  shared)`: en una `tx` con la cuenta `FOR UPDATE`; al encender pide familia (dueña con algún integrante activo, o integrante
  activo) → si no, `422 sharing_unavailable` `reason: "no_family"`; y que esa familia sea `paid` → si no, `reason: "plan"`; apagar
  siempre; `INSERT … ON CONFLICT (account_id) DO UPDATE SET shared, changed_at = now()`. Ruta `PUT
  /accounts/{accountId}/consultation-sharing` (`ownsAccount`).
- [X] T034 [US2] `PUT /consultations/{consultationId}/my-reminders` (`seesConsultation`): `{on}` inserta o borra en
  `own_consultation_reminder_optins`; `400 not_shared` si la consulta tiene hijo o si la sesión es su dueña. El detalle de una
  consulta propia trae `myReminders`.
- [X] T035 [US2] `backend/internal/reminder/repository.go` `ClaimDueDoses`: en una consulta propia, además del dueño, cada cuenta
  con nivel Mark por la regla `ownLevel` de T009 **y** una fila de opt-in recibe su par; el nombre del dueño va en el aviso del
  Tutor. Lo mismo para las citas propias (`appointment.go`) con el opt-in de la consulta de la cita (una cita propia sin
  consulta: solo el dueño).
- [X] T036 [US2] `backend/internal/account/`: `GET /accounts/me` gana `consultationSharing {shared, changedAt}` y `sharedProfiles
  [{accountId, firstName}]` (las personas que comparten con la sesión y a las que tiene Mark ahora); Swagger.
- [X] T037 [US2] `router.go` + filas en `router_test.go` para T033 y T034.
- [X] T038 [P] [US2] Pruebas contra la base real (`sharing_test.go`, `reminder/own_sharing_test.go`, `account` `me`): encender sin
  familia y con familia `free` (422), con familia `paid` (200); apagar siempre; el Tutor ve y marca con el interruptor encendido y
  recibe 404 en la petición siguiente a apagarlo; su marca conserva «por Luis»; no puede editar, finalizar, recorrer, cambiar la
  cita ni crear (403/404); avisos solo con opt-in y solo con acceso; Cuidador nunca; las rutinas personales siguen siendo solo del
  dueño; `pool_max_conns=4`.

### Frontend

- [X] T039 [US2] `frontend/src/features/profile/SharingToggle.tsx` (+ prueba): el interruptor en el perfil propio, solo si la
  persona tiene familia; 422 → texto de `profileText.ts` según `reason`; refresca `GET /accounts/me`.
- [X] T040 [US2] `frontend/src/features/profile/SharedProfilePage.tsx` en `/personas/:accountId` (dos diseños): el nombre de la
  persona, «Hoy» con sus tomas, su tratamiento y cita, sus consultas; sin suplementos, actividades, «Nueva consulta» ni PDF; si
  responde 404 (le quitaron el acceso), un aviso neutral y vuelta al inicio. Pruebas.
- [X] T041 [US2] El inicio y la barra lateral muestran un acceso por cada `sharedProfiles`; el detalle de una consulta compartida
  muestra «Tus avisos» (`MyRemindersToggle` reutilizado o uno nuevo) y oculta lo que no le toca. Pruebas.
- [X] T042 [US2] vitest con cobertura, build, eslint; commit de la fase.

---

## Fase 5: Historia de Usuario 3 – Historial y PDF propios (Prioridad: P3)

**Objetivo**: buscar en las consultas propias y exportarlas a PDF.

**Prueba independiente**: quickstart 9.

- [X] T043 [US3] `backend/internal/consultation/search.go`: `Search`/`HistoryOptions` con un sujeto (persona: `c.child_id IS NULL
  AND c.account_id = $1`); el plan de la persona dueña con `personalPlanSQL` (`history_search`). Rutas `POST
  /accounts/{accountId}/consultations/search` y `GET /accounts/{accountId}/history-options` (`seesPerson`) + filas del router.
- [X] T044 [US3] `backend/internal/historyexport/` y `consultation/export_batch.go`: `POST /accounts/{accountId}/export`
  (`fullPerson`): `sections.vaccinations: true` → 400 en ese campo; plan `pdf_export` con `personalPlanSQL`; respuesta con
  `subject {kind: "person", firstName, lastName}`, su tratamiento, sus citas y sus consultas en lote, sin cartilla. Fila del router.
- [X] T045 [P] [US3] Pruebas contra la base real: la búsqueda propia nunca devuelve consultas de hijos ni la del hijo las propias;
  el Tutor con el interruptor busca y no exporta (403/404); plan; `TestExport_ErrorLogsNeverCarryTheChoice` para la ruta propia;
  Swagger regenerado.
- [X] T046 [US3] Frontend: `HistoryPage`, `useHistory`, `historyCriteria` (`sessionStorage` por sujeto) y `HistoryEntry` con
  sujeto; ruta `/yo/historial` (y `/personas/:accountId/historial` para el Tutor, sin «Exportar a PDF»). Pruebas.
- [X] T047 [US3] `frontend/src/features/pdfExport/`: `ExportPanel`, `useExport`, `api.ts` y el documento con sujeto persona: sin la
  sección ni la casilla «Cartilla», portada con el nombre de la persona; «Exportar a PDF» solo en `/yo/historial`. Pruebas.
- [X] T048 [US3] vitest con cobertura, build, eslint, `go test ./... -cover`; commit de la fase.

---

## Fase 6: Pulido y cierre

- [X] T049 Subir `account.CurrentDisclaimerVersion` (`backend/internal/account/disclaimer.go`, fecha del día) y el texto de
  `frontend/src/features/home/WelcomeDisclaimer.tsx` (la app también registra la salud de la persona de la cuenta; se comparte
  solo si ella lo decide); actualizar su prueba de redacción y lo que compare la versión.
- [X] T050 [P] E2E `frontend/e2e/consultas-del-titular.spec.ts` (Chromium, 390 y 1280 px, con los helpers de `e2e/helpers.ts`):
  `/mi-dia` → `/yo`; crear una consulta propia y marcar una toma; no aparece en el detalle del hijo; compartir con un Tutor (dos
  sesiones como `familia.spec.ts`): la ve y marca, no edita; un Cuidador no la ve; apagar y el Tutor deja de verla; plan gratuito
  ve el aviso. Actualizar `mi-dia.spec.ts`, `suplementos-personales.spec.ts`, `actividades.spec.ts` e `inicio.spec.ts` a `/yo`.
- [X] T051 [P] Documentación: `CLAUDE.md` raíz (entrada de la spec 058), `backend/CLAUDE.md` (`consultations.account_id`, el
  acceso a lo propio, las rutas nuevas, `0032`, `ownership` ya no es «consultations have no account_id»), `frontend/CLAUDE.md`
  (`/yo`, `Subject`, `features/profile`), `BACKLOG.md` (quitar la entrada del titular; anotar el aviso de privacidad pendiente del
  dueño), nota en `specs/004-…/spec.md` si hace falta.
- [ ] T052 Verificación completa: `go vet ./...`, `go test ./... -cover` con y sin `pool_max_conns=4`, Swagger sin cambios tras
  regenerar, `govulncheck ./...`, `npx vitest run --coverage`, `npm run build`, `npx eslint .`, `npx playwright test --list`.
- [ ] T053 `/code-review` sobre la rama, arreglar lo que salga, push y PR a `develop` (cuerpo en español con el SQL de la `0032` y
  los pasos del dueño: aplicar la `0032` en DEV **antes** del merge y actualizar el aviso de privacidad); `ccd_pr` con auto-fix.

---

## Dependencias y orden de ejecución

- **Fase 1 → Fase 2 → US1 → (US2, US3)**. La US2 y la US3 dependen de la US1 (crear y ver lo propio) y no entre sí: pueden ir en
  cualquier orden; se hacen US2 → US3 por prioridad.
- Dentro de cada fase: backend (repositorio → handler → router → pruebas → Swagger) antes que el frontend de esa historia.
- T009 (acceso) bloquea T010, T018, T021, T034, T035, T043, T044.
- T024 (`subject.ts`) bloquea T026–T031, T046, T047.

## Oportunidades de paralelismo

- Fase 1: T003 junto con T004 una vez aplicada la migración.
- Fase 2: T007 y T008 junto con T005/T006; T010, T011 y T012 en paralelo una vez hechos T005–T009.
- US1: T019 en paralelo con T014–T018; T022 en paralelo con T023; T024 y T025 en paralelo entre sí y con el backend.
- US2: T038 en paralelo con el frontend T039–T041 una vez hechos T033–T037.
- Cierre: T050 y T051 en paralelo.

## Estrategia

**MVP = Fases 1–3** (US1): la persona registra y sigue sus consultas, privadas. Se puede probar y mostrar sola. Luego la US2
(compartir) y la US3 (historial y PDF), cada una con su commit, y el cierre con un solo PR a `develop` (el dueño pidió todo
junto).
