# Tareas: Eliminar la cuenta y descargar todos mis datos

**Entrada**: `specs/070-eliminar-cuenta-y-datos/`: spec.md, plan.md, research.md (R1–R10), data-model.md, contracts/api.md, contracts/ui.md y quickstart.md.

**Pruebas**: obligatorias (constitución, Principio VI). Más del 90 % de cobertura en `internal/accountdeletion` e `internal/dataexport`, y en los componentes nuevos del frontend. Las E2E corren a 390 y 1280 px.

**Rama**: `feature/070-eliminar-cuenta-y-datos`. Commit solo cuando el dueño lo pida.

**Reglas que valen para todas las tareas**:
- Ningún dato de salud, nombre de hijo, correo ni contenido del archivo en direcciones web, `error_logs`, consola ni correos (FR-006, FR-017). `error_logs` solo lleva `account_id` y mensajes fijos.
- El borrado es **real** y en **una transacción**; nunca se oculta (FR-013).
- Descargar y eliminar **no dependen del plan** (FR-020).
- Todo lo que cambia durante el plazo se **deriva** de que exista la solicitud abierta, nunca se guarda: cancelar no deshace nada (research R3).
- Toda ruta nueva va en `backend/internal/server/router.go` con su fila en `router_test.go`. Los errores van por `*httpx.Responder`.
- Dos diseños con `useIsDesktop`, sin mezclar; textos neutrales, sin rojo de alarma (contracts/ui.md).
- El código va en inglés y la documentación en español.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Crear `backend/migrations/0037_account_deletions.sql` (data-model.md):
  - Tabla `account_deletions`:
    - `id uuid PK default gen_random_uuid()`
    - `account_id uuid NOT NULL` (**sin** llave foránea)
    - `clerk_user_id text NULL`
    - `requested_at timestamptz NOT NULL DEFAULT now()`
    - `scheduled_for timestamptz NOT NULL`
    - `canceled_at timestamptz NULL`
    - `completed_at timestamptz NULL`
    - `attempts int NOT NULL DEFAULT 0`
    - `last_attempt_at timestamptz NULL`
  - CHECKs:
    - `scheduled_for > requested_at`
    - `canceled_at IS NULL OR completed_at IS NULL`
    - `completed_at IS NULL OR clerk_user_id IS NULL`
  - Índices:
    - único parcial `account_deletions_one_open (account_id) WHERE canceled_at IS NULL AND completed_at IS NULL`
    - `account_deletions_due (scheduled_for) WHERE canceled_at IS NULL AND completed_at IS NULL`
  - `ALTER … DROP NOT NULL` de las nueve columnas de autoría de data-model.md («Autoría opcional en datos ajenos»).

  Aplicarla en la base local y en la de pruebas.

---

## Fase 2: Fundamental (bloquea todas las historias)

- [X] T002 [P] En `backend/internal/httpx/json.go`, agregar `Responder.Stream(ctx, w, contentType, filename string, accountID *uuid.UUID, write func(io.Writer) error)`:
  - escribe `Content-Type` y `Content-Disposition: attachment; filename="…"` y status 200;
  - si `write` falla a la mitad, registra en `error_logs` una fila fija con el archivo y la línea del llamador, y corta la conexión (`http.NewResponseController(w)` / panic `http.ErrAbortHandler`), para que el cliente vea una descarga fallida.

  Pruebas en `json_test.go`: éxito, falla a la mitad (registrada y sin texto del error) y que el `skip` del `runtime.Caller` apunta al manejador.
- [X] T003 [P] En `backend/internal/authmw/`, dejar los `*clerk.SessionClaims` verificados en el contexto (`authmw.ClaimsFromContext`), sin cambiar a nadie más. Prueba con `authmwtest`, que debe poder fabricar *claims* con `FactorVerificationAge` (reciente / viejo / `-1`).
- [X] T004 Crear `backend/internal/accountdeletion/repository.go`:
  - `Request(ctx, tx, accountID, clerkUserID, now)`: inserta con `scheduled_for = now + 30 días`. Ante el índice único devuelve `ErrAlreadyPending` con la fila existente.
  - `Open(ctx, accountID) (*Deletion, error)`, `Cancel(ctx, accountID, now)` (idempotente) y `Due(ctx, tx, now, limit)` (`FOR UPDATE SKIP LOCKED`).
  - `MarkAttempt(…)` y `Complete(ctx, tx, id, now)`: vacía `clerk_user_id`.
  - `SetNow` para las pruebas.

  Pruebas contra la base en `repository_test.go`: una sola abierta, cancelar dos veces, `Due` con dos conexiones a la vez (no se repite) y los CHECK.
