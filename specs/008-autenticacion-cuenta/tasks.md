---

description: "Lista de tareas de implementación: Autenticación real de cuenta (login)"
---

# Tareas: Autenticación real de cuenta (login)

**Entrada**: Documentos de diseño desde `/specs/008-autenticacion-cuenta/`

**Prerrequisitos**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Pruebas**: Incluidas — Principio VI de la constitución (cobertura >90% NO NEGOCIABLE) exige pruebas para todo código nuevo o tocado, y **login es uno de los 4 flujos críticos nombrados explícitamente en el texto de ese mismo principio** para Playwright E2E.

**Organización**: Las tareas se agrupan por historia de usuario para permitir la implementación y prueba independiente de cada historia.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: Se puede ejecutar en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: US1, US2, US3, US4 o US5, según spec.md

## Convenciones de Rutas

Aplicación web existente: `backend/` (Go) y `frontend/` (React + Vite + TS). Todas las rutas de archivo son relativas a la raíz del repositorio.

---

## Fase 1: Configuración

- [X] T001 Instalar `github.com/clerk/clerk-sdk-go/v2` en `backend/` (`go get github.com/clerk/clerk-sdk-go/v2`) — fijar la versión mayor exacta según research.md punto 2 (confirmar en `go.mod` si es `v2` o si conviene `v3`, y usar esa misma en toda la feature) — instalado `v2.7.0`, confirmado con `go doc` como la API descrita en research.md
- [X] T002 Instalar `@clerk/react` en `frontend/` (`npm install @clerk/react@latest`) — el paquete correcto tras la renombración de Clerk Core 3 (marzo 2026) es `@clerk/react`, no `@clerk/clerk-react` (deprecado); instalado `v6.16.1`, confirmado con los `.d.mts` del paquete
- [X] T003 Verificar que `backend/` y `frontend/` compilan/buildean limpio antes de empezar (`cd backend && go build ./...`, `cd frontend && npm run build`), como línea base

**Nota**: crear la aplicación de Clerk (instancia de Desarrollo) y obtener `CLERK_SECRET_KEY`/`VITE_CLERK_PUBLISHABLE_KEY` es un paso manual del usuario en clerk.com — ver quickstart.md "Antes de empezar". No es una tarea de este repositorio.

---

## Fase 2: Fundamental (Prerrequisitos Bloqueantes)

**Propósito**: Reemplaza la base de sesión de toda la app (el `account_id`-en-`localStorage`) por la sesión real de Clerk — sin esto, ninguna historia de usuario es comprobable, y las pantallas ya existentes (home, sidebar, detalle de hijo) se quedan sin forma de saber qué cuenta mostrar.

**⚠️ CRÍTICO**: No puede comenzar el trabajo de ninguna historia de usuario hasta que esta fase esté completa.

### Backend

