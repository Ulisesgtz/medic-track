---

description: "Lista de tareas de la spec 032: compartir hijos y consultas con la familia (plan de pago)"
---

# Tareas: Compartir hijos y consultas con la familia (plan de pago)

**Entrada**: `/specs/032-compartir-con-familia/` (plan.md, spec.md, research.md, data-model.md, contracts/family.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en backend y frontend y Playwright a 390 y 1280 px, con **dos sesiones** para lo compartido.

**Organización**: la **Entrega 1 (Tutores)** son las fases 1–8 y se construye **en orden** (research R1): cada fase deja la app
funcionando y con pruebas en verde, y se puede **commitear por fase**. Historias: US1 (invitar y aceptar), US2 (quién marcó), US3
(recordatorios por persona), US4 (salir y quitar), US5 (plan cancelado). La **Entrega 2 (Cuidador, US6)** es la fase 9. La
**Entrega 3 (Hijo, US7) no tiene tareas aquí**: depende de la confirmación legal y tendrá su propia spec de plan.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin depender de una tarea sin terminar)
- Rutas desde la raíz del repositorio. Textos en español; código en inglés.
- Backend: `cd backend && set -a && . ./.env.local && set +a`; frontend/E2E como en `frontend/CLAUDE.md`.

---

## Fase 1: Línea base

- [x] T001 Desde la rama `feature/032-compartir-con-familia`: `cd backend && go test ./... -cover` (>90 %) y `cd frontend && npx tsc --noEmit && npx vitest run` en verde; anota cuántas pruebas hay para compararlas al final

## Fase 2: Base sin cambio visible (migraciones y resolvedor de acceso)

**Meta**: el modelo y **un solo** resolvedor de permisos, probado con una matriz; el dueño sigue siendo el único con acceso (nadie nota nada).

- [x] T002 [P] Migración `backend/migrations/0017_create_family.sql`: `family_members` y `family_invitations` con **exactamente** las columnas, `CHECK`s, llaves compuestas `(child_id, family_account_id) → children (id, account_id)` e índices de `data-model.md` (único parcial `family_members(account_id) WHERE status = 'active'`, único parcial de invitación pendiente por `(family_account_id, email)`, `token_hash` único); aplícala en la base local y verifica que las filas viejas no cambian
- [x] T003 [P] Migración `backend/migrations/0018_dose_marks_and_reminders.sql`: `doses.taken_by_account_id` y `doses.taken_at` (nulos, `CHECK (taken OR (taken_by_account_id IS NULL AND taken_at IS NULL))`), tabla `dose_reminders (dose_id, account_id, sent_at)` con PK `(dose_id, account_id)`, **relleno** (una fila `(dose, cuenta dueña de su hijo, reminder_sent_at)` por cada `doses.reminder_sent_at IS NOT NULL`) e índice `doses (scheduled_at) WHERE taken = false`; aplícala y comprueba el relleno con un conteo antes/después
- [x] T004 Crear `backend/internal/access/access.go` (+ `access_test.go`): `Level` (`None < Mark < Full`), `Repository` con `LevelOnChild(ctx, clerkUserID, childID)`, `LevelOnConsultation(...)`, `LevelOnAccount(ctx, clerkUserID, accountID)` (para agregar hijos a una familia) y la variante por **cuenta** `LevelOfAccountOnChild(ctx, accountID, childID)` (la usará el botón «Tomada»); reglas de `research R3`: cuenta dueña → `Full`; Tutor activo → `Full`; Cuidador activo → `Mark`; Hijo activo → `Mark` solo si `child_id` coincide; **tope**: una persona **invitada** con la cuenta dueña **sin** plan `paid` baja a `Mark`; `clerkUserID` vacío → `None`; devuelve también el **id de la cuenta de la sesión** (el *actor*). Pruebas contra la base con filas insertadas por SQL (la matriz: dueña, Tutor, Cuidador, Hijo de ese hijo, Hijo de otro, quitado, salido, sin acceso, plan `free`)
- [x] T005 `backend/internal/authmw/middleware.go` (+ test): `RequireAccess(responder, param, min Level, check)` que generaliza `RequireOwner`: 401 sin sesión, 403 si el nivel no alcanza (también para un id que no existe, igual que hoy), un id mal formado pasa al handler; deja el **nivel** y el **actor** en el contexto (`access.FromContext`). `RequireOwner` se conserva para lo propio de la cuenta
- [x] T006 `backend/internal/server/router.go` (+ `router_test.go`) y `backend/cmd/api/main.go`: `Deps.Access`; cada ruta de hijos, consultas y tomas pasa a `RequireAccess` con el nivel de `research R4` (ver y marcar = `Mark`; `PATCH` dosis = `Mark`; nueva consulta, `end`, `extend` y `POST /accounts/{id}/children` = `Full`); `ownsAccount` queda solo para lo propio (aviso, ajustes y dispositivos de recordatorios, `GET /accounts/{id}`). Generaliza `routes()` del test para que cada fila declare su **nivel mínimo** y recorre la matriz de roles: 401 sin sesión, 403 a quien no alcanza el nivel (incluidos Cuidador en rutas `Full` y un hijo ajeno), la dueña llega al handler. Con solo la dueña, todo lo de hoy sigue igual
- [x] T007 Verificación de la fase: `go vet ./... && go test ./... -cover` (>90 %) y las E2E de hoy en Chromium (`npx playwright test --project=chromium`) sin cambios de comportamiento. Commit de la fase

