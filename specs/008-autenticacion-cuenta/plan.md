# Plan de Implementación: Autenticación real de cuenta (login)

**Rama**: `feature/008-autenticacion-cuenta` | **Fecha**: 2026-09-22 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/008-autenticacion-cuenta/spec.md`

## Resumen

Reemplaza el `account_id`-en-`localStorage` (specs/003/007) por una sesión real con **Clerk**: el tutor se
registra con correo+contraseña o Google y esa identidad la verifica Clerk, nunca el backend de PediTrack; una
pantalla de login nueva permite volver a entrar desde cualquier dispositivo; `GET /accounts/{accountId}`,
`POST /accounts/{accountId}/children` y todos los endpoints de `internal/consultation` exigen que la sesión
corresponda a la cuenta dueña de esos datos; un endpoint nuevo `GET /accounts/me` resuelve la cuenta del tutor
autenticado sin que el cliente tenga que conocer/enviar su `accountId`; y las cuentas creadas antes de esta
feature (sin usuario en Clerk todavía) se vinculan automáticamente la primera vez que su tutor entra con el
mismo correo. El enfoque técnico completo está en research.md.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend), TypeScript + React 18 + Vite (frontend) — stack existente, sin cambios

**Dependencias Principales**: Backend: **`github.com/clerk/clerk-sdk-go/v2`** (dependencia nueva — verificación
de sesión vía middleware `clerkhttp` y llamadas a la Backend API de Clerk para leer el perfil/correo del
usuario). Frontend: **`@clerk/clerk-react`** (dependencia nueva — `<ClerkProvider>`, `useSignUp()`/`useSignIn()`
para flujos propios de correo+contraseña y Google, `useAuth()` para el token de sesión y `signOut()`), el resto
del stack (React Router, TanStack Query, React Hook Form, Tailwind) ya en uso, sin cambios.

**Almacenamiento**: PostgreSQL — 1 columna nueva en `accounts` (`clerk_user_id`), migración `0009`. Sin tablas
nuevas: Clerk es quien guarda contraseñas/identidad de Google, PediTrack solo guarda la referencia a "qué
usuario de Clerk es esta cuenta" (ver research.md y data-model.md).

**Pruebas**: `go test` + `testify` (backend, incl. mocks/fakes de la verificación de Clerk — research.md);
Vitest + Testing Library (frontend, incl. mockear `@clerk/clerk-react`); Playwright E2E para **login**, que es
uno de los 4 flujos críticos nombrados explícitamente en la constitución (Principio VI) — registro con
contraseña, registro con Google, login con contraseña, login con Google, cerrar sesión, y que una cuenta no
pueda ver los datos de otra, todos a 390px y 1280px por la convención de spec 007.

**Plataforma Objetivo**: Misma PWA existente (mobile-first, responsive), mismo backend HTTP

**Tipo de Proyecto**: Aplicación web (Opción 2) — extiende tanto `backend/` como `frontend/`

**Objetivos de Rendimiento**: Login/registro completos en menos de 30s/3min respectivamente (SC-001/SC-002 de
spec.md) — dominado por la latency de red hacia Clerk, no por trabajo propio del backend/frontend.

**Restricciones**: El backend de PediTrack MUST NOT guardar ni ver contraseñas en ningún momento (FR-010,
Principio II) — Clerk es la única frontera que las toca. La verificación de sesión MUST ocurrir en cada
petición a un endpoint protegido (sin confiar en un `accountId` que el cliente envía, FR-005/FR-006) — esto es
lo que cambia respecto a hoy, donde el backend confía ciegamente en el UUID de la URL.

**Escala/Alcance**: Mismo volumen bajo que el resto del proyecto (una familia por cuenta). El plan gratuito de
Clerk (50,000 usuarios retenidos mensuales, ampliado en febrero 2026) cubre de sobra el MVP — ver spec.md FR-011.

## Verificación de la Constitución

*GATE: Debe aprobarse antes de la investigación de la Fase 0. Volver a verificar tras el diseño de la Fase 1.*

- **Principio I (Registra, Nunca Interpreta)**: No aplica — esta funcionalidad no toca datos médicos ni los
  interpreta. ✅ Cumple, sin relación con el principio.
- **Principio II (Privacidad) — el más relevante de esta funcionalidad**: El constitución exige "confirmación
  explícita del usuario antes de implementarse, sin importar el tamaño del cambio" para cualquier cambio que
  toque este principio. Esta funcionalidad completa **es** ese cambio: mueve la identidad y la contraseña del
  tutor a un tercero (Clerk) y cierra una fuga de privacidad real y ya existente hoy (cualquiera con un
  `accountId` puede leer/modificar esa cuenta). La elección del proveedor (Clerk sobre AWS Cognito) ya se
  decidió con el usuario en el spec (FR-011); **este plan en sí, antes de pasar a `/speckit-tasks`, sigue
  necesitando esa confirmación explícita** — se la pido al usuario al reportar la finalización de este plan, no
  se asume con el pedido original de "vamos a hacer el plan". ⚠️ Requiere confirmación explícita antes de
  `/speckit-tasks`.
- **Principio III (Stack Tecnológico Fijo)**: Go + React + PostgreSQL, sin cambio de stack — Clerk es un
  proveedor de identidad externo, no un reemplazo de ninguna pieza del stack fijo (igual que specs/004 ya trajo
  una dependencia nueva, `tesseract.js`, sin violar este principio). ✅ Cumple.
- **Principio IV (Freemium Disciplinado)**: Sin cambios al modelo freemium — el límite de 1 hijo en el plan
  gratuito sigue igual, esta funcionalidad no lo toca. ✅ Cumple.
- **Principio V (Simplicidad y MVP Real)**: "Login + perfiles de niños" es alcance MVP explícito de la propia
  constitución — esta funcionalidad no es una desviación del MVP, es completar una pieza que ya estaba
  nombrada en él. Decisiones de research.md (flujos propios de Clerk en vez de sus componentes prearmados;
  email tomado del perfil verificado de Clerk en vez de duplicarlo en el payload; sin tabla nueva, solo una
  columna) están alineadas con YAGNI. ✅ Cumple.
- **Principio VI (Cobertura de Pruebas Obligatoria)**: Todo endpoint/componente nuevo o tocado DEBE mantener
  >90% de cobertura. **Login es uno de los 4 flujos críticos nombrados literalmente en el texto del Principio
  VI** — Playwright E2E no es opcional aquí, es el caso que motivó la lista original.

**Resultado**: Aprobado, con la salvedad marcada en Principio II — la confirmación explícita del usuario se pide
al final de este plan, antes de continuar a `/speckit-tasks`.

**Re-verificación tras el diseño (Fase 1)**: research.md y data-model.md confirman que ninguna contraseña llega
nunca al backend de PediTrack (Principio II, FR-010) — el backend solo recibe y verifica tokens de sesión ya
emitidos por Clerk, nunca credenciales. `GET /accounts/me` y la vinculación de cuentas migradas (Historia 5)
resuelven la identidad siempre a partir del token verificado, nunca de un valor que el cliente envía sin
respaldo (cierra la brecha que motivó FR-005/FR-006). Sin cambios al resultado: Aprobado, con la misma
salvedad de Principio II.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/008-autenticacion-cuenta/
├── plan.md                                # Este archivo
├── research.md                            # Fase 0
├── data-model.md                          # Fase 1
├── contracts/
│   ├── get-accounts-me.md                 # Fase 1 — GET /accounts/me (endpoint nuevo)
│   ├── post-accounts.md                   # Fase 1 — cambios a POST /accounts (specs/001)
│   ├── get-account.md                     # Fase 1 — cambios a GET /accounts/{accountId} (specs/003)
│   ├── post-account-children.md           # Fase 1 — cambios a POST /accounts/{accountId}/children (specs/003)
│   └── consultation-endpoints-auth.md     # Fase 1 — auth + verificación de dueño en todo internal/consultation
├── quickstart.md                          # Fase 1
└── tasks.md                               # Fase 2 (/speckit-tasks)
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── internal/account/
│   ├── model.go                     # Account gana ClerkUserID *string
│   ├── service.go                   # + GetAccountByClerkUserID, LinkClerkUser, AuthorizeAccountAccess
│   ├── repository.go                # + consultas por clerk_user_id; UPDATE de vinculación
│   ├── errors.go                    # + ErrAccountAccessDenied, ErrNoAccountForSession
│   └── handler.go                   # + GetMe (GET /accounts/me); CreateAccount/GetAccount/AddChild pasan por
│                                     #   el middleware de auth + AuthorizeAccountAccess
├── internal/consultation/
│   └── handler.go                   # Los 5 handlers ganan la misma verificación de dueño (vía internal/account)
├── internal/authmw/                 # NUEVO — envoltura delgada sobre clerkhttp para este proyecto
│   └── middleware.go                # RequireSession (clerkhttp.RequireHeaderAuthorization + helpers de contexto)
├── migrations/
│   └── 0009_add_clerk_user_id_to_accounts.sql
└── cmd/api/main.go                  # clerk.SetKey(CLERK_SECRET_KEY); CORS agrega el header Authorization;
                                      # rutas protegidas dentro de un r.Group con authmw.RequireSession

frontend/
├── src/main.tsx                     # + <ClerkProvider publishableKey={VITE_CLERK_PUBLISHABLE_KEY}>
├── src/features/auth/               # NUEVO — sin mock todavía, sigue design-tokens.md (frontend/CLAUDE.md)
│   ├── LoginPage.tsx                 # Pantalla de login (correo+contraseña, Google) — phone/desktop con useIsDesktop
│   ├── useLoginForm.ts               # signIn.password(...) + signIn.finalize(), estados de error
│   ├── SsoCallbackPage.tsx           # Ruta /sso-callback del flujo de Google (login y registro)
│   └── useCurrentAccount.ts          # Reemplaza useAccountSession: useQuery(['accounts', 'me'], fetchMe)
├── src/features/account-signup/
│   ├── useSignupForm.ts             # Primero signUp.password()/signUp.finalize() (o ya viene de Google), luego
│   │                                 # POST /accounts con el token — ya no envía `password` (sin cambio) ni
│   │                                 # `email` (nuevo: el backend lo toma del token)
│   ├── GoogleSignupButton.tsx       # Deja de avisar "disponible pronto": dispara signIn.sso({strategy:'oauth_google'})
│   └── api.ts                       # createAccount(payload, token)
├── src/features/home/
│   ├── useAccountSession.ts         # ELIMINADO — reemplazado por features/auth/useCurrentAccount.ts
│   ├── useSidebarSession.ts         # Lee useCurrentAccount() en vez de useAccountSession().getAccountId()
│   ├── HomePage.tsx                 # + botón/menú "Cerrar sesión" (useAuth().signOut())
│   └── api.ts                       # fetchAccount(accountId, token), addChild(accountId, payload, token)
├── src/features/consultations/api.ts # Los 5 fetch ganan un parámetro `token`
├── src/shared/auth/
│   └── withAuthHeader.ts            # Helper: arma { Authorization: `Bearer ${token}` } — usado por los 3 api.ts
└── src/App.tsx                      # + ruta /login, /sso-callback; /home, /children/:id, .../consultations/new,
                                      # /consultations/:id envueltas en un RequireSession (redirige a /login)
```

**Decisión de Estructura**: `internal/authmw` es un paquete nuevo y deliberadamente delgado (una función,
`RequireSession`) en vez de meter la verificación directo en `main.go` o en `internal/account` — la
verificación de sesión (quién eres) es un concern transversal a `account` y `consultation` por igual, mientras
que "esta cuenta es tuya" (`AuthorizeAccountAccess`) sí es lógica de negocio de `account` (mismo criterio de
separación que ya usa el proyecto entre `httpx.Responder` transversal y la lógica de cada dominio). En
frontend, `features/auth/` es nuevo porque el login no tiene mock ni dueño de dominio existente — no encaja en
`account-signup` (que es sobre crear la cuenta, no sobre volver a entrar) ni en `home`.

## Seguimiento de Complejidad

*Sin violaciones de la constitución que justificar.* Una nota de alcance, no una violación: FR-005 de spec.md
incluye explícitamente "consultas" además de "cuenta, hijos" — por eso este plan toca los 5 endpoints de
`internal/consultation` (no solo los 2 de `internal/account` que el research inicial del backlog nombraba),
mediante una comparación contra `internal/account` en vez de duplicar el dueño de cada hijo dentro de
`internal/consultation` (que desincronizaría los dos paquetes sin necesidad — ver research.md).