- [X] T004 Crear la migración `backend/migrations/0009_add_clerk_user_id_to_accounts.sql`: `ALTER TABLE accounts ADD COLUMN clerk_user_id TEXT UNIQUE;` (data-model.md) — nullable, sin `DEFAULT`, sin backfill — aplicada a la BD local de desarrollo
- [X] T005 [P] Agregar el campo `ClerkUserID *string` al struct `Account` en `backend/internal/account/model.go` (data-model.md)
- [X] T006 [P] Agregar `ErrAccountAccessDenied` y `ErrNoAccountForSession` a `backend/internal/account/errors.go` (data-model.md) — también `ErrAccountAlreadyLinked`, necesario para la idempotencia de T023/T024
- [X] T007 Crear `backend/internal/authmw/middleware.go`: `RequireSession` — envoltura sobre `clerkhttp.RequireHeaderAuthorization()` (paquete `github.com/clerk/clerk-sdk-go/v2/http`) que se usa como middleware de `chi` sobre un grupo de rutas; expone un helper `ClerkUserIDFromContext(ctx) (string, bool)` que lee `clerk.SessionClaimsFromContext(ctx)` y devuelve `claims.Subject` (research.md, punto 2)
- [X] T008 En `backend/cmd/api/main.go`: llamar `clerk.SetKey(os.Getenv("CLERK_SECRET_KEY"))` al arrancar, fallando rápido (`log.Fatalf`) si la variable está vacía — mismo patrón que `DATABASE_URL`; agregar `"Authorization"` a `cors.Options.AllowedHeaders` (research.md, punto 7)
- [X] T009 Implementar `GetAccountByClerkUserID(ctx, clerkUserID string) (*Account, error)` en `backend/internal/account/repository.go` y `backend/internal/account/service.go` — devuelve `ErrAccountNotFound` si no hay ninguna fila con ese `clerk_user_id` (el caso simple; la Historia 5 agrega el resto de la lógica de resolución en su propia fase, T029-T031)
- [X] T010 Implementar el handler `GetMe` (`GET /accounts/me`) en `backend/internal/account/handler.go` usando `*httpx.Responder`: lee el `clerk_user_id` del contexto (T007), llama a `GetAccountByClerkUserID` (T009); `200` con el `accountResponse` si existe, `404 account_not_found_for_session` si no (contracts/get-accounts-me.md — la rama de vinculación por correo se agrega en T031)
- [X] T011 Registrar `GET /accounts/me` en `backend/cmd/api/main.go`, dentro de un `r.Group` que aplica `authmw.RequireSession` — colocarla **antes** de `GET /accounts/{accountId}` en el árbol de rutas de chi para que `me` no se interprete como un `accountId` literal

### Frontend

- [X] T012 [P] Envolver `<App />` con `<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>` en `frontend/src/main.tsx`
- [X] T013 [P] Crear `frontend/src/shared/auth/withAuthHeader.ts`: helper `withAuthHeader(token: string | null): HeadersInit` que arma `{ Authorization: \`Bearer ${token}\` }` (vacío si `token` es `null`) — usado por los 3 `api.ts` existentes (T021, T033, T041)
- [X] T014 Crear `frontend/src/features/auth/api.ts`: `fetchMe(token: string | null): Promise<Account>` (`GET /accounts/me` con `withAuthHeader`), `AccountApiError` reutilizando `shared/apiError.ts`, mapeando `404` a un tipo `not_found_for_session` distinguible
- [X] T015 Crear `frontend/src/features/auth/useCurrentAccount.ts`: `useQuery(['accounts', 'me'], () => fetchMe(await getToken()))` usando `useAuth()` de `@clerk/react`, habilitado solo cuando `useAuth().isSignedIn` es verdadero; reemplaza a `useAccountSession` como la única fuente de "cuál es mi cuenta"
- [X] T016 Eliminar `frontend/src/features/home/useAccountSession.ts` y su test — ya no queda ningún `accountId` guardado sin verificar (research.md, punto 4)
- [X] T017 Reescribir `frontend/src/features/home/useSidebarSession.ts` para leer `useCurrentAccount()` (T015) en vez de `useAccountSession().getAccountId()` — mismo shape de retorno (`{ accountId, hasSidebar, isDesktop }`), `accountId` ahora viene de `data?.id` de la query
- [X] T018 Crear `frontend/src/features/auth/RequireSession.tsx`: componente que envuelve una ruta — si `useAuth().isSignedIn` es falso, `<Navigate to="/login" replace />`; si es verdadero pero `useCurrentAccount()` todavía no resuelve, muestra un estado de carga
- [X] T019 En `frontend/src/App.tsx`: envolver las rutas `/home`, `/children/:childId`, `/children/:childId/consultations/new` y `/consultations/:consultationId` con `RequireSession` (T018); agregar las rutas `/login` y `/sso-callback` (placeholders hasta la Fase 3/4)

**Nota de implementación (no estaba en el desglose original, necesaria para no romper la suite existente)**: `ChildDetailPage.tsx` y `ConsultationDetailPage.tsx` tenían su propia consulta duplicada a `fetchAccount(accountId!)` (`GET /accounts/{accountId}`) para resolver el nombre del hijo — redundante con lo que `useSidebarSession`/`useCurrentAccount` ya cargan vía `GET /accounts/me`. Se simplificaron para reutilizar `useCurrentAccount()` directamente (una sola fuente de la cuenta, no dos). `useSignupForm.ts` y `HomePage.tsx` (`AddChildDialogs`) se ajustaron mínimamente para compilar sin `useAccountSession` — su reescritura completa para Clerk es T026. Se agregó un mock global de `@clerk/react` en `frontend/src/setupTests.ts` (sesión "iniciada" por defecto) para que la suite existente no tuviera que instrumentar `<ClerkProvider>` una por una; los tests que sí necesitan un estado de auth específico lo sobrescriben con su propio `vi.mock`.