## Fase 3: US2 — quién marcó cada toma

**Meta**: cada marca guarda autor y hora; se ve «por Ana, 08:05»; la primera gana; permisos de desmarcar. Con solo la dueña ya es visible.

- [x] T008 [US2] `backend/internal/consultation/model.go` y `repository.go`: `Dose.TakenBy *TakenBy{AccountID, Name, At}`; `UpdateDoseStatus(ctx, consultationID, id, taken, actor)` con una sola sentencia: **marcar** actúa solo si no estaba marcada (si ya lo estaba, devuelve la toma **tal cual**, con su autor; la primera gana, FR-014) y guarda `taken_by_account_id`/`taken_at`; **desmarcar** (`taken = false`) solo si `actor.Full` **o** es quien la marcó, si no `ErrDoseForbidden`; las marcadas antes (autor nulo) solo las desmarca un `Full`; `GetByID` y `GetOverview` leen el autor (join `accounts.first_name`) y las tomas creadas salen con `TakenBy` nulo. Pruebas contra la base: marcar guarda autor y hora, otra persona no lo sobrescribe, dos marcas simultáneas dejan una (carrera con goroutines), desmarcar propio/ajeno/de un `Full`/legado
- [x] T009 [US2] `backend/internal/consultation/handler.go` (+ Swagger): `UpdateDose` toma nivel y actor de `access.FromContext`; `takenBy` (`{name, at}` o `null`; solo el **nombre de pila**) en la respuesta de la toma, en el detalle y en el resumen del hijo (`overviewDoseResponse`); `403 forbidden` al desmarcar sin permiso. Pruebas de handler (forma de la respuesta, 403, null en lo legado)
- [x] T010 [US2] `backend/internal/reminder/repository.go` y `handler.go`: `MarkTakenByAction(doseID, deviceID)` marca **a nombre de la cuenta del dispositivo** y solo si esa cuenta tiene al menos `Mark` sobre el hijo de la toma (`LevelOfAccountOnChild`); si no, el mismo `ErrInvalidActionToken`. Pruebas: autor = dueña del dispositivo; una cuenta que perdió el acceso no marca
- [x] T011 [P] [US2] `frontend/src/features/consultations/types.ts`, `DoseChip.tsx`, `MedicationCard.tsx`, `ConsultationDetailPage.tsx`, `TodayDosesBlock.tsx`, `TodayDosesPanel.tsx`: `Dose.takenBy`; junto al chip de una toma marcada se lee **«por Ana, 08:05»** (nombre de pila y hora local, `formatTime`), sin cambiar el **nombre accesible fijo** del botón (el estado sigue en `aria-pressed`); nada si `takenBy` es nulo. Pruebas de cada pieza (con autor, sin autor, ambos diseños)
- [x] T012 [US2] Pruebas E2E existentes: ajusta las que cuenten texto de las tomas; agrega a `frontend/e2e/detalle-consulta-web.spec.ts` (o su móvil) la comprobación de «por … » tras marcar. Corre `detalle-consulta-*`, `tomas-sin-registrar`, `finalizar-tratamiento`, `recorrer-tratamiento` en Chromium. Commit de la fase

