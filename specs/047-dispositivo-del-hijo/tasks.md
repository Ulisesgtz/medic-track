---

description: "Lista de tareas de la spec 047: dispositivo del hijo"
---

# Tareas: Dispositivo del hijo

**Entrada**: `/specs/047-dispositivo-del-hijo/` (plan.md, spec.md, research.md R1–R11, data-model.md, contracts/api.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): > 90 % en Go y en el frontend; las pruebas marcadas «primero» se escriben y se ven fallar **antes** del código que prueban (TDD). Todo endpoint responde por `*httpx.Responder`. Un solo PR a `develop`, **sin abrirlo hasta que el dueño lo pida**.

**Organización**: la migración y los cimientos (autenticar el dispositivo, el segundo tipo de identidad, el grupo de rutas) bloquean todo y van primero. Después, una fase por historia: **US1** (generar el acceso y que el teléfono del niño lo canjee) y **US2** (el hijo ve y marca solo lo suyo) forman el MVP; **US3** (listar, quitar, rotar), **US4** (avisos push) y **US5** (plan caducado) se suman encima. La 047 **no depende** de la 046 (PR #63).

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin depender de una tarea sin terminar).
- **[US1]…[US5]**: la historia de `spec.md` a la que sirve.
- **[DUEÑO]**: la hace el dueño del producto en un panel, en el servidor o con un teléfono real; **no es código**, no bloquea la implementación, solo el despliegue y la prueba real.
- Convenciones del repo: código y esquema en inglés, docs en español; **archivos con CRLF** (editar con scripts de Python que preserven los finales de línea; los heredocs de bash con apóstrofes se rompen: usar la herramienta de escritura); `npm run build` compila también las pruebas; vitest con `--testTimeout=30000 --maxWorkers=4`; base local `DATABASE_URL=postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable`; **dentro de una transacción solo `tx`, nunca el pool** (lección de la spec 045: probar también con `pool_max_conns=4`); las E2E no corren en local (necesitan la llave de Clerk): las corre el CI.
- **Nunca** escribir la ficha, la credencial ni el nombre del dispositivo en direcciones, registros, `error_logs` ni mensajes de error.

---

## Fase 1: Configuración

- [X] T001 Línea base: `cd backend && go vet ./... && go test ./... -cover` y `cd ../frontend && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4` en verde antes de empezar; anotar la cobertura de `internal/access`, `internal/authmw`, `internal/reminder`, `internal/consultation` y `internal/supplement`.
- [X] T002 Crear `backend/migrations/0029_child_device.sql` **exactamente** según `data-model.md`: (a) `child_device_links` con `FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id)`, `name` con CHECK 1–40 caracteres, `status` CHECK `pending|active|revoked`, los CHECK por estado (`pending` ⇒ `token_hash` no nulo y `credential_hash` nulo; `active` ⇒ `credential_hash`, `redeemed_at` no nulos y `token_hash` nulo; `revoked` ⇒ ambas huellas nulas y `revoked_at` no nulo), `reminder_detail` CHECK `detailed|generic` o nulo, y los índices (únicos parciales sobre `token_hash` donde `status = 'pending'`, sobre `credential_hash` y sobre `credential_hash_previous` donde `status = 'active'`, y `(child_id, status)`); (b) `ALTER TABLE doses` y `ALTER TABLE supplement_doses` con `taken_by_child_device_id UUID NULL REFERENCES child_device_links (id)`, un CHECK de **a lo más un autor** (cuenta o dispositivo) y el CHECK existente de «sin autor si no está marcada» ampliado al dispositivo (borrar y recrear `doses_author_only_when_taken` y su gemelo de `supplement_doses` con el nombre nuevo); (c) `reminder_devices`: `account_id DROP NOT NULL`, `child_link_id UUID NULL REFERENCES child_device_links (id)`, `CHECK ((account_id IS NULL) <> (child_link_id IS NULL))` e índice parcial `(child_link_id) WHERE active`; (d) tablas `child_dose_reminders (dose_id → doses, link_id → child_device_links, sent_at, PRIMARY KEY (dose_id, link_id))` y `child_supplement_dose_reminders` igual contra `supplement_doses`. Solo aditiva: comentarios en español, ninguna columna existente cambia de significado.
- [X] T003 Aplicar la `0029` a la base local (`psql … -f` o el script de `node`/`pg`) y comprobar con `\d child_device_links`, que las tablas existentes siguen leyéndose y que el backend actual (`go test ./internal/reminder ./internal/consultation ./internal/supplement`) sigue en verde con la migración puesta.

**Punto de Control**: migración aplicada en local; línea base en verde. **Commit de fase**: «feat(047): migración 0029 (dispositivo del hijo)».

---

## Fase 2: Fundamental (bloquea todas las historias)

**Objetivo**: poder reconocer a un dispositivo de hijo en cada petición y dejar listo el grupo de rutas aislado.