**Punto de Control**: La app compila y arranca; cualquier ruta con sesión redirige a `/login` si no hay sesión de Clerk activa. Ninguna historia de usuario es demostrable todavía (no hay ni login ni registro reales), pero la base ya no depende de `localStorage`.

---

## Fase 3: Historia de Usuario 1 - Registrarse con una identidad real (Prioridad: P1) 🎯 MVP

**Objetivo**: El formulario de registro (specs/001/007) crea la cuenta también en Clerk — con contraseña o con Google — y `POST /accounts` pasa a exigir esa sesión.

**Prueba Independiente**: Registrar una cuenta nueva con correo+contraseña (y por separado con Google) y verificar que puede usarse para iniciar sesión después (Historia 2), sin que la contraseña quede en ningún log/tabla de PediTrack.

### Pruebas para la Historia de Usuario 1 ⚠️

> Escribir estas pruebas PRIMERO, asegurarse de que FALLEN antes de implementar.

- [X] T020 [P] [US1] Prueba de handler para `POST /accounts` en `backend/internal/account/handler_test.go`: `401` sin token, `201` con token válido y sin `email` en el body (el correo viene del *fake* de Clerk usado en el test), `200` (no `201`) en un segundo `POST` con el mismo token/sesión ya vinculada (contracts/post-accounts.md, idempotencia) — el *fake* de Clerk terminó siendo un paquete propio, `internal/authmw/authmwtest` (JWT real firmado con una llave generada en la prueba + `clerk.SetBackend` para `user.Get`), no un mock superficial
- [ ] T021 [P] [US1] Prueba unitaria de `useSignupForm` en `frontend/src/features/account-signup/useSignupForm.test.ts` (o el archivo de test ya existente que la cubre), mockeando `@clerk/react`: el envío llama primero a `signUp.password(...)`/`signUp.finalize()` y solo después a `createAccount` con el token resultante; un fallo de Clerk (p. ej. correo ya usado en Clerk) muestra su propio mensaje sin llamar a `createAccount`

### Implementación de la Historia de Usuario 1