## Fase 4: US1 — invitar y aceptar a un Tutor

**Meta**: «Familia», invitar con liga, aceptar con el correo verificado, ver los hijos compartidos y operar como Tutor.

- [x] T013 [US1] Crear `backend/internal/family/model.go`, `errors.go`, `token.go` (+ tests): tipos `Member`, `Invitation`, `Role`, `InvitationStatus`; errores del contrato (`ErrAlreadyMember`, `ErrInvitationPending`, `ErrFamilyFull`, `ErrInvitationNotFound`, `ErrEmailMismatch`, `ErrAccountRequired`, `ErrAlreadyInFamily`, `ErrCannotRemoveTutor`, `ErrOwnerCannotLeave`, `ErrPlanRequired`); `NewToken()` (32 bytes aleatorios en base64url) y `HashToken` (SHA-256); la ficha **nunca** se guarda ni se imprime
- [x] T014 [US1] `backend/internal/family/repository.go` — invitaciones (+ tests contra la base): `CreateInvitation` (en una transacción con la fila de la cuenta dueña `FOR UPDATE`: cuenta dueña `paid`, correo en minúsculas, ya miembro → `ErrAlreadyMember`, pendiente → `ErrInvitationPending`, **tope**: miembros activos + pendientes + la dueña ≤ 4 → `ErrFamilyFull`), `ListInvitations` (el vencimiento se deriva: pendiente con `expires_at` pasado = `expired`), `ResendInvitation` (ficha nueva, vencimiento nuevo, la anterior deja de servir), `CancelInvitation`, `InvitationByToken(hash)` (solo pendiente y no vencida). Carrera: dos invitaciones simultáneas con un solo lugar libre → una entra
- [x] T015 [US1] `family/repository.go` — aceptar y miembros (+ tests): `Accept(ctx, tokenHash, accountID)` en transacción con la dueña bloqueada: invitación vigente, la cuenta dueña sigue `paid`, **tope**, la persona **sin** membresía activa (`ErrAlreadyInFamily`, también lo impide el índice único parcial), crea la membresía (`active`, `accepted_at`) y marca la invitación `accepted` con `member_id`; idempotente para la misma persona; `Decline`; `ListMembers` (nombre de pila, rol, desde cuándo); dos aceptaciones simultáneas de una ficha → una gana
- [x] T016 [US1] `backend/internal/family/service.go` (+ test): reglas de `contracts/family.md`: invitar exige nivel `Full` y cuenta dueña `paid` (si no `ErrPlanRequired`); **solo** `tutor` y `caregiver` en esta entrega (`child` → `400 validation_error` hasta la Entrega 3); correo con formato válido; aceptar exige el **correo verificado de la sesión** igual al de la invitación (`EmailResolver` inyectado, el mismo `clerkPrimaryEmail` de `account`, no verificado → error) y que la persona **tenga cuenta** (`ErrAccountRequired`); `Preview` devuelve solo lo necesario y un único `ErrInvitationNotFound` para ficha desconocida, usada, vencida o cancelada. Pruebas con un `EmailResolver` falso
- [x] T017 [US1] `backend/internal/family/handler.go` (+ Swagger y pruebas): `GET /family`, `POST /family/invitations`, `POST /family/invitations/{id}/resend`, `…/cancel`, `POST /family/invitations/preview`, `…/accept`, `…/decline`, con las formas y errores de `contracts/family.md` (la ficha solo en la respuesta de crear/reenviar; el cuerpo de preview/accept/decline la trae); todo por el `*httpx.Responder`; ninguna ficha ni correo en mensajes de error. Registra las rutas en `server/router.go` con el nivel correcto (`Full` para invitar/reenviar/cancelar; sesión sola para preview/accept/decline/`GET /family`) y una fila **por rol** en `router_test.go`; prueba de que ni la ficha ni el correo aparecen en `error_logs`
- [x] T018 [US1] `backend/internal/account/handler.go`/`repository.go` (+ tests y Swagger): `GET /accounts/me` agrega los **hijos compartidos** (de las membresías activas) con `accountId`, `role`, `plan` (el de la familia) y `readOnly`; los propios con `role: "owner"`; la sección `family` si la persona es miembro; el orden es estable (propios primero, luego los compartidos por fecha). `POST /accounts` de una persona **sin hijos** sigue funcionando (es el camino de quien acepta sin tener cuenta). Pruebas: dueña sin cambios, Tutor ve los dos, plan de la familia en cada hijo, Cuidador/`readOnly`
- [x] T019 [US1] `POST /accounts/{ownerId}/children` por un Tutor: en `server/router.go` pasa a `RequireAccess` sobre la **cuenta** con nivel `Full` (`LevelOnAccount`) y `AddChildIfUnderLimit` usa el plan y el tope de la cuenta **dueña** (ya lo hace por su fila bloqueada); pruebas: Tutor agrega a la familia, Cuidador y ajeno → 403, el tope cuenta lo agregado por el Tutor
- [x] T020 [P] [US1] `backend/internal/account/disclaimer.go` y `frontend/src/features/home/WelcomeDisclaimer.tsx` (+ tests y los `disclaimerVersion` de pruebas/E2E que cambien): sube `CurrentDisclaimerVersion` y agrega el texto de que **compartir significa que otra persona ve datos médicos del menor** (research R12)
- [x] T021 [P] [US1] `frontend/src/features/family/types.ts`, `api.ts` (+ test): `FamilyContext`, `Invitation`, `Member`; `fetchFamily`, `createInvitation`, `resendInvitation`, `cancelInvitation`, `previewInvitation`, `acceptInvitation`, `declineInvitation`, errores por tipo; la ficha va **solo en el cuerpo**, nunca en la dirección
- [x] T022 [P] [US1] `frontend/src/features/home/types.ts` y `features/family/useRole.ts` (+ test): `Child` gana `accountId`, `role`, `plan`, `readOnly`; `Account.family`; `useChildAccess(childId)` devuelve `{ role, canAdd, canMark, canInvite, plan, readOnly }` (dueña/Tutor completo; Cuidador ver y marcar; `readOnly` ⇒ no agregar). **Reemplaza** las decisiones que hoy toman `account.plan`: `ChildDetailPage.tsx` (nueva consulta), `ConsultationDetailPage.tsx`, `NewConsultationPage.tsx` (`recordOnlyAvailable`), `HistoryEntry`/`HistoryPage.tsx` (historial), `ChildrenSidebar.tsx` (etiqueta del plan), y `home/plan.ts`/`AddChildDialogs.tsx` (el límite de hijos es el de la **familia a la que se agrega**: la propia cuenta, o la dueña si la persona es Tutor). Pruebas por pantalla con un Tutor de cuenta gratuita ante una familia de pago
- [x] T023 [US1] `frontend/src/features/family/FamilyPage.tsx`, `InviteForm.tsx`, `MembersList.tsx` (+ tests): `/familia`, **dos diseños** (`useIsDesktop`; móvil con cabecera oscura, web dentro de `AppShell`): lista de personas (nombre, rol, desde cuándo, «Quitar» solo si `canRemove`), invitaciones con estado y vencimiento (**copiar liga**, reenviar, cancelar), formulario de invitación (correo y rol **Tutor / Cuidador**), capacidad («2 de 4»), estados vacío y de error; con plan gratuito, el aviso del plan (`FreemiumLimitModal` con motivo nuevo `family`, T025). Campos con `formStyles`; áreas de 44 px; sin desplazamiento horizontal a 390 px
- [x] T024 [US1] `frontend/src/features/family/InvitationPage.tsx` (+ tests): `/familia/invitacion`, lee la ficha del **fragmento** (`location.hash`), la manda en el cuerpo; sin sesión lleva a iniciar sesión/registrarse y vuelve; con sesión sin cuenta de PediTrack, un formulario mínimo (nombre y apellido) crea la cuenta **sin hijos** y sigue; muestra quién invita, el rol, el texto de **datos médicos del menor** y el correo; **Aceptar** / **Rechazar**; mensajes claros para `invitation_not_found`, `email_mismatch` (cómo entrar con el correo correcto), `already_in_family`, `family_full`, plan; al aceptar, va al home con los hijos compartidos
- [x] T025 [US1] `frontend/src/features/account-signup/FreemiumLimitModal.tsx` (+ test): motivo `'family'` («Compartir con tu familia» · «Compartir con tu pareja o con quien cuida es parte del plan completo. Todo lo que ya registraste se mantiene.»); `frontend/src/features/consultations/api.ts` (o el de `family`) mapea el 422 `reason: "family"`
- [x] T026 [US1] `frontend/src/App.tsx`, `features/home/ChildrenSidebar.tsx`, `HomePage.tsx`: rutas `/familia` y `/familia/invitacion` (esta última **sin** `RequireSession` para poder llegar, pero que pide sesión dentro); la entrada «Familia» en el home (móvil) y en la barra lateral (web), visible a quien puede invitar y, con el aviso, al plan gratuito; los hijos compartidos se ven en el home y la barra junto a los propios con una marca discreta del rol. Pruebas
- [x] T027 [US1] Verificación de la fase: backend `go test ./... -cover`, frontend `npx vitest run --coverage`; E2E de **dos sesiones** (T036) pospuesto a la fase 8; prueba manual de la guía `quickstart.md` §1. Commit de la fase