- [X] T004 [P] (primero) Crear `backend/internal/childdevice/token.go` y `token_test.go`: `NewToken()` (32 bytes de `crypto/rand` en base64url sin relleno), `Hash(token) []byte` (SHA-256) y `ParseToken(s) ([]byte, bool)` que rechaza sin tocar la base cualquier cosa que no sea base64url de 32 bytes; pruebas: longitud, unicidad en 1000 llamadas, forma inválida, y que `Hash` es determinista.
- [X] T005 [P] Crear `backend/internal/childdevice/model.go` y `errors.go`: `Link` (id, childID, accountID, name, status, createdAt, redeemedAt, lastSeenAt, expiresAt, reminderDetail, createdByAccountID), `Principal` (linkID, childID, ownerAccountID, childFirstName, deviceName, reminderDetail, rotateAfter), `ErrNotFound`, `ErrLimit` (con el tope), `ErrPlanRequired` (con `Reason = "child_device"`), `ErrInvalidName`; constantes `LinkLifetime = 24h`, `MaxLinksPerChild = 3`, `CredentialIdle = 90*24h`, `RotateEvery = 7*24h`, `RotateGrace = 24h`, `TouchEvery = 10*time.Minute` y un reloj inyectable (`type Clock func() time.Time`).
- [X] T006 (primero) Escribir y luego crear en `backend/internal/childdevice/repository.go` `Authenticate(ctx, credentialHash, now) (*Principal, error)`: **una consulta** por huella (`credential_hash` **o** `credential_hash_previous` dentro de `RotateGrace` desde `rotated_at`), solo vínculos `active` cuyo `last_seen_at` (o `redeemed_at` si nunca se usó) sea de hace menos de `CredentialIdle`, uniendo `children` para traer el nombre de pila del hijo; después, **solo si `last_seen_at` tiene más de `TouchEvery`**, un `UPDATE … SET last_seen_at = now()` (su error no falla la petición). Todo fallo (desconocida, quitada, caducada, huella previa fuera de gracia) es el mismo `ErrNotFound`. Pruebas contra la base real con reloj inyectable en `repository_test.go` (y su `testhelpers_test.go` que inserta vínculos `active` directamente): vigente, desconocida, `revoked`, caducada a los 90 días, huella previa dentro y fuera de la gracia, y que `last_seen_at` no se reescribe dentro de 10 minutos.
- [X] T007 [P] (primero) En `backend/internal/access/access.go` agregar `ActorDeviceID uuid.UUID` a `Access` (nulo = el actor es una cuenta) sin cambiar ninguna consulta ni función existente; ampliar `access_test.go` para comprobar que `WithAccess`/`FromContext` conservan el campo.
- [X] T008 Crear `backend/internal/childdevice/middleware.go` con `RequireChildDevice(responder, repo)`: lee `Authorization: Device <credencial>` (cualquier otro esquema, incluido `Bearer`, o ausencia ⇒ 401), calcula la huella, llama `Authenticate` y deja el `Principal` en el contexto (`PrincipalFromContext`); todo fallo escribe 401 con `responder.WriteJSONErrorUnlogged` (cualquiera lo provoca); un error de base es 500 normal. Y tres guardas que, después de él, ponen `access.Access{Level: access.Mark, ActorDeviceID: p.LinkID}` en el contexto: `SameChild(param)` (el `childId` de la ruta debe ser el del dispositivo, si no 403 con el mismo mensaje que los demás recursos ajenos; un id mal formado pasa al 404 del handler), `RoutineOfChild(responder, repo)` y `ConsultationOfChild(responder, repo)` (un `EXISTS` que verifica que la rutina / consulta es del hijo del dispositivo; inexistente o ajena ⇒ 403). Pruebas en `middleware_test.go` con `httptest` y base real: sin encabezado, `Bearer`, credencial inválida, quitada, vigente; recurso propio, ajeno e inexistente; y que el 401 no escribe en `error_logs`.
- [X] T009 Cableado mínimo: `server.Deps` gana `ChildDevice *childdevice.Handler` y `ChildDeviceAuth func(http.Handler) http.Handler`; en `backend/internal/server/router.go` registrar un **grupo vacío** `r.Route("/child-device", …)` con `Use(d.ChildDeviceAuth)` solo si está configurado (las rutas se agregan por historia). Extender `newWorld` de `router_test.go` con un hijo de la cuenta A y un vínculo `active` con su credencial (`deviceCredential`) y un helper `w.doDevice(method, path, body)` que manda `Authorization: Device …`; agregar la prueba `TestRouter_AChildDeviceCredentialOpensNothingOutsideItsWhitelist` que recorre **todas** las rutas de `w.routes()` con la credencial y exige 401 (rutas de padres) — se amplía en cada historia con la lista blanca.

**Punto de Control**: un dispositivo `active` insertado a mano se reconoce, uno quitado o caducado no, y ninguna ruta de padres lo acepta. **Commit de fase**: «feat(047): identidad del dispositivo del hijo (autenticación, guardas y grupo de rutas)».

---