- [X] T022 [US1] En `backend/internal/account/handler.go`: quitar `Email` de `createAccountRequest`; `CreateAccount` ahora requiere sesión (vía `authmw.RequireSession`, aplicado en el registro de ruta de T027) y toma el correo llamando a la Backend API de Clerk (`user.Get(ctx, clerkUserID)` del paquete `github.com/clerk/clerk-sdk-go/v2/user`, leyendo `EmailAddresses` por `PrimaryEmailAddressID` — research.md, punto 2) en vez de leerlo del body
- [X] T023 [US1] En `backend/internal/account/service.go`: `CreateAccountInput` gana `ClerkUserID string` (obligatorio); antes de insertar, si `GetAccountByClerkUserID` (T009) ya encuentra una cuenta para esa sesión, `CreateAccount` la devuelve tal cual en vez de intentar un insert duplicado (contracts/post-accounts.md, caso doble-envío)
- [X] T024 [US1] Ajustar `backend/internal/account/handler.go`'s `writeCreateAccountError`/`toAccountResponse` y el handler `CreateAccount` para devolver `200` (no `201`) cuando el resultado de T023 fue "ya existía" — usar el código de estado que corresponda según si `Service.CreateAccount` señaliza ese caso (p. ej. un segundo valor de retorno o un error sentinel `ErrAccountAlreadyLinked` que el handler traduce a `200` en vez de tratarlo como error)
- [ ] T025 [P] [US1] En `frontend/src/features/account-signup/api.ts`: quitar `email` de `CreateAccountPayload`; `createAccount(payload, token)` ahora manda `withAuthHeader(token)` (T013) además de `Content-Type`
- [ ] T026 [US1] Reescribir `frontend/src/features/account-signup/useSignupForm.ts`: en `onSubmit`, primero `signUp.password({ emailAddress: values.email, password: values.password })` → `signUp.verifications.sendEmailCode()` → (paso de código, ver T028 para la UI) → `signUp.verifications.verifyEmailCode({ code })` → `signUp.finalize({ navigate })`; al completarse, llama `signup.mutate(toPayload(values), await getToken())` (T025) y solo entonces navega a `/home` (ya no depende de `useAccountSession`, T016)
- [X] T027 [US1] Registrar `POST /accounts` en `backend/cmd/api/main.go` dentro del mismo `r.Group` con `authmw.RequireSession` que `GET /accounts/me` (T011)
- [ ] T028 [US1] Agregar el paso de código de verificación de correo al formulario de registro (`SignupWeb.tsx`/`SignupPhone.tsx` o un componente compartido nuevo): un campo para el código que Clerk manda por correo, visible solo entre `sendEmailCode()` y `verifyEmailCode()` — sin mock que lo cubra (spec 007 no lo previó), seguir `design-tokens.md`
- [ ] T029 [US1] Implementar `GoogleSignupButton.tsx`: quitar el aviso "disponible pronto"; el click llama `signIn.sso({ strategy: 'oauth_google', redirectCallbackUrl: '/sso-callback', redirectUrl: '/home' })` (research.md, punto 1 — `redirectCallbackUrl` es la ruta intermedia que procesa el resultado, `redirectUrl` el destino final si no hace falta ningún paso extra)
- [ ] T030 [US1] Crear `frontend/src/features/auth/SsoCallbackPage.tsx` (ruta `/sso-callback`, reemplaza el placeholder de T019): si `signIn.status === 'complete'` (ya existía) → `signIn.finalize()` → navega a `/home`; si `signUp.isTransferable` (alta nueva) → `signUp.finalize()` → navega a `/registro/completar`; si `signIn.existingSession`/`signUp.existingSession` (ya había sesión activa) → `clerk.setActive()` en vez de `finalize()`
- [ ] T031 [US1] Crear `/registro/completar` (`frontend/src/features/account-signup/CompleteGoogleSignupPage.tsx` + ruta en `App.tsx`): reutiliza los campos de tutor/hijo del registro normal (sin correo/contraseña, ya los dio Google) y llama al mismo `POST /accounts` (T022-T027) con el token de la sesión de Google ya activa

**Punto de Control**: Un tutor nuevo puede registrarse con contraseña o con Google; su contraseña nunca llega al backend de PediTrack; `POST /accounts` exige sesión — MVP alcanzado.

---

## Fase 4: Historia de Usuario 2 - Iniciar sesión (Prioridad: P1)

**Objetivo**: Pantalla de login nueva — un tutor ya registrado entra con correo+contraseña o Google desde cualquier dispositivo y llega a `/home` con sus propios datos.

**Prueba Independiente**: Con una cuenta ya creada (Historia 1), abrir la app en un navegador limpio, iniciar sesión, y verificar que aparecen los hijos correctos de esa cuenta.

### Pruebas para la Historia de Usuario 2 ⚠️

- [ ] T032 [P] [US2] Prueba de handler para `GET /accounts/me` en `backend/internal/account/handler_test.go`: `401` sin token, `200` con el cuerpo de la cuenta cuando `clerk_user_id` ya está vinculado, `404 account_not_found_for_session` con una sesión de Clerk válida sin ninguna cuenta vinculada ni por correo (contracts/get-accounts-me.md)
- [ ] T033 [P] [US2] Prueba unitaria de `useLoginForm`/`LoginPage` en `frontend/src/features/auth/LoginPage.test.tsx`, mockeando `@clerk/react`: contraseña correcta navega a `/home`; contraseña incorrecta muestra un error genérico sin decir si el correo existe (FR-009); un tutor con `isSignedIn` ya verdadero al montar la pantalla es redirigido directo a `/home` (Escenario de Aceptación 4 de la Historia 2 de spec.md, a la inversa)