## Fase 5: US3 — recordatorios por persona

**Meta**: a cada persona con acceso y dispositivo activo, a lo más un aviso por toma; ninguno si ya está marcada; «Tomada» a su nombre.

- [x] T028 [US3] `backend/internal/reminder/repository.go` (+ `service.go`, `model.go`, tests): `ClaimDueDoses` reclama **pares (toma, persona)**: un `INSERT INTO dose_reminders … SELECT … ON CONFLICT (dose_id, account_id) DO NOTHING RETURNING` donde las personas destinatarias son las cuentas con acceso `Mark` o más al hijo de la toma (dueña, Tutores activos, Cuidadores activos, Hijo de ese hijo) con **al menos un dispositivo activo activado antes de la toma**; mismas exclusiones de siempre (marcada, sin registrar, cancelada, fuera de la ventana); sigue escribiendo `doses.reminder_sent_at` (compatibilidad). `DueDose` lleva la **persona** y **su** `reminder_detail`; `Service.Tick` manda a los dispositivos de **esa** persona (`ActiveDevicesFor` ya es por cuenta) con **su** elección. Pruebas contra la base: una toma, tres personas → un aviso a cada una; dos *ticks* seguidos no duplican (PK); marcada antes → ninguno; una persona sin acceso o que salió no recibe; cada una con su detalle/genérico; lo ya avisado antes de la migración (relleno) no se reenvía
- [x] T029 [US3] `reminder/service.go`: el token de «Tomada» sigue nombrando (toma, dispositivo), y T010 marca a nombre de la cuenta del dispositivo; prueba de punta a punta: el aviso de B marca a nombre de B y A lo ve «por B»
- [x] T030 [P] [US3] Prueba de que **perder el acceso corta los avisos al instante**: una persona quitada o que salió (fase 7) deja de ser destinataria en el siguiente *tick* sin tocar sus dispositivos; y de que el aviso sigue viniendo con el texto genérico/detallado sin datos de otro hijo. Commit de la fase

