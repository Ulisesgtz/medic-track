# Investigación: Autenticación real de cuenta (login)

## 1. Flujos de Clerk en frontend: propios vs. componentes prearmados

**Decisión**: Construir el login y el registro con los hooks de "custom flows" de Clerk (`useSignIn()`,
`useSignUp()`), no con sus componentes prearmados `<SignIn>`/`<SignUp>`.

**Justificación**: `frontend/CLAUDE.md` y el `CLAUDE.md` raíz exigen que toda pantalla siga
`design-tokens.md` y el sistema visual ya construido (specs/005/007) — los componentes prearmados de Clerk
traen su propio sistema de theming (`appearance` prop) que no mapea limpiamente a las clases arbitrarias
Tailwind ya usadas en todo el proyecto, y producirían una pantalla visualmente distinta al resto de la app. Los
hooks (`useSignUp`, `useSignIn`, `useAuth`) dan control total del HTML/CSS mientras Clerk sigue manejando la
verificación y el estado de la sesión por detrás.

**API concreta (SDK actual de Clerk, versión "Future")**:

- Registro con correo+contraseña: `signUp.password({ emailAddress, password })` → `signUp.verifications.
  sendEmailCode()` → `signUp.verifications.verifyEmailCode({ code })` → `signUp.finalize({ navigate })`.
- Login con correo+contraseña: `signIn.password({ identifier: email, password })` → `signIn.finalize({
  navigate })` (o el paso de segundo factor si `status === 'needs_second_factor'`, no usado en este MVP).
- Google (login y registro son la misma llamada — Clerk decide si es alta o entrada según el correo de la
  cuenta de Google): `signIn.sso({ strategy: 'oauth_google', redirectCallbackUrl: '/sso-callback', redirectUrl:
  '/home' })` — `redirectCallbackUrl` es la ruta intermedia a la que Google devuelve el control (donde la app
  decide qué pasó); `redirectUrl` es el destino final si todo se resuelve sin pasos adicionales. Ya en
  `/sso-callback`, según el resultado (`signIn.status === 'complete'` → ya existía → `signIn.finalize()`;
  `signUp.isTransferable` → era alta nueva, Clerk ya tiene los datos de Google listos para transferir a un
  `SignUp` → `signUp.finalize()`) se decide si el tutor va directo a `/home` (login) o a terminar su registro
  (alta nueva — Google solo da nombre/correo, no los datos del hijo). También hay que cubrir
  `signIn.existingSession`/`signUp.existingSession` (ya había una sesión activa en el navegador) activándola
  con `clerk.setActive()` en vez de `finalize()`.
- Token para llamar al propio backend: `useAuth().getToken()` (Promise) — se manda como
  `Authorization: Bearer <token>` en cada fetch a la API de PediTrack.
- Cerrar sesión: `useAuth().signOut()`.

**Alternativas consideradas**: Componentes prearmados (`<SignIn>`/`<SignUp>`) — descartados por el choque con
`design-tokens.md`; además el mock de esta feature no existe todavía (spec.md lo señala), así que de cualquier
forma hay que diseñar la pantalla a mano.

## 2. Verificación de sesión en el backend (Go)

**Decisión**: Middleware `clerkhttp.RequireHeaderAuthorization()` del paquete
`github.com/clerk/clerk-sdk-go/v2/http`, aplicado como grupo de rutas en `chi` sobre todos los endpoints
protegidos. Extrae el usuario verificado vía `clerk.SessionClaimsFromContext(ctx)` → `claims.Subject` (el id de
usuario de Clerk, equivalente al `sub` del JWT).

**Justificación**: Es el mecanismo documentado y soportado por Clerk específicamente para este caso (HTTP,
Go) — cachea las claves públicas de Clerk (JWKS) para no llamar a la API de Clerk en cada petición
("networkless verification"), evitando ese round-trip extra en el camino caliente de cada request autenticado.
La alternativa de verificar el JWT a mano (`jwt.Verify` + manejo manual de JWK) existe pero está pensada para
contextos no-HTTP — usarla aquí sería reinventar lo que el middleware ya resuelve (Principio V, YAGNI).