## Fase 3: Historia de Usuario 1 — Dar el acceso y canjearlo (Prioridad: P1) 🎯 MVP

**Objetivo**: el Tutor genera una liga; el teléfono del niño la abre y queda vinculado, sin dar ningún dato.

**Prueba Independiente**: un Tutor y un segundo navegador sin sesión: el Tutor crea la liga, el navegador la canjea y recibe una credencial válida; una segunda vez, «ya no sirve».

### Pruebas (primero)

- [X] T010 [P] [US1] `backend/internal/childdevice/repository_create_test.go` (base real): `Create` bloquea la fila de la cuenta dueña y exige `plan = 'paid'` (`ErrPlanRequired`), bloquea la del hijo y cuenta vínculos `active` + `pending` sin vencer (tope 3 → `ErrLimit`), nombre de 1 a 40 caracteres sin caracteres de control (`ErrInvalidName`), la liga queda `pending` con `expires_at = now + 24 h` y solo guarda la huella; **seis creaciones simultáneas del mismo hijo dejan exactamente 3**; generar otra liga con el mismo nombre cancela la pendiente anterior (`revoked`); con `pool_max_conns=4` no se atora.
- [X] T011 [P] [US1] `backend/internal/childdevice/repository_redeem_test.go`: `Redeem(token, now)` en **una sentencia** `UPDATE … WHERE status = 'pending' AND expires_at > $now AND token_hash = $h RETURNING …` que pasa a `active`, anula `token_hash`, guarda `credential_hash` y `rotated_at`; **dos canjes a la vez: uno gana, el otro `ErrNotFound`**; liga usada, vencida, cancelada, inventada o mal formada ⇒ el **mismo** `ErrNotFound`.
- [X] T012 [P] [US1] `backend/internal/childdevice/handler_test.go`: `POST /children/{childId}/device-links` (201 con `token`, `expiresAt`; 400 nombre; 422 `freemium_consultation_limit_exceeded` con `reason: "child_device"`; 422 `child_device_limit_exceeded` con `limit: 3`; 403 sin nivel `Full`), `POST /child-device/redeem` (200 con `credential`, `childId`, `childFirstName`, `rotateAfter`; 404 idéntico para todo fallo; 429 por el límite estricto), y que **ni la ficha, ni la credencial, ni el nombre** aparecen en `error_logs` (capturar con un `Recorder` y revisar cada entrada).

### Implementación

- [X] T013 [US1] `repository.go`: `Create(ctx, childID, actorAccountID, name, now) (*Link, token string, error)` y `Redeem(ctx, token, now) (*Redeemed, error)` según T010–T011, con `tx` dentro de la transacción, `SELECT … FOR UPDATE` de `accounts` (plan) y de `children` (tope) y `mailer.Clean(name, 40)` para el nombre.
- [X] T014 [US1] `backend/internal/childdevice/service.go` y `handler.go` (constructor con `*httpx.Responder`): `CreateLink` (nivel `Full` ya garantizado por `fullChild`, `ActorAccountID` de `access.FromContext`), `Redeem`; respuestas según `contracts/api.md` (la liga solo se devuelve aquí; el cliente arma `${origin}/hijo#<token>`); errores 400/422/404 con `planLimitBody`-style (mismo `error` y `reason` que las demás funciones del plan). Anotaciones swag en cada handler.
- [X] T015 [US1] `router.go`: `r.With(fullChild).Post("/children/{childId}/device-links", …)` dentro del grupo con sesión y `r.With(strict).Post("/child-device/redeem", d.ChildDevice.Redeem)` **público**; fila nueva en `routes()` de `router_test.go` (owner alcanza el handler, Cuidador 403, ajeno 403) y el canje en la prueba de rutas públicas; cablear en `cmd/api/main.go`; regenerar Swagger (`go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd`).
- [X] T016 [P] [US1] Frontend, textos: `frontend/src/features/childDevice/childText.ts` con **todas** las frases de la función (generar, liga lista, avisos de responsabilidad del padre —«Darle un teléfono a un niño es decisión tuya. Quien abra esta liga verá las tomas y actividades de [hijo]. La puedes quitar cuando quieras.»—, estados, errores del canje y del hijo) y `childText.test.ts` con la **prueba de redacción** (ningún `debes`, `toca`, `atraso`, `completa`, `alerta`, `urgente`, `recomend`, `pendiente`, `falta` ni consejos de salud; cada estado tiene salida).
- [X] T017 [US1] Frontend, padres: `features/childDevice/api.ts` (`createDeviceLink`, con el nombre solo en el cuerpo), `hooks.ts` (`useCreateDeviceLink`) y `ChildAccessBlock.tsx` (bloque «Acceso del hijo»: campo «Nombre del teléfono», «Crear liga», **«Liga lista»** que se ve una vez con «Copiar liga» como el único botón sólido, vencimiento y el aviso de responsabilidad; el 422 `child_device` abre `FreemiumLimitModal reason="child_device"`; el tope de 3 dice qué hacer; los dos diseños con `useIsDesktop`; solo si `useChildAccess(...).canAdd`). Pruebas Vitest del bloque.
- [X] T018 [US1] Frontend: motivo `child_device` en `features/plans/planCopy.ts` (`PlanLimitReason`, `LIMIT_MOTIVES` con título, línea y tres filas, y la fila del motivo resaltada) y en `FreemiumLimitModal`; actualizar `Plans.test.tsx`/pruebas del modal (el número de motivos pasa de 7 a 8) y que `PlanAvisoCompacto` lo use para quien no tiene plan.
- [X] T019 [US1] Frontend, hijo: `features/childDevice/storage.ts` (`readCredential/writeCredential/clearCredential` con la clave `hijo-credencial`, **siempre en `try/catch`**, nada más), `api.ts` del hijo (`redeemLink(token)` sin encabezado; todas las demás llamadas con `Authorization: Device <credencial>`; **ninguna** importa `@clerk/react`), `RedeemPage.tsx` en `/hijo`: lee la ficha del `#`, la quita de la barra (`history.replaceState`), llama `redeemLink` **una sola vez** (también bajo `StrictMode`), guarda la credencial y navega a `/hijo/hoy`; si falla, un solo mensaje «Esta liga ya no sirve. Pídele a tu papá o mamá una nueva.»; sugiere instalar la app en el iPhone. Rutas públicas `/hijo` y `/hijo/hoy` en `App.tsx` **fuera** de `RequireSession` y de `AppShell`. Pruebas de `storage.ts` (sin almacenamiento disponible), `api.ts` y `RedeemPage.tsx`.
- [X] T020 [US1] Montar `ChildAccessBlock` en `features/consultations/ChildDetailPage.tsx` (ambos diseños, junto a las secciones de suplementos y actividades) y un resumen en `features/family/FamilyPage.tsx` (explicación neutral y enlace a la ficha del hijo); actualizar `ChildDetailPage.test.tsx`.
- [X] T021 [US1] `cd backend && go vet ./... && go test ./... -cover` y `cd frontend && npm run build && npx eslint src && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4` en verde.