- [X] T005 Crear `backend/internal/accountdeletion/purge.go`: `Purge(ctx, tx, accountID)` borra en el orden de research R1. Pasos:
  1. Hojas de dosis y rutinas: `dose_reminders`, `child_dose_reminders`, `supplement_dose_reminders`, `child_supplement_dose_reminders`, `appointment_notice_reminders`, `appointment_notices`, `appointment_muted`, `supplement_muted`, `own_consultation_reminder_optins` (las de sus consultas y las de la persona).
  2. Lo de la cuenta y sus hijos:
     1. `consultation_symptoms`
     2. `doses` (antes que `medication_extensions`)
     3. `medication_extensions`
     4. `medications`
     5. `consultation_appointments`
     6. `consultations`
     7. `supplement_doses`
     8. `supplement_routines`
     9. `vaccine_records`
     10. `vaccine_card_photos`
     11. `growth_measurements`
     12. `reminder_devices` de los teléfonos de sus hijos
     13. `child_device_links`
     14. `medicine_cabinet_items`
     15. `personal_routine_notices`
     16. `own_consultation_sharing`
  3. Familia: `family_invitations` y `family_members` de su familia y su membresía en otra.
  4. Cuenta: `disclaimer_acceptances`, `reminder_devices` propios, `payment_events`, `subscriptions` y `children`.
  5. Autoría en datos ajenos: poner en `NULL` las columnas de autoría que apuntan a la cuenta (data-model.md), conservando `taken`/`taken_at`.
  6. `UPDATE error_logs SET account_id = NULL`.
  7. `DELETE FROM accounts`.

  Pruebas en `purge_test.go`:
  - una cuenta con **dos hijos y una fila en cada tabla**; después del borrado, **ningún** `account_id` ni `child_id` suyo aparece en **ninguna** columna `uuid` de **ninguna** tabla de `public`, recorriendo `information_schema` (SC-004);
  - otra cuenta de la misma base queda intacta;
  - **prueba de tablas conocidas**: recorre las llaves foráneas hacia `accounts` y `children` en `information_schema` y falla si aparece una tabla que `Purge` no nombra (R1).
- [X] T006 [P] En `backend/internal/mailer/quota.go`, agregar `ClassAccount`, con el mismo tope que `ClassInvitation`. Prueba en `quota_test.go`.

**Punto de control**: migración aplicada, `Purge` borra todo y solo lo de esa cuenta, y `Responder.Stream` está listo.

---

## Fase 3: Historia de Usuario 1 — Llévate todo (P1) 🎯 MVP

**Objetivo**: FR-001 a FR-006. **Prueba independiente**: una cuenta gratuita con dos hijos, fotos, vacunas, medidas, botiquín y rutinas descarga un ZIP con todo y nada ajeno.

- [X] T007 [P] [US1] Crear `backend/internal/dataexport/collect.go`:
  - `Collect(ctx, q, scope)`, donde `scope` es `Own(accountID)` o `FamilyChildren(ownerID)`.
  - Lee las filas sin las fotos: hijos, consultas (de hijos y propias si `Own`), síntomas, medicamentos, tomas con su `status` (la regla de la spec 013 y `canceled`), con `takenBy` = nombre de pila, extensiones, citas y avisos, vacunas, fotos de cartilla (solo ids), medidas, rutinas y sus tomas, y botiquín (de la familia si es dueña).
  - Lee en lote, nunca una consulta por fila.
  - `FamilyChildren` excluye lo propio de la dueña.

  Pruebas en `collect_test.go`:
  - cuenta propia;
  - Tutor (`Own` no trae los hijos de la familia);
  - `FamilyChildren`;
  - **nada de otra cuenta** (SC-002).