## Fase 6: US4 y US5 — salir, quitar y plan cancelado

**Meta**: la persona invitada sale cuando quiera; un Tutor no puede ser quitado; sin plan de pago, solo lectura que sigue marcando.

- [ ] T031 [US4] `family/repository.go` y `service.go` (+ tests): `Leave(ctx, accountID)` (`active → left`, `ended_at`, `ended_by` = ella; `ErrOwnerCannotLeave` para la dueña); `RemoveMember(ctx, actorLevel, memberID)` (`active → removed`; **solo** Cuidador o Hijo; un Tutor → `ErrCannotRemoveTutor`; lo pide un `Full` de esa familia); lo que la persona registró **se queda**; volver a invitarla crea una invitación y una membresía **nuevas**. Pruebas: salir corta todo al instante (la matriz de `access` devuelve `None`), nadie puede quitar a un Tutor ni la dueña ni otro Tutor, el historial de marcas conserva «por …»
- [ ] T032 [US4] `family/handler.go` (+ Swagger, router y pruebas): `POST /family/members/{memberId}/remove` (nivel `Full`) y `POST /family/leave` (la propia persona); errores `403 cannot_remove_tutor`, `403 owner_cannot_leave`; filas **por rol** en `router_test.go` (un Tutor intentando quitar a otro Tutor → 403 por llamada directa)
- [ ] T033 [US5] Plan cancelado: comprueba y completa lo derivado — `access` baja a `Mark` a las personas invitadas con la cuenta dueña sin `paid` (T004); `GET /accounts/me` y `GET /family` devuelven `readOnly`; invitar y aceptar rechazan con 422 `family` si la cuenta dueña no es `paid`; **no se oculta nada** y **sí se puede marcar y desmarcar lo propio**. Pruebas con la dueña `paid → free → paid`: el invitado ve todo, no agrega (403 en rutas `Full`), marca, y recupera su rol al volver `paid` sin nueva invitación; quien sale con la dueña en `free` no puede unirse a otra familia sin plan de pago
- [ ] T034 [P] [US4] [US5] Frontend (+ tests): en `FamilyPage` los botones **«Salir de esta familia»** (para la persona invitada) y **«Quitar»** (Cuidador/Hijo) con un diálogo de confirmación neutral (qué deja de ver, que **no se lleva** copia, que lo suyo propio no cambia); aviso **neutral de solo lectura** cuando `readOnly` («El plan de la familia ya no es de pago: puedes ver todo y marcar tomas…», con «Salir de esta familia»); la interfaz oculta «Nueva consulta», «Agregar hijo», «Finalizar/Recorrer tratamiento» e invitar cuando `readOnly` o el rol no los permite (T022); desmarcar solo se ofrece en lo propio o a un Tutor. Al recibir 403 de una persona ya sin acceso, vuelve a su home con un mensaje claro (FR-028). Commit de la fase