**Punto de Control**: un Tutor crea la liga y otro navegador la canjea; el segundo canje falla igual que una liga inventada. **Commit de fase**: «feat(047): generar y canjear el acceso del hijo».

---

## Fase 4: Historia de Usuario 2 — El hijo ve y marca solo lo suyo (Prioridad: P1) 🎯 MVP

**Objetivo**: la lista blanca de rutas del hijo, las marcas «por Mateo» y la vista del hijo.

**Prueba Independiente**: con el hijo vinculado, marca una toma; el Tutor, en otra sesión, la ve «por Mateo»; el hijo no puede quitar la del Tutor; cualquier otra ruta se rechaza.

### Pruebas (primero)

- [X] T022 [P] [US2] `backend/internal/consultation/device_actor_test.go` y `backend/internal/supplement/device_actor_test.go` (base real): una marca con `Actor{DeviceID}` guarda `taken_by_child_device_id` y **no** `taken_by_account_id`; `takenBy.name` es el nombre de pila del **hijo** (`children.first_name`), `mine` es verdadero solo para ese dispositivo; la primera marca gana; desmarcar: el dispositivo solo la suya, un `Full` cualquiera, una cuenta desmarca la de un dispositivo si es `Full` y **no** si es solo `Mark`; las marcas de cuentas existentes se leen igual que antes (regresión); el CHECK de un solo autor.
- [X] T023 [P] [US2] Ampliar `router_test.go`: la **tabla de la lista blanca** (cada ruta de `/child-device` de `contracts/api.md` con el dispositivo: la del propio hijo responde 200/204, la de otro hijo o recurso ajeno 403, sin credencial 401) y la prueba global que recorre **todas** las rutas registradas y exige que, con la credencial del hijo, **solo** las de la tabla respondan algo distinto de 401/403.

### Implementación