**Correo del usuario**: el token de sesión (versión 2, la actual desde abril 2025) sí trae `email` como claim
por defecto, pero el struct tipado `clerk.SessionClaims` del SDK de Go no expone ese campo directamente
(expone `Subject`/`SessionID`/etc., no `Email`). En vez de depender de un acceso no tipado a un claim custom,
**la decisión es llamar a la Backend API de Clerk** (`user.Get(ctx, claims.Subject)` del paquete
`github.com/clerk/clerk-sdk-go/v2/user`) para obtener el perfil completo, incluyendo `EmailAddresses` y
`PrimaryEmailAddressID` — de ahí se toma el correo verificado primario. Esto se confirma en tasks.md/
implementación contra la versión exacta del SDK instalada (el mismo repo de Clerk publica también un `v3` más
reciente; se fija la versión mayor a usar como tarea de configuración inicial, no se asume aquí).

**Configuración**: `clerk.SetKey(os.Getenv("CLERK_SECRET_KEY"))` una sola vez al arrancar `cmd/api/main.go`
(mismo patrón que `DATABASE_URL` — fallar rápido si falta). Solo la Secret Key hace falta en el backend; la
Publishable Key es del frontend.

## 3. Vincular la identidad de Clerk con el `Account` de PediTrack

**Decisión**: Una columna nueva y nada más — `accounts.clerk_user_id TEXT UNIQUE NULL` (migración `0009`). Sin
tabla nueva de "sesión" ni de "identidad externa": Clerk ya es la fuente de verdad de la sesión, PediTrack solo
necesita saber a qué `Account` corresponde cada usuario de Clerk.

**Justificación**: Las entidades "Sesión de tutor" e "Identidad externa" de spec.md son conceptuales para
describir el comportamiento al usuario — a nivel de implementación se resuelven con un solo campo, sin
duplicar nada que Clerk ya guarda (Principio V). `NULL` representa exactamente "cuenta creada antes de esta
feature, todavía no vinculada" (Historia 5).

**Alternativas consideradas**: Tabla `sessions` propia — rechazada, PediTrack no emite ni guarda tokens, sólo
verifica los que Clerk ya emitió; sería estado redundante sin ningún dueño real. Guardar el correo de Clerk
como fuente de verdad y desechar `accounts.email` — rechazado por alcance (spec.md excluye explícitamente
cambiar el modelo de datos más allá de lo necesario); `accounts.email` se queda, solo cambia de dónde se llena
(ver contracts/post-accounts.md).

## 4. Cómo el frontend descubre su propia cuenta (reemplazo de `account_id` en `localStorage`)

**Decisión**: Endpoint nuevo `GET /accounts/me` — a partir del `clerk_user_id` de la sesión verificada,
devuelve la `Account` vinculada. El frontend lo llama con TanStack Query (`useQuery(['accounts', 'me'], ...)`)
en vez de leer un `accountId` guardado sin verificar; `features/home/useAccountSession.ts` se elimina por
completo.