- [X] T008 [P] [US1] Crear `backend/internal/dataexport/write.go`: `Write(ctx, w io.Writer, data, photos PhotoSource)` escribe el ZIP de data-model.md:
  - `LEEME.txt` en español;
  - `datos.json`;
  - los CSV en UTF-8 con BOM y columna `foto`;
  - `fotos/recetas|cartilla|botiquin/<id>.<ext>`, con la extensión de `imagecheck`. `PhotoSource` lee una foto a la vez.

  Solo lo registrado (FR-005). Pruebas en `write_test.go`:
  - abrir el ZIP con `archive/zip` y comprobar cada archivo, cada fila y cada foto;
  - acentos y emojis en el CSV;
  - una foto que falla a la mitad devuelve error;
  - prueba de redacción: no aparecen palabras de alerta ni juicio.
- [X] T009 [US1] Crear `backend/internal/dataexport/handler.go`: `POST /accounts/{accountId}/data-export` (`ownsAccount`). Usa `Collect` + `Responder.Stream` con `peditrack-datos-AAAA-MM-DD.zip` (fecha de Ciudad de México). Va en cualquier plan y también con la eliminación programada.
  - Registrar la ruta en `router.go` con `StrictRateLimit` y su fila en `router_test.go`.
  - Anotaciones Swagger y regenerar `internal/docs`.

  Pruebas en `handler_test.go`:
  - 200 con un ZIP válido;
  - otra cuenta → 403;
  - **prueba de privacidad**: después de un éxito y de una falla a la mitad, ninguna fila de `error_logs` lleva nombres, notas ni nombres de archivo.
- [X] T010 [P] [US1] Crear `frontend/src/features/account/api.ts` y `downloadData.ts`:
  - `downloadMyData()` hace `fetch` con la sesión y saca un `Blob` y el nombre del archivo de `Content-Disposition`;
  - reusa `features/pdfExport/share.ts` para «Compartir» o «Descargar»;
  - con un error o una respuesta cortada, muestra «No se pudo descargar. Vuelve a intentarlo.»

  Pruebas en vitest.
- [X] T011 [US1] Crear `frontend/src/features/account/AccountPage.tsx` (`/cuenta`, dos diseños con `PageHeader`), según contracts/ui.md:
  - el correo, el plan y la familia;
  - la tarjeta «Descargar todos mis datos» (estados preparando / listo / error);
  - la tarjeta «Eliminar mi cuenta» (enlace a `/cuenta/eliminar`);
  - `RequireConnection`.

  Agregar «Mi cuenta» a `features/home/MoreLinks.tsx` (antes de «Cerrar sesión») y al grupo de la cuenta en `ChildrenSidebar.tsx`, y la ruta en `App.tsx` dentro de `RequireSession` y `AppShell`. Pruebas de componente en ambos diseños.
- [X] T012 [US1] E2E en `frontend/e2e/eliminar-cuenta.spec.ts` (390 y 1280 px): una cuenta **gratuita** con un hijo y una consulta con foto abre «Mi cuenta» y descarga. La prueba lee el ZIP con un helper de Node y comprueba `datos.json`, `consultas.csv` y la foto.

**Punto de control**: la Historia 1 sirve sola. Es el MVP.

---

## Fase 4: Historia de Usuario 2 — Eliminar mi cuenta con un plazo (P1)

**Objetivo**: FR-007 a FR-013, FR-017 a FR-020. **Prueba independiente**: pedir, ver la cuenta en pausa, cancelar sin pérdida; pedir de nuevo, adelantar el reloj y comprobar que no queda nada ni el usuario de Clerk.

- [X] T013 [US2] Crear `backend/internal/accountdeletion/service.go` (sin la familia ni la suscripción, que son de la Historia 3):
  - **`Request(ctx, session, confirm)`**:
    1. comprueba `confirm == "ELIMINAR"` (si no, `ValidationError`);
    2. comprueba `NeedsReverification({AfterMinutes: 10, Level: first_factor})` (si falla, `ErrReverification`);
    3. en una transacción con la cuenta `FOR UPDATE`, llama a `repository.Request`;
    4. desactiva sus ligas de teléfono pendientes y sus invitaciones pendientes;
    5. pone en cola el correo «al pedir».
  - **`Cancel`**.
  - **`Status`**.
  - **`Complete(ctx, deletion)`**, en este orden:
    1. lee el correo de la cuenta;
    2. borra el usuario en Clerk con `user.Delete`, detrás de una interfaz `ClerkUsers` (404 = hecho);
    3. corre `Purge` en una transacción;
    4. llama a `repository.Complete`;
    5. manda el correo final.

    Si falla, `MarkAttempt` y un reporte `clerk` / `purge` / `notify` como `job:account-deletion`.

  Pruebas en `service_test.go`: un Clerk falso; cada falla deja su reporte y se reintenta; el 404 de Clerk cuenta como hecho.