- [X] T024 [US2] `consultation`: `Actor` gana `DeviceID uuid.UUID`; `handler.go` arma el actor desde `access.FromContext` (`ActorDeviceID`); `repository.go` (`UpdateDoseStatus`, y las lecturas que traen `TakenBy` en `GetByID`, `ListDoses`, el overview y `overview_supplements.go`) escribe/lee `taken_by_child_device_id` con `COALESCE` del nombre (cuenta o hijo); `TakenBy` gana `DeviceID`; `toTakenByResponse`/`mine` comparan cuenta **o** dispositivo. Compatible hacia atrás.
- [X] T025 [US2] `supplement`: lo mismo para `UpdateDose`, `MarkNext` (`POST /routines/{id}/done` marca con el dispositivo), las lecturas de rutinas (`doses`, `NextDose`, `LastDone`) y `actorOf`/`toDoseResponse`; `levelOf` sigue siendo `Mark`.
- [X] T026 [US2] Rutas del hijo en `router.go` (grupo `/child-device`, con `ChildDeviceAuth`): `GET /me` (nuevo, `Handler.Me`: `childId`, `childFirstName`, `deviceName`, `rotateAfter`, `reminderDetail`), `GET /children/{childId}/overview` → `Consultation.GetChildOverview` con `SameChild("childId")`, `GET /children/{childId}/routines` → `Supplement.ListRoutines` con `SameChild`, `PATCH /consultations/{consultationId}/doses/{doseId}` → `Consultation.UpdateDose` con `ConsultationOfChild`, `PATCH /routines/{routineId}/doses/{doseId}` → `Supplement.UpdateDose` y `POST /routines/{routineId}/done` → `Supplement.MarkRoutineDone` con `RoutineOfChild`. **Ninguna otra.** Verificar que las respuestas reutilizadas no traen nada que la vista del hijo no deba ver (nombre del medicamento y de la rutina sí; doctor, notas de la consulta y fotos no) y anotarlo en un comentario. Regenerar Swagger.
- [X] T027 [P] [US2] Frontend, hijo: `features/childDevice/hooks.ts` (`useChildMe`, `useChildToday` con el día local `useLocalDay`, `useChildRoutines`, `useMarkDose`, `useMarkRoutineDone`, refresco cada 60 s) sobre el cliente del hijo; si una petición responde 401/403 llama `clearCredential()` y muestra el estado «sin acceso» (T029). Pruebas con `fetch` simulado.
- [X] T028 [US2] `features/childDevice/ChildTodayPage.tsx` en `/hijo/hoy` (móvil primero, columna de 430 px; en la web una columna centrada): saludo con el nombre del hijo, **«Tus tomas de hoy»** (reutiliza `DoseChipView`, la agrupación Mañana/Tarde/Noche y `formatTime`), **«Tus suplementos»** y **«Tus actividades»** (reutiliza `DayProgress`, `RealizadoButton`, `scheduleText`), sin menú, planes, familia ni cuenta; «por Mateo, 08:05» en lo marcado; el único botón sólido por pantalla. Sin `AppShell` ni `useCurrentAccount`. Pruebas a móvil y web (`stubMatchMedia`).
- [X] T029 [P] [US2] `features/childDevice/NoAccess.tsx`: la pantalla sin datos del hijo («Este acceso ya no está activo. Pídele a tu papá o mamá uno nuevo.») para credencial ausente, quitada o caducada; prueba.
- [X] T030 [P] [US2] Prueba de aislamiento del cliente: `features/childDevice/isolation.test.ts` lee el código fuente y falla si algún archivo fuera de `features/childDevice/` importa `childDevice/api` o `childDevice/storage`, o si algo dentro de `childDevice/` importa `@clerk/react`, `useCurrentAccount` o `AppShell`.
- [X] T031 [US2] Verificación de la fase: `go vet`, `go test ./... -cover`, `npm run build`, `npx eslint src`, `npx vitest run --coverage --testTimeout=30000 --maxWorkers=4` en verde.

**Punto de Control**: el hijo ve y marca lo suyo y nada más; las marcas dicen «por Mateo». **Commit de fase**: «feat(047): rutas del hijo, marcas con autor-dispositivo y su vista».

---

## Fase 5: Historia de Usuario 3 — Ver, quitar y rotar (Prioridad: P1)

**Objetivo**: el control del padre y la seguridad de la credencial.

**Prueba Independiente**: vincular dos dispositivos, quitar uno desde el Tutor y comprobar que su siguiente petición es rechazada y la del otro sigue funcionando.

### Pruebas (primero)

- [X] T032 [P] [US3] `repository_manage_test.go` (base real): `List` (nombre, estado `pending|active|revoked|expired`, fechas; sin huellas; los `revoked` de más de 30 días no salen), `Revoke` (idempotente; pasa a `revoked`, anula huellas, **desactiva sus `reminder_devices` en la misma transacción**; vínculo de otro hijo ⇒ `ErrNotFound`), `SetReminderDetail`, `Rotate` (huella nueva, la anterior queda válida 24 h y luego no, con reloj inyectable; rotar dos veces seguidas no deja dos previas), y que **tras `Revoke` la siguiente `Authenticate` falla** (SC-003).
- [X] T033 [P] [US3] `handler_manage_test.go`: `GET /children/{childId}/device-links` (200 con `limit` y `canManage`; un Cuidador ve la lista con `canManage: false`), `POST …/{linkId}/revoke` (204; 404 de otro hijo; 403 al Cuidador), `PATCH …/{linkId}` (`reminderDetail`), `POST /child-device/rotate` (200 con `credential` nueva; la vieja sigue 24 h), `GET /child-device/me` trae `rotateAfter`.

### Implementación