## Fase 7: Extremo a extremo (Entrega 1)

- [ ] T035 [P] `frontend/e2e/helpers.ts`: auxiliares para **dos sesiones** (`seedFamilyOwner(page)` con plan `paid`, un segundo contexto de Playwright con su propio usuario de Clerk con el correo a invitar, `inviteViaApi(request, token, email, role)` que devuelve la ficha) y para esperar el refresco de 60 s sin dormir (`expect.poll`)
- [ ] T036 `frontend/e2e/familia.spec.ts` (390 y 1280 px): la guía `quickstart.md` §1–§5 con dos sesiones — invitar, abrir la liga, aceptar con el correo correcto (y con otro correo **no**), la pareja ve y agrega una consulta que la dueña también ve; la toma marcada por una aparece «por …» en la otra en menos de 1 minuto y la desmarca un Tutor; la pareja se desvincula y pierde todo al instante, la dueña no tiene cómo quitarla; el tope de 4; plan cancelado (la dueña a `free` con SQL: solo lectura, sigue marcando; de vuelta a `paid`); cuenta gratuita ve el aviso del plan en «Familia». Sin desplazamiento horizontal a 390 px
- [ ] T037 Recordatorios con dos personas en `frontend/e2e/recordatorios.spec.ts` o un spec nuevo: cada cuenta registra su dispositivo simulado; vence una toma y a cada una le llega un solo aviso (comprobado contra la API, la entrega real está en las pruebas del backend); si una marca antes, a nadie
- [ ] T038 Corre **toda** la E2E en Chromium con 3 procesos y arregla lo que rompa por la entrada nueva «Familia», los hijos compartidos o el texto de las tomas (selectores por rol y nombre, no por posición)

## Fase 8: Cierre de la Entrega 1

