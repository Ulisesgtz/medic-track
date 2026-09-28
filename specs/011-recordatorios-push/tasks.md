---

description: "Lista de tareas de implementación: Recordatorios de tomas por notificaciones push"
---

# Tareas: Recordatorios de tomas por notificaciones push

**Entrada**: Documentos de diseño desde `/specs/011-recordatorios-push/`

**Prerrequisitos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/reminders-api.md](./contracts/reminders-api.md), [quickstart.md](./quickstart.md)

**Pruebas**: Incluidas — Principio VI de la constitución (cobertura >90% NO NEGOCIABLE) exige pruebas para todo código nuevo o tocado; "marcar dosis como tomada" es uno de los flujos críticos con E2E en Playwright. Límite conocido (research R12): los navegadores de Playwright no reciben avisos reales, así que el envío se prueba en el backend con un servidor local que hace de servicio de avisos.

**Confirmación de Principio II**: dada por el usuario el 2026-09-27 (los avisos pasan cifrados por el servicio de avisos de cada navegador; ver plan.md).

**Organización**: Las tareas se agrupan por historia de usuario para permitir la implementación y prueba independiente de cada historia.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: Se puede ejecutar en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: US1 a US5, según spec.md

## Convenciones de Rutas

Aplicación web existente: `backend/` (Go) y `frontend/` (React + Vite + TS). Todas las rutas son relativas a la raíz del repositorio. Todo endpoint escribe sus respuestas con `*httpx.Responder` y se registra en `backend/internal/server/router.go` con su fila en `router_test.go` (backend/CLAUDE.md). Mensajes de error fijos: nunca el `endpoint`, las claves `p256dh`/`auth` ni el token de acción (FR-019).

---

## Fase 1: Configuración

- [X] T001 Instalar `github.com/SherClockHolmes/webpush-go` en `backend/` (`go get github.com/SherClockHolmes/webpush-go@latest`) y confirmar con `go doc` la firma de `SendNotificationWithContext`, `Options{Subscriber, VAPIDPublicKey, VAPIDPrivateKey, TTL, Urgency}` y `GenerateVAPIDKeys` (research R2)
- [X] T002 [P] Instalar `vite-plugin-pwa` como dependencia de desarrollo en `frontend/` (`npm install -D vite-plugin-pwa`) y confirmar en sus tipos las opciones `strategies: 'injectManifest'`, `srcDir`, `filename`, `manifest: false`, `injectManifest.injectionPoint` y `devOptions` (research R4)
- [X] T003 Línea base: `cd backend && go build ./... && go test ./...` y `cd frontend && npm run build && npx vitest run` en verde antes de empezar
- [X] T004 [P] Agregar a `backend/.env.local` (no versionado) `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:…` y `REMINDER_ACTION_SECRET` generados con `npx web-push generate-vapid-keys` y 32+ caracteres aleatorios (quickstart "Antes de empezar")

---

## Fase 2: Fundamental (Prerrequisitos Bloqueantes)

**Propósito**: esquema, modelo, configuración y service worker que todas las historias usan.

**⚠️ CRÍTICO**: Ninguna historia puede empezar hasta terminar esta fase.

### Backend