- [X] T034 [US3] `repository.go`/`service.go`/`handler.go`: `List`, `Revoke`, `SetReminderDetail`, `Rotate` según T032–T033, todo con `tx` dentro de transacciones.
- [X] T035 [US3] `router.go`: `seesChild` para `GET /children/{childId}/device-links`; `fullChild` para `POST …/{linkId}/revoke` y `PATCH …/{linkId}`; dentro de `/child-device`: `POST /rotate`. Filas en `routes()` de `router_test.go` (owner, Tutor, Cuidador, hijo-rol, quitado, ajeno) y en la tabla de la lista blanca; Swagger regenerado.
- [X] T036 [US3] Frontend, padres: `ChildAccessList.tsx` dentro del bloque (nombre, «Desde el 12 oct», «Última vez: hoy 08:05» o «Sin usar», estado `Activo`/`Pendiente`/`Vencido`, «Quitar» con el `ConfirmDialog` de la familia en tono `ink` con palabras neutrales —qué deja de ver, que no se borra lo que ya marcó, que se puede crear otra—, el selector «Texto del aviso: genérico / con detalle»); el Cuidador ve la lista sin botones; refresco de la lista cada 60 s. Pruebas.
- [X] T037 [US3] Frontend, hijo: rotación — `useRotateCredential` llama `POST /child-device/rotate` cuando `rotateAfter` ya pasó (al abrir la app y al volver al primer plano), guarda la credencial nueva **antes** de olvidar la vieja y tolera dos pestañas a la vez; pruebas con reloj simulado.
- [X] T038 [US3] Verificación de la fase (la misma de T031).

**Punto de Control**: quitar corta el acceso en la siguiente petición; la lista dice cuándo se usó cada aparato. **Commit de fase**: «feat(047): ver, quitar y rotar los dispositivos del hijo».

---

## Fase 6: Historia de Usuario 4 — Avisos al dispositivo del hijo (Prioridad: P2)

**Objetivo**: que el teléfono del niño reciba el aviso de sus tomas y pueda tocar «Tomada»/«Realizado».

**Prueba Independiente**: con un dispositivo de hijo con avisos activados y una toma que vence, se reclama un aviso para ese aparato y ninguno para los de otros hijos; con la toma marcada o el dispositivo quitado, ninguno.

### Pruebas (primero)

- [X] T039 [P] [US4] `backend/internal/reminder/child_device_test.go` (base real): `UpsertChildDevice(linkID, endpoint, …)` (mismo endpoint de una cuenta se mueve al vínculo y viceversa, validando el mismo servicio de push), `ClaimDueChildDevices(now, window)`: reclama **(toma, vínculo)** para medicamentos, suplementos y actividades de **su** hijo con dispositivo activado antes de la toma; **un solo aviso por toma y dispositivo** aunque corran dos ticks a la vez; ninguno si la toma está marcada, cancelada (tratamiento finalizado), «sin registrar», o el vínculo no está `active`; **nunca** avisos de citas ni de otro hijo; las consultas de cuentas existentes siguen igual (regresión: `ClaimDueDoses` ignora las filas del hijo).
- [X] T040 [P] [US4] Mismo archivo: `Tick` envía a los aparatos del vínculo con el texto genérico por omisión y con detalle si `reminder_detail = 'detailed'` (el genérico no lleva medicamento ni hijo), 404/410 apaga ese aparato, el payload lleva el token firmado con `reminder_devices.id`; `MarkTakenByAction` con un aparato de hijo marca con `taken_by_child_device_id` solo si el vínculo sigue `active` y la toma es de **su** hijo (si no, `ErrInvalidActionToken`), también para suplementos y actividades («Realizado»).

### Implementación

- [X] T041 [US4] Extraer a una constante SQL compartida las condiciones de candidata de `ClaimDueDoses` y `ClaimDueSupplementDoses` (`backend/internal/reminder/candidates.go`) para que las dos consultas de cuentas y las dos de hijo usen **la misma regla** (no cambia el comportamiento: las pruebas existentes deben seguir en verde).
- [X] T042 [US4] `backend/internal/reminder/child_device.go` (+ `repository.go`/`model.go`): `DueDose` gana `ChildLinkID`; `UpsertChildDevice`, `DeactivateChildDevices`, `ActiveDevicesForLink`, `ClaimDueChildDevices` (medicamentos y suplementos/actividades, `INSERT … ON CONFLICT DO NOTHING RETURNING` sobre `child_dose_reminders` y `child_supplement_dose_reminders`) y la rama de `MarkTakenByAction` según T039–T040; `service.go`: `Tick` incluye a los hijos, usa el `reminder_detail` del vínculo y `SetReporter` sigue con los mismos tipos de falla.
- [X] T043 [US4] Rutas del hijo: `GET /child-device/reminders/config`, `POST /child-device/reminder-devices` y `POST /child-device/reminder-devices/remove` (delgadas, reutilizan la validación de endpoints de los servicios de push conocidos de la spec 011), con filas en la tabla de la lista blanca y en `router_test.go`; Swagger.
- [X] T044 [US4] Frontend, hijo: «Activar avisos» en `ChildTodayPage` (reutiliza `features/reminders/deviceSupport.ts` y `pushDevice.ts` pero registra contra `/child-device/reminder-devices`; **el permiso se pide solo al tocar el botón**; estados `unsupported`/`ios-needs-install`/`denied`/`on`); el service worker (`src/sw.ts`) y `notification.ts` ya muestran el aviso y envían «Tomada»/«Realizado» con el token del aviso: ajustar solo lo necesario para que el texto del hijo no mencione familia ni citas; pruebas.
- [X] T045 [US4] Verificación de la fase (la misma de T031), incluyendo `go test ./internal/reminder` con `pool_max_conns=4`.