**Justificación**: Elimina de raíz la clase de bugs que el `account_id`-en-`localStorage` ya tenía (BACKLOG.md:
"si se abre la URL de un hijo en un navegador donde nunca se creó la cuenta... la pantalla carga pero sin la
barra lateral") — ya no hay dos fuentes de verdad (lo guardado localmente vs. lo que el servidor reconoce),
solo una: la sesión verificada. `GET /accounts/me` también es el mecanismo natural para la Historia 5 (primer
acceso de una cuenta migrada): si no hay ningún `Account` con ese `clerk_user_id` pero sí uno con el mismo
correo verificado y `clerk_user_id IS NULL`, se vincula ahí mismo y se devuelve — sin un endpoint ni una
pantalla aparte para "vincular cuenta".

**Alternativas consideradas**: Seguir enviando el `accountId` como antes pero ahora firmado/verificado —
rechazada, sigue acoplando al cliente a recordar un id; con `GET /accounts/me` el cliente no necesita saber ni
guardar ningún identificador de cuenta.

## 5. Proteger `GET /accounts/{accountId}`, `POST /accounts/{accountId}/children` y `internal/consultation`

**Decisión**: Dos verificaciones en cadena para cada endpoint protegido: (1) el middleware `authmw.
RequireSession` (verifica que hay una sesión de Clerk válida — 401 si no), y (2) una comprobación de
pertenencia específica del dominio (403 si la sesión es válida pero la cuenta no es la dueña del recurso
pedido). Para los endpoints de `internal/account` (`accountId` va en la ruta), la comprobación es directa:
`AuthorizeAccountAccess(ctx, clerkUserID, pathAccountID)`. Para los 5 endpoints de `internal/consultation`
(`childId`/`consultationId` en la ruta, sin `accountId`), la comprobación cruza a `internal/account` para
resolver el dueño real del hijo/consulta antes de continuar.

**Justificación**: spec.md FR-005 protege explícitamente "cuenta, hijos, **consultas**" — no solo los dos
endpoints de cuenta que el BACKLOG original nombraba. Cruzar a `internal/account` desde `internal/consultation`
(en vez de copiar `account_id` como dato redundante dentro de `consultation`) evita que las dos copias se
desincronicen; `account` ya es la fuente de verdad de qué hijo pertenece a qué cuenta (`children.account_id`
existe desde specs/001).

**Alternativas consideradas**: Dejar los endpoints de consulta sin autenticación en este corte — rechazada,
contradice directamente FR-005/FR-006 tal como el usuario los pidió en el spec (Principio II, no negociable en
este punto). Duplicar `account_id` en las tablas de consulta — rechazada por el riesgo de desincronización ya
mencionado.

## 6. Registro: orden de las llamadas y qué deja de mandarse

**Decisión**: El registro (specs/001/007) pasa a ser dos pasos encadenados del lado del cliente, sin cambiar
la experiencia visible del formulario: (1) `signUp.password(...)` + verificación de correo + `signUp.
finalize()` contra Clerk (o el flujo de Google) — esto ya produce una sesión válida y un token; (2) con ese
token, `POST /accounts` (mismo endpoint de siempre) crea la fila en PediTrack. El campo `email` **se quita**
del cuerpo de `POST /accounts` — el backend lo toma del perfil verificado de Clerk (ver punto 2), no del
JSON que manda el cliente. El campo `password` sigue sin mandarse nunca al backend de PediTrack (ya era así
desde spec 007; ahora además es real: Clerk sí la usa).

**Justificación**: Evita dos fuentes de verdad para el mismo dato (Principio V) y cierra una superficie de
error de seguridad menor (un cliente ya no podría, en teoría, crear una cuenta de PediTrack con un correo
distinto al que realmente verificó con Clerk). El formulario de registro conserva el campo de correo en la UI
— se sigue usando para llamar a Clerk y para la validación de formato del lado del cliente, solo deja de viajar
otra vez en el segundo paso.

**Caso doble-envío**: si `POST /accounts` se llama con una sesión de Clerk que ya tiene una `Account`
vinculada (p. ej. un reintento de red tras un 201 que no llegó al cliente), el backend responde `200` con la
cuenta ya existente en vez de crear una duplicada ni fallar — comportamiento idempotente, más simple y más
seguro para el usuario que pedirle que adivine si su cuenta ya se creó.

## 7. CORS

**Decisión**: Agregar `"Authorization"` a `AllowedHeaders` en `cmd/api/main.go`. `AllowCredentials` se queda en
`false` — el token viaja en el header `Authorization`, no en una cookie, que es justo el patrón que Clerk
documenta para llamadas entre orígenes distintos (frontend `:5173`, backend `:8080` en desarrollo; dominios
separados en producción, ver BACKLOG.md "Despliegue"). Esto evita la complejidad extra de cookies
cross-site (`SameSite=None`, `Secure`) que el mecanismo de cookie `__session` de Clerk necesitaría.

## 8. Variables de entorno nuevas

| Variable | Dónde | Notas |
|---|---|---|
| `CLERK_SECRET_KEY` | Backend | Del dashboard de Clerk (instancia de desarrollo primero, producción después). Nunca en el repo — igual que `DATABASE_URL` hoy. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend | Pública por diseño (Clerk la expone al navegador a propósito); igual necesita venir de una instancia de Clerk ya creada, no es secreta pero sí específica del proyecto. |

Crear la aplicación en el dashboard de Clerk (obtener ambas claves) es una acción fuera de este repositorio —
la hace el usuario, no es algo que se automatice desde aquí.