### Implementación de la Historia de Usuario 2

- [ ] T034 [US2] Crear `frontend/src/features/auth/useLoginForm.ts`: `signIn.password({ identifier: email, password })` → `signIn.finalize({ navigate })`; en éxito, invalida/refetch de `['accounts', 'me']` (T015) y navega a `/home`; en error, mensaje único para credencial inválida (FR-009 — nunca distinguir "correo no existe" de "contraseña incorrecta")
- [ ] T035 [US2] Crear `frontend/src/features/auth/LoginPage.tsx`: campos correo/contraseña + el mismo botón de Google que el registro (reutilizar `GoogleSignupButton`-style, apuntando a `signIn.sso(...)` en vez de alta — puede ser el mismo componente con una prop `mode: 'login' | 'signup'` si el texto del botón cambia), diseño propio con `useIsDesktop` (sin mock, seguir `design-tokens.md` — frontend/CLAUDE.md)
- [ ] T036 [US2] Reemplazar el placeholder de `/login` en `frontend/src/App.tsx` (T019) por `LoginPage` (T035)
- [ ] T037 [US2] Ajustar `SsoCallbackPage` (T030) para el caso de login (ya cubierto por su rama `signIn.status === 'complete'`) — confirmar con una prueba que ese camino navega a `/home` sin pasar por `/registro/completar`

**Punto de Control**: Un tutor con cuenta ya creada puede volver a entrar desde cualquier navegador, con contraseña o Google — las Historias 1 y 2 funcionan juntas de punta a punta.

---

## Fase 5: Historia de Usuario 3 - Cada cuenta protege sus propios datos (Prioridad: P1)

**Objetivo**: `GET /accounts/{accountId}`, `POST /accounts/{accountId}/children` y los 5 endpoints de `internal/consultation` rechazan cualquier acceso que no sea de la cuenta dueña.

**Prueba Independiente**: Con dos cuentas ya creadas (A y B), usar el token de A contra cada uno de los 7 endpoints con el id de B en la ruta — los 7 deben responder `403` sin exponer ni modificar ningún dato de B.

### Pruebas para la Historia de Usuario 3 ⚠️

- [ ] T038 [P] [US3] Prueba de servicio para `AuthorizeAccountAccess(ctx, clerkUserID, accountID)` en `backend/internal/account/service_test.go`: devuelve la cuenta si coincide, `ErrAccountAccessDenied` si la sesión tiene otra cuenta vinculada, `ErrAccountAccessDenied` si la sesión no tiene ninguna cuenta vinculada todavía
- [ ] T039 [P] [US3] Prueba de handler para `GET /accounts/{accountId}` y `POST /accounts/{accountId}/children` en `backend/internal/account/handler_test.go`: `401` sin token, `403` con el token de otra cuenta, `200`/`201` con el token correcto (contracts/get-account.md, contracts/post-account-children.md)
- [ ] T040 [P] [US3] Prueba de servicio/repositorio para el helper de dueño cruzado (T042) en `backend/internal/account/service_test.go`: `ChildBelongsToAccount(ctx, childID, accountID)` verdadero/falso según corresponda
- [ ] T041 [P] [US3] Prueba de handler para los 5 endpoints de `internal/consultation` en `backend/internal/consultation/handler_test.go`: `401` sin token, `403` cuando el `childId`/`consultationId` pertenece a otra cuenta, comportamiento sin cambios (200/201/404) con el token correcto (contracts/consultation-endpoints-auth.md)

### Implementación de la Historia de Usuario 3