**Punto de Control**: el aviso llega al teléfono del hijo y «Tomada» marca «por Mateo». **Commit de fase**: «feat(047): avisos push al dispositivo del hijo».

---

## Fase 7: Historia de Usuario 5 — Plan caducado (Prioridad: P3)

**Objetivo**: con el plan caducado el hijo sigue marcando; solo se bloquea crear.

**Prueba Independiente**: con la dueña en `free`, el dispositivo marca y recibe avisos; crear una liga responde 422.

- [X] T046 [P] [US5] Pruebas de integración en `backend/internal/childdevice/plan_test.go` (base real) y en `router_test.go`: la dueña pasa a `free`; `Authenticate`, `Redeem` de una liga **ya creada**, marcar, `rotate`, `list`, `revoke` y los avisos siguen funcionando; `Create` ⇒ `ErrPlanRequired`; al volver a `paid` crear funciona y los dispositivos previos siguen. Confirmar que ningún camino de `RequireChildDevice` consulta el plan.
- [X] T047 [P] [US5] Frontend: con `useChildAccess(...).isFree` el bloque «Acceso del hijo» muestra `PlanAvisoCompacto` en lugar de «Crear liga» **pero conserva la lista y «Quitar»** de lo ya vinculado; prueba para cuenta gratuita con y sin dispositivos.

**Commit de fase**: «feat(047): el plan caducado solo impide crear accesos nuevos».

---

## Fase 8: Pulido, E2E y documentación

- [X] T048 `backend/internal/account/disclaimer.go`: subir `CurrentDisclaimerVersion` a la fecha del cambio; `frontend/src/features/home/WelcomeDisclaimer.tsx`: frase «Si le das acceso a tu hijo, verá en su teléfono sus tomas y actividades y podrá marcarlas; no se guarda ningún dato personal suyo y puedes quitar el acceso cuando quieras.»; actualizar `WelcomeDisclaimer.test.tsx` y cualquier prueba que fije la versión.
- [X] T049 [P] E2E: helpers en `frontend/e2e/helpers.ts` — `childDeviceLinkViaApi(request, token, childId, name)` (devuelve la liga) y `redeemChildLinkViaApi(request, token)` (devuelve la credencial), sin pasar por la interfaz.
- [X] T050 `frontend/e2e/hijo.spec.ts` (a 390 y 1280 px con `designs`; **solo Chromium**, no agregar a `CROSS_BROWSER_SPECS`; dos sesiones: el Tutor con `seedChild` y un contexto del hijo **sin Clerk**): (1) el Tutor crea la liga en «Acceso del hijo», la abre el contexto del hijo y entra directo a «Tus tomas de hoy»; la misma liga otra vez dice «ya no sirve», igual que una inventada; (2) el hijo marca una toma y el Tutor la ve «por Mateo»; el hijo no puede quitar una marca del Tutor (el botón no ofrece desmarcar o el API responde rechazo); (3) **la credencial del hijo no abre nada fuera de lo suyo**: por la API directa `/accounts/me`, `/family`, `/consultations/{id}`, `/children/{id}/consultations`, `/children/{otro}/overview` responden 401/403 sin datos; (4) el Tutor **quita** el dispositivo y la siguiente petición del hijo (o recarga) muestra «Este acceso ya no está activo» sin datos; (5) el cuarto dispositivo pide quitar uno; (6) un Cuidador (dos sesiones) ve la lista sin «Crear liga» ni «Quitar»; (7) con la dueña en `free` (`setAccountPlan`) el hijo sigue marcando y «Crear liga» muestra el aviso del plan; (8) sin desborde horizontal en ninguna pantalla.
- [X] T051 [P] Documentar: `CLAUDE.md` raíz (spec 047 en «Current features»), `backend/CLAUDE.md` (paquete `internal/childdevice`, las rutas de `/child-device`, `access.Access.ActorDeviceID`, `taken_by_child_device_id`, `child_link_id` en `reminder_devices`, `ClaimDueChildDevices`, migración `0029` en la lista, la regla «un esquema `Device` aparte»), `frontend/CLAUDE.md` (carpeta `features/childDevice/`, rutas `/hijo` y `/hijo/hoy` públicas, el cliente y el almacenamiento aparte con su prueba de aislamiento, `hijo.spec.ts`), `DEPLOY.md` (migración `0029` **antes** del backend; sin variables nuevas; recordar que el aviso «Antes de empezar» cambia de versión) y `BACKLOG.md` (diseño con Claude Design de la vista del hijo, QR para pasar el acceso a otro teléfono, límites de tiempo/control parental, avisos de citas para el hijo si algún día se quieren).
- [X] T052 [P] Marcar en este archivo las tareas hechas y en `spec.md` el estado «Implementada».
- [X] T053 Verificación completa: `cd backend && go vet ./... && go test ./... -cover` (> 90 % en `internal/childdevice`; repetir `internal/server` una vez si es inestable bajo carga) y otra vez con `DATABASE_URL=…&pool_max_conns=4`; `go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd` **sin cambios**; `govulncheck ./...`; `cd ../frontend && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4 && npm run build && npx eslint src e2e`; `npx playwright test --list e2e/hijo.spec.ts` compila; buscar en lo nuevo que no haya llaves, fichas ni credenciales reales.
- [X] T054 Revisión de código (`/code-review`), un commit por fase, `git push -u origin feature/047-dispositivo-del-hijo` y **esperar** la instrucción del dueño para abrir el PR a `develop` (nota de despliegue: migración `0029` primero). Si las E2E o el CI fallan, corregir antes de pedir fusionar.