- [X] T014 [P] [US2] Crear `backend/internal/accountdeletion/email.go`:
  - mensajes «al pedir» (la fecha en hora de Ciudad de México y cómo cancelar) y «al completarse», en texto y HTML sencillo;
  - sin nombres de hijos ni datos de salud;
  - envío con `mailer.SendWithRetries` y `ClassAccount`; sin `RESEND_API_KEY` no hace nada y no falla.

  Prueba de redacción en `email_test.go`.
- [X] T015 [US2] Crear `backend/internal/accountdeletion/handler.go` con las rutas de contracts/api.md, en `router.go` con `ownsAccount`, filas en `router_test.go`, Swagger regenerado:
  - `GET /accounts/{accountId}/deletion`
  - `POST /accounts/{accountId}/deletion`:
    - 201;
    - 400 `confirm`;
    - 403 `reverification-error` con la forma de Clerk, por `WriteJSONErrorUnlogged`;
    - 409 `account_deletion_pending`;
  - `POST /accounts/{accountId}/deletion/cancel`
- [X] T016 [US2] Crear `backend/internal/accountdeletion/middleware.go` con `RequireNotPending`:
  - después de `RequireSession`, en todas las rutas con sesión de Clerk;
  - con la solicitud abierta responde 409 `account_deletion_pending` con `scheduledFor`, por `WriteJSONErrorUnlogged`;
  - lista cerrada de excepciones: `GET /accounts/me`, las tres rutas de `deletion` y `POST …/data-export`;
  - una consulta `EXISTS` por petición, sin caché.

  Prueba en `router_test.go` que recorre **todas** las rutas con `chi.Walk`: una cuenta en pausa recibe 409 en todas menos en la lista.
- [X] T017 [US2] En `backend/internal/reminder/` (`candidates.go`, `supplement.go`, `appointment.go` y la rama personal), excluir como **destinatario** a una cuenta con solicitud abierta (`NOT EXISTS` en `account_deletions` abierta). Los demás destinatarios de los mismos hijos siguen. Pruebas en cada `*_test.go`; cancelar hace que vuelvan.
- [X] T018 [US2] Crear `backend/internal/accountdeletion/sweeper.go`:
  - `RunEvery(ctx, svc, reporter, 10*time.Minute)`: corre al arrancar y cada 10 minutos; toma lotes de 10 con `Due` y llama a `Complete`;
  - el apagado limpio no es una falla.

  Arrancarlo en `backend/cmd/api/main.go` con `jobreport.New(errorLogRepo, "account-deletion")` y el cliente de Clerk real. Prueba con el reloj fijo: una solicitud vencida se completa y una sin vencer no.
- [X] T019 [US2] En `backend/internal/account/` (`GET /accounts/me`), agregar `deletion: {scheduledFor} | null`. Prueba en `handler_test.go`. Swagger regenerado.
- [X] T020 [US2] Crear `frontend/src/features/account/DeleteAccountPage.tsx` (`/cuenta/eliminar`, dos diseños), con los textos de contracts/ui.md en este orden:
  1. qué se borra;
  2. la fecha;
  3. mientras tanto;
  4. la familia;
  5. la suscripción;
  6. «Descargar mis datos primero»;
  7. el campo «Escribe ELIMINAR»;
  8. «Cancelar» con el foco inicial y «Eliminar mi cuenta» deshabilitado hasta que coincida.

  La petición va con `useReverification` de `@clerk/react`. Un 502 `subscription_cancel_failed` muestra su texto sin perder lo escrito. Pruebas de componente.
- [X] T021 [US2] Crear `frontend/src/features/account/DeletionPendingScreen.tsx`:
  - en `App.tsx`, si `/accounts/me` trae `deletion`, se muestra en **cualquier** ruta con sesión, como `RequireSession`;
  - trae la fecha, «Descargar mis datos», «Cancelar la eliminación» y «Cerrar sesión»;
  - al cancelar dice «Listo, tu cuenta sigue igual.» (y la nota de la suscripción si aplica) e invalida las consultas.

  El cliente trata un 409 `account_deletion_pending` de cualquier petición como «volver a leer `/accounts/me`», para que una pestaña abierta pase a la pantalla en pausa. Las marcas en curso (spec 066) vuelven atrás con su aviso. Pruebas.