- [X] T005 Crear `backend/migrations/0011_create_reminders.sql` según data-model.md: tabla `reminder_devices` (`id UUID PK DEFAULT gen_random_uuid()`, `account_id UUID NOT NULL REFERENCES accounts(id)`, `endpoint TEXT NOT NULL UNIQUE`, `p256dh TEXT NOT NULL`, `auth TEXT NOT NULL`, `active BOOLEAN NOT NULL DEFAULT true`, `activated_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `deactivated_at TIMESTAMPTZ NULL`) con índice `idx_reminder_devices_account_active (account_id) WHERE active`; `ALTER TABLE accounts ADD COLUMN reminder_detail TEXT NULL CHECK (reminder_detail IN ('detailed','generic'))`; `ALTER TABLE doses ADD COLUMN reminder_sent_at TIMESTAMPTZ NULL` e índice `idx_doses_pending_reminder ON doses (scheduled_at) WHERE reminder_sent_at IS NULL AND taken = false`. Aplicarla a la BD local
- [X] T006 [P] Crear `backend/internal/reminder/model.go`: `Device` (ID, AccountID, Endpoint, P256dh, Auth, Active, ActivatedAt), `DetailMode` (`"detailed"`/`"generic"`), `DueDose` (DoseID, ConsultationID, ScheduledAt, MedicationName, ChildFirstName, AccountID, Detail *DetailMode), `Payload` (Kind, DoseID, ConsultationID, ScheduledAt, Medication, Child, ActionToken — `Medication`/`Child` con `omitempty`) y errores `ErrDeviceNotFound`, `ErrRemindersUnavailable`, `ErrInvalidActionToken`
- [X] T007 [P] Crear `backend/internal/reminder/config.go`: `Config{VAPIDPublicKey, VAPIDPrivateKey, VAPIDSubject, ActionSecret string}` con `Available() bool` (las cuatro no vacías) y `ConfigFromEnv()` (research R3: si faltan, recordatorios no disponibles, el backend arranca igual)
- [X] T008 Agregar `ReminderDetail *string` a `Account` en `backend/internal/account/model.go`, leerlo en `GetByID`, `GetByClerkUserID`, `LinkByEmail` y `AddChildIfUnderLimit` de `backend/internal/account/repository.go`, y exponerlo como `reminderDetail` (`"detailed" | "generic" | null`) en `accountResponse`/`toAccountResponse` de `backend/internal/account/handler.go` (contracts: "Respuestas de cuenta")
- [X] T009 [P] Pruebas de T008 en `backend/internal/account/repository_test.go` y `handler_test.go`: `reminderDetail` es `null` en una cuenta nueva y refleja el valor guardado en `GET /accounts/me` y `POST /accounts/{id}/children`
- [X] T010 Crear `backend/internal/reminder/handler.go` con `NewHandler(service, responder, config)` y `GetConfig` (`GET /reminders/config`: `{available, vapidPublicKey}`, contracts) con anotaciones Swagger
- [X] T011 Registrar `GET /reminders/config` en `backend/internal/server/router.go` dentro del grupo con `RequireSession` (agregar `Reminder *reminder.Handler` a `server.Deps`) y su fila en `backend/internal/server/router_test.go` (401 sin sesión)
- [X] T012 En `backend/cmd/api/main.go`: `reminder.ConfigFromEnv()`, construir repositorio/servicio/handler de `reminder` y pasarlos a `server.Deps`; registrar en el log si los recordatorios quedan no disponibles (sin imprimir las claves)
- [X] T013 [P] Prueba de `GetConfig` en `backend/internal/reminder/handler_test.go`: disponible con clave pública; no disponible con `vapidPublicKey: null`

### Frontend

- [X] T014 Configurar `vite-plugin-pwa` en `frontend/vite.config.ts`: `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`, `manifest: false` (se conserva `public/manifest.webmanifest`), `injectManifest: { injectionPoint: undefined }` (sin precaché), `devOptions: { enabled: true, type: 'module' }` (research R4). Conservar los plugins `react()` y `tailwindcss()`
- [X] T015 Crear `frontend/src/sw.ts` (solo el cableado: `self.addEventListener('push' | 'notificationclick', …)` delegando en `features/reminders/notification.ts`) y registrarlo en `frontend/src/main.tsx` con `navigator.serviceWorker.register` solo si existe `serviceWorker`, sin bloquear el arranque; excluir `src/sw.ts` del cálculo de cobertura en `frontend/vitest.config.ts` (la lógica se prueba en `notification.ts`)
- [X] T016 [P] Agregar `reminderDetail: 'detailed' | 'generic' | null` a `Account` en `frontend/src/features/home/types.ts` y actualizar los objetos de cuenta de las pruebas que lo requieran
- [X] T017 [P] Crear `frontend/src/features/reminders/api.ts` con `fetchReminderConfig(token)` (`GET /reminders/config`) y `RemindersApiError extends ApiError<'validation_error' | 'not_found' | 'unavailable' | 'unknown'>` (403/404 → `not_found`, 503 → `unavailable`), usando `withAuthHeader`; pruebas en `api.test.ts`
- [X] T018 [P] Crear `frontend/src/features/reminders/deviceSupport.ts`: `detectDeviceSupport()` → `'unsupported'` (sin `serviceWorker`, `PushManager` o `Notification`), `'ios-needs-install'` (iPhone/iPad y no instalada: `navigator.standalone !== true` y `matchMedia('(display-mode: standalone)')` falso), `'denied'` (`Notification.permission === 'denied'`) o `'ready'` (research R11); pruebas en `deviceSupport.test.ts` con cada caso

**Punto de control**: migración aplicada, cuentas con `reminderDetail`, configuración disponible y service worker registrado.

---

## Fase 3: Historia de Usuario 1 - Recibir el aviso a la hora de cada toma (Prioridad: P1) 🎯 MVP

**Objetivo**: activar en un dispositivo y recibir un aviso por toma a su hora, aunque la app esté cerrada.

**Prueba Independiente**: activar con una toma en pocos minutos, cerrar la app y comprobar un aviso por toma (quickstart, Historia 1).

### Pruebas de la Historia 1

- [X] T019 [P] [US1] `backend/internal/reminder/repository_test.go`: `UpsertDevice` crea y, con el mismo `endpoint`, actualiza claves, reactiva, pone `activated_at = now()` y **cambia de cuenta** si era de otra (research R10); `ClaimDueDoses` devuelve solo tomas con `taken = false`, `reminder_sent_at IS NULL`, `scheduled_at` en `(now()-60min, now()]` y cuenta con un dispositivo activo con `activated_at <= scheduled_at`; una segunda llamada no devuelve las ya reclamadas; dos llamadas concurrentes no reclaman la misma toma; `ActiveDevicesFor(accountID, scheduledAt)` excluye inactivos y posteriores a la toma
- [X] T020 [P] [US1] `backend/internal/reminder/service_test.go` con un `Sender` falso: `Tick` envía un aviso por dispositivo por toma, nunca repite una toma en la siguiente vuelta, no envía tomas marcadas antes de su hora, y un error de un dispositivo no impide los demás
- [X] T021 [P] [US1] `backend/internal/reminder/sender_integration_test.go`: un `httptest.Server` como `endpoint` de un dispositivo con claves generadas en la prueba; tras un `Tick`, el servidor recibe **una** petición con `Content-Encoding: aes128gcm`, `TTL: 3600` y `Urgency: high`, y ninguna en la vuelta siguiente (research R12)
- [X] T022 [P] [US1] `backend/internal/reminder/handler_test.go`: `POST /accounts/{id}/reminder-devices` → 201 al crear y 200 al reactivar el mismo `endpoint`; 400 sin `endpoint`/`keys.p256dh`/`keys.auth`, con JSON mal formado o `endpoint` que no es `https://` (salvo `http://localhost`/`127.0.0.1`); 503 si no hay claves; filas en `backend/internal/server/router_test.go` (401/403/el dueño llega)
- [X] T023 [P] [US1] `frontend/src/features/reminders/notification.test.ts`: `buildNotification(payload)` arma título "Toma programada", `tag: 'dose-<id>'`, hora con `formatTime` en la zona del dispositivo; `targetUrl(payload)` → `/consultations/<consultationId>`; `focusOrOpen` enfoca una ventana existente de la app o abre una nueva
- [X] T024 [P] [US1] `frontend/src/features/reminders/useReminders.test.ts` y `RemindersCard.test.tsx`: activar pide el permiso **solo** al tocar el botón (nunca al montar, FR-002), suscribe con la `vapidPublicKey` de la configuración, registra el dispositivo y queda `on`; permiso rechazado → `denied`; el estado inicial es `on` si ya hay suscripción y permiso

### Implementación de la Historia 1

- [X] T025 [US1] Implementar en `backend/internal/reminder/repository.go`: `UpsertDevice(ctx, accountID, endpoint, p256dh, auth) (device, created bool, err)` con `INSERT … ON CONFLICT (endpoint) DO UPDATE SET account_id, p256dh, auth, active = true, activated_at = now(), deactivated_at = NULL`; `ClaimDueDoses(ctx, now)` con `UPDATE doses SET reminder_sent_at = now() WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING` + los datos de `DueDose` (consulta, medicamento, nombre del hijo, cuenta, `reminder_detail`) según data-model "Toma a avisar"; `ActiveDevicesFor(ctx, accountID, scheduledAt)`
- [X] T026 [US1] Implementar `backend/internal/reminder/sender.go`: interfaz `Sender` con `Send(ctx, Device, []byte) (SendResult, error)` (`SendResult`: `Delivered`, `Gone` para 404/410, `Failed` para 429/5xx/red) y `WebPushSender` con webpush-go (`TTL: 3600`, `Urgency: webpush.UrgencyHigh`, VAPID de `Config`), cerrando siempre el cuerpo de la respuesta
- [X] T027 [US1] Implementar `backend/internal/reminder/service.go`: `Tick(ctx, now)` = reclamar → por toma, armar el `Payload` (`Kind` según `Detail`; **`NULL` se trata como `generic`**, lo más privado, hasta que la US2 agregue la elección) → cifrar/enviar a los dispositivos de `ActiveDevicesFor` en paralelo con un límite de 8 → sin reintentos; y `ActivateDevice`. El `ActionToken` queda vacío hasta la US3
- [X] T028 [US1] Implementar `backend/internal/reminder/scheduler.go`: `Run(ctx, service, interval)` con `time.Ticker` de 30 s que llama a `Tick` y termina con el contexto; errores al log sin datos del dispositivo. Arrancarlo en `backend/cmd/api/main.go` solo si `Config.Available()`, con un contexto que se cancela al recibir `SIGINT`/`SIGTERM` (cambiar `http.ListenAndServe` por un `http.Server` con `Shutdown`)
- [X] T029 [US1] Implementar `RegisterDevice` en `backend/internal/reminder/handler.go` (`POST /accounts/{accountId}/reminder-devices`, contracts) y registrarlo en `backend/internal/server/router.go` con `ownsAccount`
- [X] T030 [P] [US1] Implementar `frontend/src/features/reminders/notification.ts` (`buildNotification`, `targetUrl`, `focusOrOpen`) y conectarlo en `frontend/src/sw.ts` (`push` → `showNotification`; `notificationclick` → cerrar y abrir `targetUrl`)
- [X] T031 [US1] Implementar `registerDevice(accountId, subscription, token)` en `frontend/src/features/reminders/api.ts` y `frontend/src/features/reminders/useReminders.ts` (TanStack Query: configuración, estado `unsupported | ios-needs-install | denied | unavailable | off | on`, `activate()`: `Notification.requestPermission()` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → `registerDevice`)
- [X] T032 [US1] Crear `frontend/src/features/reminders/RemindersCard.tsx` con variantes `phone` y `desktop` según `design-tokens.md` (superficie `hint`, botón de contorno `action` — el sólido sigue siendo el de la pantalla), título "Recordatorios de tomas", estado actual y botón "Activar recordatorios"; mostrarla en `frontend/src/features/home/HomePage.tsx` en ambos diseños, debajo del listado de hijos (y debajo del aviso "Antes de empezar" si está)
- [X] T033 [US1] `frontend/e2e/recordatorios.spec.ts` (Chromium y Firefox, 390 y 1280 px): conceder el permiso de notificaciones con Playwright y sustituir `PushManager.prototype.subscribe` en la página (`addInitScript`) por una suscripción de prueba con `endpoint` `https://push.invalid/…`; activar desde el home y comprobar en `GET /accounts/me`/la base (vía API del backend) que el dispositivo quedó registrado y activo (research R12)

**Punto de control**: con la US1 sola, un padre recibe avisos (en modo genérico) a la hora de cada toma.

---

## Fase 4: Historia de Usuario 2 - Elegir qué muestra el aviso (Prioridad: P1)

**Objetivo**: elección detalle/genérico en la primera activación de la cuenta; cambiarla después.

**Prueba Independiente**: activar por primera vez → elegir; segundo dispositivo sin preguntar; cambiar y ver el texto del siguiente aviso (quickstart, Historia 2).

### Pruebas de la Historia 2

- [X] T034 [P] [US2] `backend/internal/account/handler_test.go` (o `reminder`): `PATCH /accounts/{id}/reminder-settings` con `"detailed"`/`"generic"` → 200 con la cuenta y `reminderDetail` actualizado; otro valor o JSON mal formado → 400; fila en `router_test.go` (401/403/dueño)
- [X] T035 [P] [US2] `backend/internal/reminder/service_test.go`: con `detailed` el contenido lleva `medication` y `child`; con `generic` **no aparecen las claves** en el JSON (SC-005), y el texto nunca contiene imperativos
- [X] T036 [P] [US2] `frontend/src/features/reminders/ReminderDetailDialog.test.tsx` y `useReminders.test.ts`: con `reminderDetail === null` la activación abre la elección con un ejemplo de cada opción y no termina hasta elegir (FR-008); con un valor ya elegido no pregunta; cambiar desde la tarjeta llama a `PATCH`; `notification.test.ts`: cuerpo "Amoxicilina · 8:00 · Mateo" vs "Hay una toma programada · 8:00"

### Implementación de la Historia 2

- [X] T037 [US2] Implementar `UpdateReminderDetail` en `backend/internal/account/repository.go`, `service.go` (solo `"detailed"`/`"generic"`, si no `ValidationErrors`) y el handler `PATCH /accounts/{accountId}/reminder-settings` en `backend/internal/account/handler.go` con Swagger; registrar en `backend/internal/server/router.go` con `ownsAccount`
- [X] T038 [US2] En `backend/internal/reminder/service.go`, armar `Medication`/`Child` solo cuando `Detail == detailed`
- [X] T039 [US2] Crear `frontend/src/features/reminders/ReminderDetailDialog.tsx` (diálogo real: `createPortal`, `role="dialog"`, `aria-modal`, foco inicial, Escape cancela la activación; como la elección va **antes** del permiso, cancelar no deja nada que deshacer) con las dos opciones y un ejemplo de aviso de cada una; integrarlo en `useReminders.activate()` cuando `reminderDetail === null`, y en `RemindersCard` mostrar la opción elegida con "Cambiar"; `updateReminderDetail` en `api.ts` actualiza la caché `['accounts','me']`
- [X] T040 [US2] En `frontend/src/features/reminders/notification.ts`, cuerpo según `kind` (detalle o genérico) y ampliar `frontend/e2e/recordatorios.spec.ts`: la primera activación pide elegir; un segundo contexto de navegador de la misma cuenta no pregunta

**Punto de control**: US1 + US2 cumplen el valor principal con la privacidad elegida por el padre.

---

## Fase 5: Historia de Usuario 3 - Marcar la toma desde el aviso (Prioridad: P2)

**Objetivo**: acción "Tomada" que marca solo esa toma, sin sesión.

**Prueba Independiente**: tocar "Tomada" en un aviso y ver la toma marcada en la app (quickstart, Historia 3).

### Pruebas de la Historia 3

- [X] T041 [P] [US3] `backend/internal/reminder/actiontoken_test.go`: firma y verifica `(doseID, deviceID, vence)`; rechaza firma alterada, vencido (24 h), formato inválido y otro secreto
- [X] T042 [P] [US3] `backend/internal/reminder/handler_test.go`: `POST /reminders/actions/taken` → 204 y la toma queda `taken = true` (idempotente); 403 `invalid_action_token` (mismo mensaje) con token inválido, vencido, dispositivo inactivo o de otra cuenta; 400 sin token; en `router_test.go`, la ruta es pública (sin 401) y no expone datos
- [X] T043 [P] [US3] `frontend/src/features/reminders/notification.test.ts`: el aviso trae la acción `taken` ("Tomada") solo si hay `actionToken`; `notificationclick` con `action === 'taken'` hace `POST` con el token y cierra el aviso; si falla, muestra un aviso "No se pudo marcar la toma. Ábrela en la app."

### Implementación de la Historia 3

- [X] T044 [US3] Implementar `backend/internal/reminder/actiontoken.go` (HMAC-SHA256 con `Config.ActionSecret`, base64url, vence 24 h, comparación en tiempo constante) y firmar el `ActionToken` por dispositivo en `Service.Tick`
- [X] T045 [US3] Implementar `MarkTakenByAction(ctx, doseID, deviceID)` en `backend/internal/reminder/repository.go`: un solo `UPDATE doses SET taken = true` que exige que el dispositivo esté activo y que su `account_id` sea la cuenta dueña de la toma (dosis → medicamento → consulta → hijo → cuenta); 0 filas → `ErrInvalidActionToken`
- [X] T046 [US3] Implementar el handler público `POST /reminders/actions/taken` en `backend/internal/reminder/handler.go` (Swagger) y registrarlo en `backend/internal/server/router.go` **fuera** del grupo con sesión
- [X] T047 [US3] En `frontend/src/features/reminders/notification.ts` y `frontend/src/sw.ts`: `actions: [{ action: 'taken', title: 'Tomada' }]` cuando hay token, y el manejo de la acción (T043); la URL del backend sale de `import.meta.env.VITE_API_BASE_URL` como en los demás `api.ts`

**Punto de control**: "Tomada" funciona donde hay botones; donde no, tocar el aviso sigue abriendo la consulta.

---

## Fase 6: Historia de Usuario 4 - Desactivar y administrar los dispositivos (Prioridad: P2)

**Objetivo**: desactivar, dejar de avisar al cerrar sesión y soltar dispositivos que ya no sirven.

**Prueba Independiente**: desactivar en un dispositivo y seguir recibiendo en otro (quickstart, Historia 4).

### Pruebas de la Historia 4

- [X] T048 [P] [US4] `backend/internal/reminder/handler_test.go` y `repository_test.go`: `POST /accounts/{id}/reminder-devices/remove` → 204 y el dispositivo queda `active = false` con `deactivated_at`; idempotente; un `endpoint` de otra cuenta → 204 sin tocar esa fila; 400 sin `endpoint`; fila en `router_test.go`
- [X] T049 [P] [US4] `backend/internal/reminder/service_test.go` y `sender_integration_test.go`: respuesta 404/410 del servicio de avisos → el dispositivo queda inactivo y los demás siguen; 429/5xx/error de red → sigue activo y la toma no se reintenta
- [X] T050 [P] [US4] `frontend/src/features/reminders/useReminders.test.ts` y `frontend/src/features/auth/useLogout.test.ts`: "Desactivar recordatorios" quita la suscripción del navegador y llama a `remove`; cerrar sesión hace lo mismo antes de `signOut` y no espera más de 3 s si el backend no responde

### Implementación de la Historia 4

- [X] T051 [US4] Implementar `DeactivateDevice(ctx, accountID, endpoint)` y `DeactivateByID(ctx, deviceID)` en `backend/internal/reminder/repository.go`; en `Service.Tick`, `SendResult.Gone` → `DeactivateByID`
- [X] T052 [US4] Implementar el handler `POST /accounts/{accountId}/reminder-devices/remove` en `backend/internal/reminder/handler.go` (Swagger) y registrarlo en `backend/internal/server/router.go` con `ownsAccount`
- [X] T053 [US4] `removeDevice` en `frontend/src/features/reminders/api.ts`; `deactivate()` en `useReminders.ts` (`subscription.unsubscribe()` + `removeDevice`) y el botón "Desactivar recordatorios" en `RemindersCard.tsx`; en `frontend/src/features/auth/useLogout.ts`, antes de `signOut`, quitar la suscripción del navegador y avisar al backend con un tope de 3 s (errores ignorados: el 404/410 del siguiente envío la desactiva igual)
- [X] T054 [US4] Ampliar `frontend/e2e/recordatorios.spec.ts`: desactivar y cerrar sesión dejan el dispositivo inactivo en el backend

**Punto de control**: el padre controla dónde recibe avisos.

---

## Fase 7: Historia de Usuario 5 - Saber qué esperar de los recordatorios (Prioridad: P3)

**Objetivo**: mensajes claros según el dispositivo y el aviso de "es una ayuda".

**Prueba Independiente**: abrir la opción en iPhone sin instalar, con permiso negado y en un navegador sin soporte (quickstart, Historia 5).

- [X] T055 [P] [US5] `frontend/src/features/reminders/RemindersCard.test.tsx`: el texto "Los recordatorios son una ayuda, no una alarma garantizada: pueden llegar tarde o no llegar si el dispositivo está apagado, sin conexión o con el navegador cerrado. Sigue siempre las indicaciones de tu médico." está en todos los estados; `ios-needs-install` explica cómo agregar la app a la pantalla de inicio (Compartir → Agregar a inicio) sin botón de activar; `denied` explica cómo volver a permitirlo desde la configuración del navegador; `unsupported` y `unavailable` dicen que no se pueden recibir en este navegador / por ahora
- [X] T056 [US5] Implementar esos estados y textos en `frontend/src/features/reminders/RemindersCard.tsx` (ambos diseños)
- [X] T057 [US5] Ampliar `frontend/e2e/recordatorios.spec.ts`: en WebKit (sin `PushManager` en Playwright) se ve el mensaje de navegador sin soporte y no hay botón de activar

---

## Fase Final: Pulido y Aspectos Transversales

- [X] T058 Generar Swagger (`swag init -g cmd/api/main.go -o internal/docs --pd` desde `backend/`) y confirmar que todos los endpoints nuevos tienen `@Summary/@Param/@Success/@Failure/@Router`
- [X] T059 En `.github/workflows/ci.yml`: generar claves VAPID de prueba y un `REMINDER_ACTION_SECRET` al inicio del job de E2E (`npx web-push generate-vapid-keys --json`) y pasarlos al paso que arranca el backend; aplicar la migración 0011 (ya lo cubre el bucle de migraciones)
- [X] T060 [P] Actualizar `CLAUDE.md` (spec 011 implementada, PR), `backend/CLAUDE.md` (`internal/reminder`, migración `0011`, variables de entorno, "el backend debe correr siempre") y `frontend/CLAUDE.md` (`features/reminders/`, service worker, `vite-plugin-pwa`, recordatorios en el home y en `useLogout`)
- [X] T061 [P] En `BACKLOG.md`, sección "Despliegue": los recordatorios exigen un backend que no se duerma y HTTPS para el frontend
- [X] T062 Cobertura >90% en backend (`go test ./internal/... -coverprofile`) y frontend (`npx vitest run --coverage`) — Principio VI
- [X] T063 Revisar `error_logs` y el log del backend tras las pruebas: ningún `endpoint`, `p256dh`, `auth`, token de acción ni texto de aviso (FR-019, Principio II)
- [X] T064 Mostrar al usuario capturas de la tarjeta de recordatorios y de la elección de texto a 390 y 1280 px (no hay mock; diseño con `design-tokens.md`) y ajustar lo que pida
- [X] T065 Ejecutar a mano `quickstart.md` con un dispositivo real (Android o iPhone con la app instalada y un túnel HTTPS) — requiere al usuario
  - Resultado (2026-09-28): iPhone con la app instalada en la pantalla de inicio, por un túnel HTTPS a la PC (DEPLOY.md). Dispositivo registrado en web.push.apple.com, modo "Mostrar detalle"; la toma de las 12:20 se reclamó a las 12:20:21 y el aviso llegó al teléfono (confirmado por el usuario). Falta repetirla en Android y en un navegador de escritorio.
- [X] T066 E2E completo en los tres navegadores (`npx playwright test`) y PR de `feature/011-recordatorios-push` a `develop`

---

## Dependencias y Orden de Ejecución

### Dependencias entre Fases

- **Configuración (Fase 1)**: sin dependencias.
- **Fundamental (Fase 2)**: depende de la Fase 1; bloquea todas las historias.
- **US1 (Fase 3)**: depende de la Fase 2. Es el MVP.
- **US2 (Fase 4)**: depende de la US1 (usa `activate()` y el contenido del aviso).
- **US3 (Fase 5)**: depende de la US1 (el aviso y el `Tick`); independiente de US2 y US4.
- **US4 (Fase 6)**: depende de la US1 (hay que poder activar para desactivar); independiente de US2 y US3.
- **US5 (Fase 7)**: depende solo de la Fase 2 (`deviceSupport`) y de la tarjeta de la US1.
- **Pulido**: al final.

### Dentro de cada historia

Pruebas primero (deben fallar), luego repositorio → servicio → handler/rutas → frontend → E2E.

### Oportunidades de Paralelización

- Fase 1: T002 y T004 en paralelo a T001.
- Fase 2: T006, T007, T009, T013, T016, T017 y T018 en paralelo (archivos distintos).
- Con la US1 terminada, US3, US4 y US5 pueden avanzar en paralelo (backend `reminder` en archivos distintos: `actiontoken.go`, handlers separados; frontend: `notification.ts` vs `useReminders`/`useLogout` vs `RemindersCard`).

---

## Ejemplo de Paralelización: Historia de Usuario 1

```bash
# Pruebas de la US1 a la vez (archivos distintos):
Tarea: "T019 repository_test.go"
Tarea: "T020 service_test.go con Sender falso"
Tarea: "T021 sender_integration_test.go con httptest"
Tarea: "T023 notification.test.ts"
Tarea: "T024 useReminders.test.ts + RemindersCard.test.tsx"
```

---

## Estrategia de Implementación

### MVP primero (solo US1)

1. Fases 1 y 2.
2. Fase 3 (US1): avisos a la hora de cada toma, en modo genérico (el más privado) mientras no exista la elección.
3. **Parar y validar**: quickstart Historia 1 con un dispositivo real.

### Entrega incremental

1. US1 → avisos funcionando (MVP).
2. US2 → el padre elige el texto (completa el valor P1; con esto ya se puede abrir el PR si se quiere entregar en dos partes).
3. US3 → "Tomada" desde el aviso.
4. US4 → desactivar / cerrar sesión / dispositivos caducados.
5. US5 → mensajes por dispositivo.
6. Pulido y PR.

---

## Notas

- [P] = archivos distintos, sin dependencias.
- Commit tras cada tarea o grupo lógico; mensajes en español (constitución).
- Nunca registrar `endpoint`, claves ni token de acción en logs, `error_logs` ni mensajes de error.
- Correr las E2E completas con moderación: comparten el límite de peticiones de la instancia de desarrollo de Clerk con CI (frontend/CLAUDE.md, "E2E con Clerk").