**Commit de fase**: «docs(047): E2E, CLAUDE.md, DEPLOY.md y BACKLOG.md del dispositivo del hijo».

---

## Tareas del dueño del producto (no son código)

- [ ] T055 [DUEÑO] Aplicar la migración `0029` en la base de DEV (Railway) **antes** de desplegar el backend de esta rama (mismo método que la `0025` a la `0028`). **Bloquea el despliegue.**
- [ ] T056 [DUEÑO] Actualizar el **aviso de privacidad** (LFPDPPP) para mencionar el acceso del hijo (sin datos personales del menor, quitable en cualquier momento). Bloquea el lanzamiento **real**, no la implementación.
- [ ] T057 [DUEÑO] Probar con un **iPhone real** (PWA instalada en DEV): abrir la liga desde Mensajes o WhatsApp, marcar una toma, activar los avisos y recibir uno, quitar el dispositivo desde el teléfono del padre y ver que el del niño se corta. Comprobar también qué pasa si se abre la liga en Safari **sin** instalar la app (el almacenamiento de Safari se limpia a los 7 días sin uso).
- [ ] T058 [DUEÑO] Decidir si se pide a Claude Design un diseño para la vista del hijo y el bloque «Acceso del hijo» (hoy no hay mock: están hechos con el sistema visual).

---

## Dependencias y orden de ejecución

- **Fase 1 → Fase 2 → Fase 3 (US1) → Fase 4 (US2)**; US1 y US2 son el MVP. **Fase 5 (US3)** necesita la Fase 3 (hay vínculos que listar y quitar) y puede ir en paralelo con la Fase 4 en el backend, pero comparten `router.go` y `router_test.go`: coordinar el orden de los commits. **Fase 6 (US4)** necesita la Fase 4 (marcas con autor-dispositivo y `Mark` del `Principal`) y la Fase 5 (`revoke` desactiva avisos). **Fase 7 (US5)** necesita las Fases 3 y 4. **Fase 8** al final.
- Dentro de cada historia: pruebas (marcadas «primero») → modelo/repositorio → servicio/handler → router → frontend.
- Dentro de la Fase 2: T004, T005 y T007 son independientes; T006 necesita T005; T008 necesita T006 y T007; T009 necesita T008.

## Oportunidades de paralelización

- Fase 2: `T004 ∥ T005 ∥ T007`.
- Fase 3: pruebas `T010 ∥ T011 ∥ T012`; frontend `T016` en paralelo con el backend (`T013`–`T015`); `T017`–`T019` después de `T016`.
- Fase 4: pruebas `T022 ∥ T023`; `T024` y `T025` son archivos distintos (`consultation` y `supplement`) y van en paralelo; frontend `T027 ∥ T029 ∥ T030` hasta `T028`.
- Fase 5: pruebas `T032 ∥ T033`; backend `T034`–`T035` en paralelo con frontend `T036`–`T037` una vez fijado el contrato.
- Fase 6: pruebas `T039 ∥ T040`; `T041` antes de `T042`; frontend `T044` en paralelo con `T043`.
- Fase 7: `T046 ∥ T047`.
- Fase 8: `T049 ∥ T051 ∥ T052`.

## Estrategia de implementación

- **MVP = Fases 1–4 (US1 + US2)**: con eso un Tutor da el acceso y el niño ve y marca lo suyo, ya probable con dos navegadores. **No se debe desplegar sin US3** (quitar al instante es lo que hace aceptable el diseño) ni sin T055.
- Entrega incremental sobre el mismo PR: US3 (control y rotación) → US4 (avisos, lo más delicado: toca `internal/reminder`) → US5 (comprobaciones del plan).
- Cada fase termina con sus pruebas en verde y su commit. La Fase 2 y la 4 son las de mayor riesgo (identidad nueva y autor en tablas existentes): si algo rompe las pruebas de `consultation`, `supplement` o `reminder`, se arregla antes de seguir.