- [X] T022 [US2] Crear `backend/cmd/accounts/main.go` con `reconcile-deleted` (research R7): recorre las cuentas con `clerk_user_id`, pregunta a Clerk (con un límite de ritmo) y, ante un 404, llama a `Complete` sin Clerk. Imprime solo conteos. Probar la lógica en `internal/accountdeletion/reconcile.go` + `reconcile_test.go` con un Clerk falso.
- [X] T023 [US2] E2E en `eliminar-cuenta.spec.ts` (390 y 1280 px):
  1. pedir la eliminación (con `ELIMINAR`);
  2. el usuario de prueba de Clerk de desarrollo pasa la reverificación;
  3. ver la pantalla en pausa en dos rutas;
  4. cancelar y ver la consulta de nuevo.

  El borrado final no se espera en la E2E: se prueba en Go (T005, T013, T018).

**Punto de control**: las Historias 1 y 2 funcionan; una cuenta sin familia ni suscripción se elimina de punta a punta.

---

## Fase 5: Historia de Usuario 3 — Familia y suscripción (P2)

**Objetivo**: FR-004 (excepción), FR-014, FR-015, FR-016. **Prueba independiente**:
- un Tutor que se va deja la familia intacta y sus marcas sin nombre;
- con la dueña en pausa, los Tutores ven, marcan y descargan pero no crean;
- con una suscripción de prueba, se cancela al pedir.

- [X] T024 [US3] En `accountdeletion.Service.Request`, cancelar la suscripción **antes** de guardar la solicitud: `payments.Service.Cancel` detrás de una interfaz.
  - Si el proveedor falla: `ErrSubscriptionCancel` → 502 `subscription_cancel_failed`, y **nada se guarda**.
  - La respuesta trae `subscriptionCanceled`.

  Pruebas con el proveedor falso de `payments` (éxito, falla, sin suscripción).
- [X] T025 [US3] En `backend/internal/access/access.go` (`levelCase` y `ownLevelCase`), una persona invitada a una familia cuya dueña tiene la solicitud abierta queda como máximo en `Mark`. Pruebas en `access_test.go`: el Tutor pasa a `Mark` y vuelve a `Full` al cancelar; el Cuidador no cambia.
- [X] T026 [US3] En `backend/internal/family/`, crear o aceptar una invitación de una familia cuya dueña tiene la solicitud abierta responde 409 `family_deletion_pending`; `GET /family` y `/accounts/me` traen `family.deletionScheduledFor`. Pruebas.
- [X] T027 [US3] Correo a cada persona invitada al pedir la eliminación la dueña (email.go): la fecha, el nombre de pila de la dueña y que hasta entonces puede ver, marcar y descargar; **sin nombres de hijos**. `familyNotified` en la respuesta. Prueba de redacción.
- [X] T028 [US3] En `backend/internal/dataexport/handler.go`, agregar `POST /family/children-export`: solo para un integrante activo de una familia cuya dueña tiene la solicitud abierta (si no, 404); usa `Collect(FamilyChildren(owner))`. Ruta, fila en `router_test.go` y Swagger. Pruebas.
- [X] T029 [US3] Revisar el borrado de una **persona invitada** (Purge, T005) con datos en la familia de otra:
  - sale de la familia;
  - sus marcas quedan `taken` con `taken_by_account_id NULL`;
  - lo que creó (vacunas, medidas, citas, rutinas, botiquín) se queda con `created_by_account_id NULL`;
  - la familia y sus hijos quedan intactos.

  Pruebas en `purge_test.go`.
- [X] T030 [US3] En el frontend:
  - `features/account/FamilyDeletionNotice.tsx`: el aviso fijo en el inicio y en el detalle de cada hijo de esa familia, con «Descargar sus datos» (`/family/children-export`);
  - los botones de crear y editar se ven como «Solo lectura» por el nivel `Mark`, como hoy;
  - «Creada por» se oculta y «por …» no se muestra cuando el autor es `null` (revisar `takenBy`/`createdBy` en las tarjetas de toma, rutina, vacuna, medida, cita y botiquín).

  Pruebas.