- [ ] T042 [US3] Implementar `AuthorizeAccountAccess(ctx, clerkUserID string, accountID uuid.UUID) (*Account, error)` en `backend/internal/account/service.go` (usa `GetAccountByClerkUserID`, T009) y `ChildBelongsToAccount(ctx, childID, accountID uuid.UUID) (bool, error)` en `backend/internal/account/repository.go`+`service.go` (data-model.md, `ErrAccountAccessDenied`)
- [ ] T043 [US3] Aplicar `AuthorizeAccountAccess` al inicio de `GetAccount` y `AddChild` en `backend/internal/account/handler.go`, mapeando `ErrAccountAccessDenied` a `403 { "error": "forbidden", ... }` (contracts/get-account.md, contracts/post-account-children.md) — antes de cualquier otra validación
- [ ] T044 [US3] En cada uno de los 5 handlers de `backend/internal/consultation/handler.go` (`ListConsultations`, `GetChildOverview`, `CreateConsultation`, `GetConsultation`, `UpdateDose`): resolver el `childId` en juego (directo, o vía `consultationId`/`doseId` → su consulta → su `childId`), llamar a `account.Service.ChildBelongsToAccount` (T042, nueva dependencia de `consultation` hacia `account` — contracts/consultation-endpoints-auth.md) usando la cuenta de `AuthorizeAccountAccess`-equivalente para la sesión, y responder `403` antes de cualquier otra lógica del handler si no coincide
- [ ] T045 [US3] Envolver `/accounts/{accountId}`, `/accounts/{accountId}/children` y los 5 endpoints de `internal/consultation` con `authmw.RequireSession` en `backend/cmd/api/main.go` (mismo `r.Group` de T027)
- [ ] T046 [US3] En `frontend/src/features/home/api.ts`: `addChild(accountId, payload, token)` gana el parámetro `token` (`withAuthHeader`, T013); eliminar `fetchAccount` si ya no queda ningún llamador tras el cutover a `useCurrentAccount` (T015) — confirmar con una búsqueda de usos antes de borrarla
- [ ] T047 [P] [US3] En `frontend/src/features/consultations/api.ts`: los 5 `fetch*`/`create*`/`update*` ganan el parámetro `token`; cada hook que los llama (`useQuery`/`useMutation` en `ChildDetailPage.tsx`, `NewConsultationPage.tsx`, `ConsultationDetailPage.tsx`, `useDoseToggle.ts`, `useMarkAllDoses.ts`) obtiene el token con `useAuth().getToken()` antes de llamarlos

**Punto de Control**: Ninguna cuenta puede leer ni modificar los datos de otra — Historias 1, 2 y 3 (todas P1) funcionan juntas; esto cierra la brecha de privacidad que motivó la feature completa.

---

## Fase 6: Historia de Usuario 4 - Cerrar sesión (Prioridad: P2)

**Objetivo**: Un tutor cierra sesión desde la app y, después, el mismo dispositivo no muestra ningún dato suyo sin volver a iniciar sesión.

**Prueba Independiente**: Con una sesión activa, cerrar sesión desde la UI y verificar que la siguiente carga de la app pide login y no muestra ningún dato de la cuenta anterior.

### Pruebas para la Historia de Usuario 4 ⚠️

- [ ] T048 [P] [US4] Prueba unitaria de `HomePage` en `frontend/src/features/home/HomePage.test.tsx`: el botón "Cerrar sesión" llama `useAuth().signOut()`; tras cerrar sesión, `RequireSession` (T018) redirige `/home` a `/login`

### Implementación de la Historia de Usuario 4

- [ ] T049 [US4] Agregar el botón/menú "Cerrar sesión" a `frontend/src/features/home/HomePage.tsx` (phone y desktop — sin mock, seguir `design-tokens.md`) que llama `useAuth().signOut()` y limpia la caché de TanStack Query (`queryClient.clear()` o invalidar `['accounts', 'me']`) para que ningún dato de la cuenta anterior sobreviva en memoria
- [ ] T050 [US4] Repetir el botón de T049 en `frontend/src/features/home/ChildrenSidebar.tsx` (barra lateral de escritorio, junto a los datos del tutor)

**Punto de Control**: Cerrar sesión limpia de verdad el acceso — las 4 historias P1/P2 funcionan juntas.

---

## Fase 7: Historia de Usuario 5 - Primer acceso de una cuenta migrada (Prioridad: P3)

**Objetivo**: Una cuenta creada antes de esta feature (sin `clerk_user_id`) se vincula automáticamente la primera vez que su tutor entra por Clerk con el mismo correo.