- [ ] T039 [P] Documentación: `CLAUDE.md` (línea de la feature 032), `backend/CLAUDE.md` (paquetes `access` y `family`, niveles, tope por plan, tomas con autor, `dose_reminders`, reglas de quitar, ficha en el fragmento y sin correo), `frontend/CLAUDE.md` (`features/family`, `useChildAccess`, plan por hijo, «por …»), `DEPLOY.md` (migraciones **0017 y 0018** en el orden de despliegue y la nota del relleno), `BACKLOG.md` (el tercer paso pasa a «Entrega 1 hecha»; quedan **Cuidador/Hijo**, el **correo saliente** al invitar y el **PDF** al salir)
- [ ] T040 Verificación completa: `cd backend && go vet ./... && go test ./... -cover` (>90 %), `go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd` sin cambios pendientes, `cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run --coverage` (>90 %) y `npx playwright test`
- [ ] T041 Revisión de código (`/code-review` nivel alto) del diff completo, arreglar los hallazgos, volver a verificar, y abrir el **PR** a `develop` con el resumen, el recordatorio de los **pendientes legales** (custodia antes de lanzar; menores antes de la Entrega 3), el orden de despliegue (migraciones a mano **antes** del backend) y el aviso de que **no hay mock** de «Familia» ni de la invitación (se muestran al usuario para ajustes); revisar el CI

## Fase 9: Entrega 2 — Cuidador (US6)

> Sobre lo mismo: el rol ya existe en el modelo y en `access`; falta ofrecerlo y comprobarlo. Va en su propio PR.

- [ ] T042 [US6] Backend: confirmar con la **matriz** de T004/T006 que un Cuidador ve todos los hijos y consultas (incluida la foto de la receta), marca y desmarca solo lo suyo, recibe avisos, y recibe 403 en agregar hijo, nueva consulta, `end`, `extend`, invitar y quitar; completar los huecos que aparezcan (+ pruebas)
- [ ] T043 [US6] Frontend (+ tests): el rol **Cuidador** en el formulario de invitación con su explicación («Ve y marca las tomas; no agrega ni invita»); un Cuidador no ve «Nueva consulta», «Agregar hijo», «Finalizar/Recorrer», «Buscar»… solo lo que su nivel permite, ni «Familia» para invitar (sí para salir); cualquier Tutor puede quitarlo con confirmación
- [ ] T044 [US6] `frontend/e2e/familia-cuidador.spec.ts` (390 y 1280 px): invitar a un Cuidador, ver y marcar, no poder agregar (ni por la interfaz ni por llamada directa), un Tutor lo quita y lo pierde al instante, y el plan cancelado no le cambia lo que ya hacía. Documentación y PR de la Entrega 2

---

## Dependencias y orden

- **Fase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8** en orden (cada una apoya en la anterior). **Fase 9** al final y en su PR.
- Dentro de la **fase 2**: T002 y T003 en paralelo; T004 necesita T002; T005 después de T004; T006 después de T005.
- **Fase 3**: T008 → T009; T010 después de T004 y T008; T011 en paralelo con el backend (usa solo el contrato).
- **Fase 4**: T013 → T014 → T015 → T016 → T017; T018 y T019 después de T002; T020, T021, T022 y T025 son independientes entre sí ([P]); T023 y T024 después de T021, T022 y T025; T026 al final.
- **Fase 5** necesita T004, T015 y T018. **Fase 6** necesita T015 y T028. **Fase 7** al final.

## Ejecución en paralelo

- Backend y frontend avanzan a la vez dentro de las fases 3 y 4 en cuanto `contracts/family.md` está fijo: T011, T020–T022 y T025 no necesitan el servidor.
- T039 (documentación) se puede escribir mientras corren las pruebas largas.

## Estrategia de implementación

1. **Entrega 1 completa antes de lanzar** (fases 1–8): sin salir/quitar (T031–T032) y sin plan cancelado (T033) no se puede lanzar, porque un Tutor invitado nunca podría salir.
2. Cada fase se **commitea y verifica sola** (`go test`, `vitest`, E2E de lo tocado): si algo se complica, la rama queda siempre en un estado que funciona.
3. Se puede **mostrar al usuario** «Familia» y la invitación al terminar la fase 4 (no hay mock), antes de seguir con recordatorios y salidas.
4. **Pendientes legales** (custodia, menores) condicionan el **lanzamiento**, no el desarrollo; el rol Hijo (Entrega 3) espera su respuesta.