- [X] T031 [US3] E2E en `eliminar-cuenta.spec.ts` con una familia de pago (dueña + Tutor):
  - la dueña pide la eliminación;
  - el Tutor ve el aviso, marca una toma, descarga los datos de los hijos y no ve «Nueva consulta»;
  - la dueña cancela y el Tutor vuelve a tener todo.

---

## Fase 6: Pulido y aspectos transversales

- [X] T032 [P] En `RESPALDOS.md` (si está en `develop`; si no, en la sección de respaldos de `DEPLOY.md`), agregar a «Restaurar, paso a paso» el paso obligatorio `go run ./cmd/accounts reconcile-deleted` **antes** de cambiar `DATABASE_URL` del API (research R7).
- [X] T033 [P] En `DEPLOY.md`, agregar la sección «Eliminar la cuenta (spec 070)»:
  - aplicar la `0037` **antes** del backend;
  - sin variables nuevas;
  - qué revisar en DEV (quickstart §3);
  - pendientes del dueño: aviso de privacidad y registros de pago con el contador.
- [X] T034 Correr `cd backend && go vet ./... && go test ./... -cover`: los paquetes nuevos por encima del 90 %, más `govulncheck ./...` y Swagger al día. Correr también `cd frontend && npx vitest run --coverage` y `scripts/e2e-local.sh e2e/eliminar-cuenta.spec.ts`.
- [X] T035 [P] Documentos:
  - `CLAUDE.md`: entrada de la spec 070.
  - `backend/CLAUDE.md`:
    - `internal/accountdeletion`, `internal/dataexport`, `cmd/accounts`, `Responder.Stream`, la `0037`;
    - la regla «toda tabla nueva con llave a `accounts`/`children` entra en `Purge`»;
    - el middleware y su lista cerrada.
  - `frontend/CLAUDE.md`: `features/account/` y la pantalla en pausa.
  - `BACKLOG.md`: marcar «Eliminar la cuenta…» como hecho, con sus pendientes del dueño.
- [X] T036 Poner `Estado: Implementada` en `spec.md`, marcar las tareas y dejar el resumen del PR. El commit y el PR solo cuando el dueño lo pida.

---

## Dependencias

- **Fase 1 → Fase 2 → historias.**
- **US1** (T007–T012) depende de T002.
- **US2** (T013–T023) depende de T003–T006.
- **US3** (T024–T031) depende de US2 (T013, T016).
- **T029** depende de T005.
- **Pulido** al final.

## Paralelo

- **Fase 2**: T002, T003 y T006 a la vez; T004 → T005.
- **US1**: T007, T008 y T010 a la vez; luego T009 → T011 → T012.
- **US2**: T014 en paralelo con T013; T015, T016 y T019 tras T013; T017 y T018 en paralelo; frontend T020 → T021 → T023.
- **US3**: T025, T026 y T028 en paralelo tras T016.

## Estrategia

1. **MVP = Historia 1** («Llévate todo»). Por sí sola cumple el derecho de acceso y el Principio IV, y no borra nada: es lo de menor riesgo para empezar.
2. **Historia 2**: la eliminación de una cuenta sola. Es lo que pide la LFPDPPP; con ella ya se puede atender el derecho de cancelación.
3. **Historia 3**: familias y suscripciones, los casos con más gente afectada.

## Trazabilidad

| Requisito | Tareas |
|---|---|
| FR-001–FR-006 descargar | T002, T007–T012 |
| FR-007–FR-009 pedir y confirmar | T003, T013, T015, T020 |
| FR-010–FR-011 plazo y cancelar | T004, T013, T016, T021 |
| FR-012 avisos y ligas | T013, T017 |
| FR-013 borrado real | T005, T013, T018 |
| FR-014 dueña de familia | T025–T028, T030–T031 |
| FR-015 persona invitada | T005, T029, T030 |
| FR-016 suscripción | T024 |
| FR-017 correos | T014, T027 |
| FR-018 constancia y respaldos | T001, T004, T022, T032 |
| FR-019 fallas | T013, T018 |
| FR-020 sin plan | T009, T015 (pruebas con cuenta gratuita) |