**Prueba Independiente**: Tomar una cuenta con `clerk_user_id IS NULL` y al menos un hijo, completar el primer acceso con ese mismo correo, e iniciar sesión de nuevo — debe seguir viendo a los mismos hijos, sin ninguna cuenta duplicada.

### Pruebas para la Historia de Usuario 5 ⚠️

- [ ] T051 [P] [US5] Prueba de servicio para `GetAccountByClerkUserID` en `backend/internal/account/service_test.go`, extendiendo T009: con una cuenta existente `clerk_user_id IS NULL` y el mismo correo verificado que el de la sesión, la vincula (`UPDATE`) y la devuelve, en vez de `ErrAccountNotFound`; con un correo que no coincide con ninguna cuenta sin vincular, sigue devolviendo `ErrAccountNotFound`
- [ ] T052 [P] [US5] Prueba de handler para `GET /accounts/me` en `backend/internal/account/handler_test.go`, extendiendo T032: cubre el camino de vinculación de T051 devolviendo `200` con la cuenta ya vinculada

### Implementación de la Historia de Usuario 5

- [ ] T053 [US5] Extender `GetAccountByClerkUserID` (T009) en `backend/internal/account/repository.go`/`service.go`: si no hay ninguna cuenta con ese `clerk_user_id`, buscar una cuenta con `email` igual al correo verificado de la sesión (mismo mecanismo de T022, `user.Get`) y `clerk_user_id IS NULL`; si existe, `UPDATE accounts SET clerk_user_id = $1 WHERE id = $2` y devolverla; si no, `ErrAccountNotFound` (data-model.md, contracts/get-accounts-me.md)
- [ ] T054 [US5] Confirmar en `frontend/src/features/auth/LoginPage.tsx` (T035) que el flujo de login normal (correo+contraseña o Google) ya cubre este caso sin ninguna pantalla/paso extra — Clerk no distingue "alta nueva" de "primer acceso migrado" del lado del cliente, la vinculación es enteramente responsabilidad del backend (T053); si el correo de la cuenta migrada nunca se registró en Clerk, el tutor usa el mismo botón "Registrarme"/Google de la Historia 1 con ese correo, y Clerk lo trata como una alta nueva de identidad (aunque la cuenta de PediTrack ya existía)

**Punto de Control**: Las 5 historias de usuario son funcionales de forma independiente — funcionalidad completa.

---

## Fase Final: Pulido y Aspectos Transversales

- [ ] T055 [P] Actualizar `CLAUDE.md` (raíz) con `specs/008-autenticacion-cuenta/` marcada como implementada y su PR; `backend/CLAUDE.md` con `internal/authmw` y los campos/errores nuevos de `internal/account`; `frontend/CLAUDE.md` con `features/auth/` y el reemplazo de `useAccountSession`
- [ ] T056 [P] Agregar las anotaciones Swagger (`@Summary`/`@Param`/`@Success`/`@Failure`/`@Router`) al handler `GetMe` y a los cambios de `CreateAccount`/`GetAccount`/`AddChild` en `backend/internal/account/handler.go`, y regenerar (`swag init -g cmd/api/main.go -o internal/docs --pd`)
- [ ] T057 Ejecutar manualmente las 5 historias + la verificación de Principio II de `quickstart.md` contra el backend y frontend corriendo localmente, con una instancia de Clerk de Desarrollo real
- [ ] T058 [P] Prueba E2E Playwright del flujo crítico "login" (nombrado explícitamente en la constitución, Principio VI) en `frontend/e2e/autenticacion.spec.ts`: registro con contraseña → cerrar sesión → volver a iniciar sesión con esa contraseña desde un contexto de navegador limpio → ver los mismos hijos, a 390px y 1280px (convención de spec 007)
- [ ] T059 [P] Prueba E2E Playwright de la Historia 3 en `frontend/e2e/autenticacion.spec.ts` (o un spec separado): con dos cuentas, confirmar que la sesión de una no puede abrir la URL de un hijo de la otra (redirección/mensaje, sin datos filtrados)
- [ ] T060 Verificar cobertura >90% en backend (`cd backend && go test ./... -cover`) y frontend (`cd frontend && npx vitest run --coverage`) — Principio VI NO NEGOCIABLE
- [ ] T061 Revisar `error_logs` (specs/002) tras correr toda la suite de pruebas y quickstart.md: confirmar que ninguna entrada contiene una contraseña ni un token completo de Clerk en su `message` — verificación explícita de Principio II, no solo por ausencia de código

---

## Dependencias y Orden de Ejecución

### Dependencias de Fase

- **Configuración (Fase 1)**: Sin dependencias.
- **Fundamental (Fase 2)**: Depende de la Configuración — BLOQUEA las 5 historias de usuario.
- **Historias de Usuario (Fase 3-7)**: Todas dependen de la Fundamental.
  - US1 (Fase 3) no depende de otras historias — es el primer camino demostrable de punta a punta (MVP).
  - US2 (Fase 4) depende de que exista al menos una cuenta creada por US1 para poder probarse (su propio código de login no depende en compilación de US1).
  - US3 (Fase 5) depende de US1/US2 solo para tener dos cuentas reales con las que probar cruces; su código (`AuthorizeAccountAccess`, `ChildBelongsToAccount`) es independiente.
  - US4 (Fase 6) depende de US2 (T034/T035) para tener una sesión que cerrar.
  - US5 (Fase 7) extiende directamente T009/T010 de la Fundamental y T032 de US2 — es la única historia que modifica código ya escrito en una fase anterior en vez de solo agregar código nuevo.

### Dentro de Cada Historia de Usuario

- Pruebas antes que implementación (deben fallar primero).
- Backend antes que frontend cuando el frontend consume el endpoint/campo nuevo.
- Dentro de US1: el paso de Clerk (registro/verificación de correo) antes que la llamada a `POST /accounts`.
- Dentro de US3: la verificación de dueño se agrega **antes** de cualquier otra validación existente en cada handler tocado (mismo orden que ya usa el proyecto entre freemium y validación de campos).

### Oportunidades de Paralelización

- T005, T006 (Fundamental, backend) en paralelo entre sí.
- T012, T013 (Fundamental, frontend) en paralelo entre sí.
- Dentro de US1: T020/T021 (pruebas) en paralelo; T025 en paralelo con el resto del backend de la historia.
- Dentro de US3: T038-T041 (pruebas) en paralelo; T047 en paralelo con T042-T046.
- T055/T056/T058/T059 (Pulido) en paralelo entre sí.

---

## Estrategia de Implementación

### MVP Primero (Solo Historia de Usuario 1)

1. Completar Fase 1: Configuración.
2. Completar Fase 2: Fundamental.
3. Completar Fase 3: Historia de Usuario 1.
4. **DETENERSE y VALIDAR**: Escenarios 1 y 2 de `quickstart.md` (registro con contraseña, registro con Google) — todavía sin poder demostrar "volver a entrar" (eso es US2).
5. Desplegar/demostrar si está lista.

### Entrega Incremental

1. Configuración + Fundamental → la app deja de depender de `localStorage` para su sesión.
2. Agregar US1 → Validar (Escenario 1/2 de quickstart.md) → primer punto donde una cuenta real existe.
3. Agregar US2 → Validar (Escenario 3 de quickstart.md, login desde otro navegador) → flujo completo demostrable.
4. Agregar US3 → Validar (Escenario 4, cruces entre cuentas) → cierra la brecha de privacidad, el motivo principal de la feature.
5. Agregar US4 → Validar (Escenario 5, cerrar sesión).
6. Agregar US5 → Validar (Escenario 6, cuenta migrada) → funcionalidad completa.

## Notas

- Las tareas [P] son de archivos distintos sin dependencias entre sí.
- La etiqueta [Historia] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que las pruebas fallen antes de implementar (TDD, por Principio VI).
- Detenerse en cada punto de control para validar la historia de forma independiente contra `quickstart.md`.
- Ninguna contraseña MUST llegar al backend de PediTrack en ningún punto de esta implementación (Principio II, FR-010) — si alguna tarea pareciera requerirlo, es una señal de que el diseño de research.md/data-model.md no se está siguiendo correctamente, no una excepción a tomar.
