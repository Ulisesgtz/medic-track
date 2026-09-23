# Frontend Map — React PWA

Vite + React 19 + TypeScript. Auth: Clerk (`@clerk/react`). Forms: React Hook Form. Server state: TanStack Query. Styling: Tailwind CSS v4. Tests: Vitest + Testing Library (unit), Playwright (E2E).

## Layout

| Path | What's there |
|---|---|
| `src/App.tsx` | Router + QueryClientProvider (+ `useClearCacheOnUserChange`) — public: `/signup` → `AccountSignupPage`, `/login` → `LoginPage`, `/recuperar-contrasena` → `ForgotPasswordPage`, `/sso-callback` → `SsoCallbackPage`; behind `RequireSession`: `/registro/completar` → `CompleteGoogleSignupPage`, `/home` → `HomePage`, `/children/:childId` → `ChildDetailPage`, `/children/:childId/consultations/new` → `NewConsultationPage`, `/consultations/:consultationId` → `ConsultationDetailPage`, `/planes` → placeholder (`MessagePage`) |
| `src/features/account-signup/` | The account + first child signup feature, and the plan-limit pop-up (see below) |
| `src/features/home/` | The home page: children listing, "Agregar hijo" dialogs, the desktop sidebar, the `account_id`-in-`localStorage` session (see below) |
| `src/features/consultations/` | Child detail page, "Nueva consulta" page (with client-side OCR), consultation detail, dose marking (see below) |
| `src/shared/catalog/` | Country/state catalog fetch hooks (`useCountries`, `useStates`) shared across features |
| `src/shared/ui/` | Presentational pieces used by more than one feature: `Logo`, `AppHeader` (phone dark header: eyebrow, title, action), `FormField` (label + control + inline error), `MessagePage`, `useIsDesktop` (true from 900px, `matchMedia`-based — **the one rule that picks the web or the phone design**) and `useIsWide` (true from 1024px, `lg`: where the web mocks show the sidebar) |
| `src/shared/age.ts` | `computeAge(birthDate)` — months under 2 years old, whole years after. `formatAgeLong`/`formatAgeShort` give "5 años 6 meses" / "5a 6m" for the cards, headers and sidebar |
| `src/shared/useLocalDay.ts` | The parent's local "today" `{from, to}`, rolled over at local midnight and re-checked when the app returns to the foreground. Use it, never a `useState(() => localDayRange())` that freezes at mount |
| `src/shared/date.ts` | `formatDateShort('2026-09-15')` → `15 sep 2026`, `formatDateLong` → `12 septiembre 2026`, `formatDayMonth`, `formatTime` — every date shown to the user goes through them (fixed month names, no `Intl`, no timezone shift) |
| `src/shared/ui/PasswordInput.tsx` | Password `<input>` + the eye button (show/hide), shared by signup, login and recovery |
| `src/shared/ui/Notice.tsx`, `src/shared/auth/clerkMessages.ts` | `Notice` is the block for feedback not tied to one field (`error` soft rose / `info` cyan / `success` mint, icon + dark ink text, `role="alert"` only for errors) — use it instead of ad-hoc red `<p>`s. `clerkNotice(error, fallback)` maps a Clerk error `code` to a Spanish message and tone (e.g. `session_exists` → info with a link to `/home`); unknown codes use the caller's Spanish fallback, Clerk's own `message` is never shown |
| `src/shared/apiError.ts` | `ApiError<Kind>` base class (`kind`, `message`, optional `details`) — each feature's `api.ts` defines its own subclass with just the `Kind` union it needs |
| `e2e/*.spec.ts`, `e2e/helpers.ts`, `e2e/clerkApi.ts`, `e2e/global.setup.ts` | Playwright E2E against the **real Clerk development instance** (see "E2E con Clerk"). **Every flow runs twice, at 390 px (phone) and 1280 px (web)** through `designs` in `helpers.ts`. Requires the backend running locally |
| `vite.config.ts` | Includes the Tailwind v4 Vite plugin — don't remove it, the whole UI silently loses styling if it's dropped |
| `vitest.config.ts` | Coverage thresholds (>90%), `coverage.all: true` so untested files count |

## Web y móvil: dos diseños, nunca mezclados

Cada pantalla tiene un mock móvil y un mock web (`specs/007-homologar-pantallas-a-mocks/spec.md` tiene la tabla).
**No se mezclan**: cada componente de pantalla llama `useIsDesktop()` (≥ 900 px) y devuelve **uno** de los dos
árboles; nada de clases `lg:` que intenten servir a los dos. En pruebas unitarias jsdom no tiene `matchMedia`, así
que por defecto se renderiza el móvil; para el web se stubea `matchMedia` (`stubMatchMedia(true)`, ver
`AppShell.test.tsx`). En E2E se usa `designs` de `e2e/helpers.ts`.

## Sistema visual

Tokens de color y tipografía viven en el bloque `@theme` de `src/index.css`; la referencia de uso es
`specs/005-identidad-visual-front-end/design-tokens.md`. Reglas que rompen el diseño si se ignoran:

- Un solo botón sólido (`--color-confirmed`) por pantalla; las acciones secundarias van con contorno
  `--color-action`.
- Texto blanco solo sobre `--color-ink`, `--color-action` y `--color-confirmed`. Sobre `--color-bright`
  y `--color-pending` va tinta oscura.
- Ámbar (`--color-pending`) significa "el padre no lo ha marcado", nunca una advertencia médica
  (Principio I). No hay rojo de alerta médica; `red-700` solo para errores de formulario y "Quitar".
- El mock manda sobre `design-tokens.md`, salvo el mínimo de accesibilidad 4.5:1 (las desviaciones están en la
  spec 007). Los valores de los mocks se copian con clases arbitrarias (`rounded-[14px]`, `text-[#67e8f9]`).
- Un área táctil de 44 px sobre un elemento que el mock dibuja más chico se resuelve con `min-h-11` y margen
  negativo (`-my-3`, `-my-[5px]`), para que la posición visual sea la del mock.
- El logo solo va en header, pantalla de registro, barra lateral e icono/splash de la PWA.
- Las pantallas con sesión van dentro de `features/home/AppShell.tsx`: desde 1024 px (`lg`, como los mocks web 13/14/15) agrega `ChildrenSidebar`
  (280 px: hijos, "+ Agregar hijo", tutor y plan); en móvil y entre 900 y 1023 px no hay barra (el mock apila la página en una columna, con `px-6 py-8` en vez de `px-12 py-11`). Se **renderiza condicionalmente**, no se
  oculta con CSS, así nunca hay dos copias de la lista de hijos en el árbol de accesibilidad. Toda pantalla nueva con
  sesión debe envolverse en `AppShell`. `AppHeader` es solo del diseño móvil (el web no tiene banda de encabezado).
- En E2E web la barra lateral repite el nombre del hijo y "Agregar hijo": acotar selectores a `page.getByRole('main')`
  o `page.locator('aside')`.
- **Todo overlay va con `createPortal(…, document.body)`** (`AddChildModal`, `FreemiumLimitModal`): la barra es
  `sticky`, crea su propio stacking context, y un modal dentro se pintaba *debajo* de las tarjetas. Los modales son
  diálogos reales: `role="dialog"`, `aria-modal`, Escape, el foco entra y vuelve al botón que los abrió, Tab no sale.
- `MessagePage` (`shared/ui/`) es la pantalla de aviso con una salida: la usan `/planes` (marcador hasta que exista la
  pantalla de planes, BACKLOG) y las rutas desconocidas — nunca dejar una ruta en blanco.
- "Nueva consulta" es una **página**, no un modal. Salir (`← Cancelar`) pasa por `confirmLeave`: si hay algo escrito o
  una foto, pide confirmación con `window.confirm`; al guardar, `navigate(..., { replace: true })` para que "atrás"
  desde la consulta caiga en el hijo y no en un formulario ya enviado. Un botón de alternancia (chip de toma) lleva
  nombre accesible fijo y el estado solo en `aria-pressed`.
- El visor de la receta (`ConsultationDetailPage`) es un modal dentro de la app: no enlazar la foto como URL `data:`
  con `target="_blank"` — los navegadores bloquean esa navegación y la pestaña sale en blanco.

## `src/features/account-signup/` — signup and plan-limit pop-up

| File | Role |
|---|---|
| `AccountSignupForm.tsx` | Picks the design with `useIsDesktop`: `SignupPhone` (mock 01: dark header + form) or `SignupWeb` (mock 11: split screen with the checklist), both fed by `useSignupForm` |
| `useSignupForm.ts` | The form state, validation, catalog, submit and post-signup flow shared by both designs. `serverNotice` (`{ message, tone, action? }`, drawn with `Notice`) is the only feedback path for Clerk/server-side rules with no client-side equivalent — don't remove it. Clerk errors go through `clerkNotice()` so the tutor never sees Clerk's English messages |
| `SignupWeb.tsx` | Mock 11 in the mock's order: Correo, Contraseña (`PasswordField`: live rules + eye button; sent **only to Clerk** via `signUp.password()`, never to PediTrack's backend), Tu nombre/apellido, País/Estado, the "Hijo 1 · Gratis" block, "Crear cuenta", and the Google button |
| `SignupPhone.tsx` | Mock 01, same order and same password/Google decisions as the web one, in a centered column of at most 430px |
| `PasswordField.tsx` | The "Contraseña" field of both designs plus the live checklist of the password rules (`PASSWORD_RULES` in `validation.ts`: min. 8, lowercase, uppercase, number, special — the same policy configured in Clerk's dashboard), shown from the moment the field is focused or has text |
| `GoogleSignupButton.tsx` | The "o" separator and "Registrarme con Google" shared by both signups |
| `validation.ts` | `nameValidation`, `emailValidation`, `passwordValidation`, `positiveNumberValidation`, `nameError()` and the mocks' own messages (`EMAIL_MESSAGE`…) — shared by the signup and the "Agregar hijo" modal |
| `FreemiumLimitModal.tsx` | The plan-limit pop-up (mocks 05/15). Opened by `AddChildDialogs` as soon as the parent taps "Agregar hijo" on the free plan with a child, and by `AddChildModal` if the server answers 422. Focus starts on "Ver planes"; "Entendido"/Escape/backdrop close it |
| `types.ts` | Form value types + `NAME_PATTERN`/`NAME_MAX_LENGTH` (mirrors backend's `validateNameFormat` — see backend/CLAUDE.md for the sync caveat) |
| `api.ts` | `createAccount()`, `CreateAccountError extends ApiError<...>` (`validation_error` \| `email_already_exists` \| `freemium_child_limit_exceeded` \| `unknown`) |
| `useAccountSignup.ts` | `useMutation` wrapper around `createAccount` |

- On success `useAccountSignup` seeds the `['accounts','me']` cache with the new account and the form navigates to `/home`. If Clerk finished but `POST /accounts` failed, submitting again only repeats the POST (`sessionReady`); `HomePage`'s "Terminar registro" (→ `/registro/completar`) is the fallback after a reload.
- Changing the país `<select>` clears `stateCode` via `register('countryCode', { onChange })` — don't drop it, or a stale estado from a previous país can be submitted silently.
- Name validation (`NAME_PATTERN`/`NAME_MAX_LENGTH`) must stay in sync with `backend/internal/account/service.go`'s `namePattern`.

## `src/features/auth/` — session, login, password recovery

| File | Role |
|---|---|
| `useCurrentAccount.ts`, `RequireSession.tsx`, `useLogout.ts` | The one source of "which account is mine" (`GET /accounts/me`, key `['accounts', 'me']`), the route guard (signed out → `/login`) and logout (Clerk `signOut` + `queryClient.clear()`) |
| `LoginPage.tsx`, `useLoginForm.ts` | `/login`: correo + contraseña (eye button) or Google, link to recovery and to signup, already-signed-in → `/home`. Wrong password and unknown correo show the **same** message (FR-009). New-device confirmation (`needs_client_trust`/`needs_second_factor`) asks for the emailed code. The hook **reacts to `signIn.status` on each render** (`attempt` counter), it never reads the status right after an `await` (the snapshot can be stale) — `useSignupForm` follows the same rule |
| `ForgotPasswordPage.tsx`, `useForgotPassword.ts` | `/recuperar-contrasena`: correo → code + new password (same rules as signup) → signed in. A correo with no account goes to the code step like any other (no account enumeration) |
| `useClearCacheOnUserChange.ts` | Mounted once in `App`: clears the whole query cache when the Clerk user id changes (session expired, signed out in another tab, another tutor logging in) — our own logout already clears it, but the cache keys carry no user id |
| `AuthLayout.tsx` | Frame of the sign-in screens: the signup's phone header or web split screen, chosen with `useIsDesktop` |
| `SsoCallbackPage.tsx`, `api.ts` | Google return page (waits for `fetchStatus`, `signIn.isTransferable` → `signUp.create({ transfer })`) and `fetchMe` |

Clerk API errors carry the useful code in `error.errors[0].code` (the top-level one is `api_response_error`): always go through `clerkNotice()` / `hasClerkCode()` from `shared/auth/clerkMessages.ts`, never `error.code` directly.

## `src/features/home/` — home page, sidebar, add-child

| File | Role |
|---|---|
| `HomePage.tsx` | 4 states: `/accounts/me` 404 ("Falta terminar tu registro" → `/registro/completar`) / any other load error ("No pudimos cargar tu cuenta" + Reintentar) / cuenta sin hijos / listado. Phone: dark header with "Hola, Ana" + tutor initials, one card per child, dashed "+ Agregar hijo", plan note (board screen 2). Web: "Hola, Ana / Tus hijos", solid "Agregar hijo", grid + dashed plan tile (mock 15). |
| `ChildCard.tsx` | Initial, name, `formatAgeLong`; links to the child detail. Phone variant adds two chips read from the same queries as the child detail (`['consultations', id]`, `['overview', id, day]`): "N consultas" and amber "N tomas hoy" / mint "Sin tomas pendientes"; avatar colour alternates cyan/mint. Web variant is plain |
| `AppShell.tsx`, `ChildrenSidebar.tsx` | Session shell and the web sidebar (see "Sistema visual") |
| `AddChildDialogs.tsx`, `plan.ts` | What "Agregar hijo" opens: the plan-limit pop-up when `atFreePlanLimit(account)`, otherwise `AddChildModal`. Shared by the home and the sidebar. Takes the opener button (`opener` ref) and gives it the focus back on close — Safari doesn't focus a button when it is clicked, so `document.activeElement` can't be trusted; its close callback is stable (the dialogs re-run their focus setup if `onClose` changes identity) |
| `AddChildModal.tsx` | Board screen 7: title/subtitle + "×", Nombre, Apellido, Fecha de nacimiento, Talla/Peso (optional), "Cancelar" + "Guardar". Falls back to `FreemiumLimitModal` if the server still answers 422 |
| `useSidebarSession.ts` | `{ accountId, hasSidebar, isDesktop }` — the single place that decides whether the sidebar is on screen (`isDesktop` && `useIsWide` (1024px) && there is an account) |
| `api.ts`, `types.ts` | `fetchAccount()`, `addChild()`, `AccountApiError`; `Account`/`Child` shapes |

## `src/features/consultations/` — child detail, consultations, doses

| File | Role |
|---|---|
| `ChildDetailPage.tsx` | Phone (mock 02): dark header with the child, amber "Tomas de hoy" block (`TodayDosesBlock`, "Marcar tomas"), "Consultas" list with "+ Nueva". Web (board 6): header row with "Nueva consulta", three `SummaryCard`s, the list and the `TodayDosesPanel` |
| `NewConsultationPage.tsx`, `ConsultationForm.tsx` | "Nueva consulta" page (mocks 04/14) and its form: doctor, date, prescription photo (custom "Seleccionar archivo" button triggering a `hidden` `<input type="file" accept="image/*" capture>` via ref — never `sr-only` for this input, never `getUserMedia`), symptoms, medications. The form takes `variant` `'phone'`/`'desktop'`. OCR via `useOcrSuggestion` is only an editable autofill hint (`c/8 h`, `7 días`); numbered prescriptions add one medication per line with a stagger and visible progress; a hint never overwrites a field the parent filled. Once a photo is chosen the OCR panel is exactly the mock's and "Cambiar foto" sits in the header's top row (phone: next to "← Cancelar"; web: header's right end). The web medication row is the mock's three columns; "Desde" is a fourth column of the same row when the card is 720px wide or more (container query `@min-[720px]`, fields a bit shorter) and goes to a second row otherwise. The missing-photo error shows together with the other missing fields |
| `MedicationFieldset.tsx`, `parsePositiveInt.ts` | One medication card: name, frequency and duration as free text (`c/8 h`, `7 días` — the number is extracted on submit), required "Desde" time ("Elige la hora de la primera toma.": a consultation is immutable, so a missing start time could never be filled in later, and without it no doses or active treatment exist). "Quitar" only with more than one medication |
| `ConsultationDetailPage.tsx`, `MedicationCard.tsx`, `PhotoViewer.tsx` | Consultation detail (mocks 03/13): photo card + viewer, symptoms, each medication with its chips of **one day** and "← Día anterior / Día siguiente →" when the treatment spans several days; web adds "Tratamiento activo" from the overview |
| `ConsultationCard.tsx` | Date, doctor, `symptoms · N medicamentos` ("sin receta" when 0) |
| `SummaryCard.tsx`, `TodayDosesPanel.tsx`, `TodayDosesBlock.tsx` | Summary cards, the web panel and the phone block for today's doses (chip "Marcar"/"Tomada", `aria-pressed`). Data from `fetchChildOverview` with the parent's **local** day as `[from, to)` — the server never guesses time zones (the form sends `utcOffsetMinutes`). The server computes "tratamiento activo" with its own clock |
| `useDoseToggle.ts`, `useMarkAllDoses.ts` | Mutations that mark/unmark a dose (or all of today's) and refresh the consultation detail and the overview |
| `useOcrSuggestion.ts` | Runs `tesseract.js` **in the browser** — the photo never goes to an OCR service, only to this app's own backend (Principio II). A failed/empty OCR never blocks the form. Cloud/AI vision OCR was deliberately rejected — see `specs/004-detalle-consulta-hijo/research.md` and the project's memory — don't propose it again |
| `api.ts`, `types.ts` | `fetchConsultations`, `fetchChildOverview`, `createConsultation`, `fetchConsultationDetail`, `updateDoseStatus`, `ConsultationApiError` |

Consultations, medications and their doses' schedule are immutable once created — no edit/delete UI, only the taken/not-taken toggle.

## E2E con Clerk

Las pruebas E2E usan la instancia de **desarrollo** de Clerk de verdad (nada de mocks de auth):

- `global.setup.ts` (`globalSetup` de `playwright.config.ts`) llama `clerkSetup()` (token de pruebas de `@clerk/testing`) y, antes y después de la corrida, borra todos los usuarios de Clerk cuyo correo lleve el marcador `peditrack-e2e`. `clerkApi.ts` rechaza cualquier `CLERK_SECRET_KEY` que no sea `sk_test_`.
- Los correos salen de `uniqueEmail()` (`…peditrack-e2e…+clerk_test@example.com`): Clerk no manda correo real y acepta el código fijo `424242` (`finishEmailVerificationIfAsked` lo escribe si el formulario lo pide).
- Toda prueba que envía un formulario de Clerk desde la página llama `allowClerkOn(page)` (testing token: salta el CAPTCHA del registro). `signUp(page)` usa el formulario real; `seedChild(page)` / `seedAccount(page, children)` crean el usuario por la API de Clerk, inician sesión con `clerk.signIn` (ticket, sin formulario) y crean cuenta/hijo/consulta por la API de PediTrack con el token de esa sesión (`sessionToken`, `apiPost`).
- Localmente las llaves se leen de `frontend/.env.local` (`VITE_CLERK_PUBLISHABLE_KEY`) y `backend/.env.local` (`CLERK_SECRET_KEY`); en CI vienen de los secretos `VITE_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY`.
- `autenticacion.spec.ts` cubre login/logout con contraseña, el mensaje único de credenciales inválidas y que una sesión recibe 403 en los datos de otra cuenta (401 sin sesión).
- Los avisos `[Clerk Testing] FAPI request failed … Test ended` al final de una prueba son ruido inofensivo.

## Running tests

```bash
npx vitest run --coverage   # unit tests, >90% threshold gate
npx playwright test         # E2E — needs the backend (`go run ./cmd/api`, with CLERK_SECRET_KEY) running, network access to Clerk; the frontend dev server is started by Playwright
npx tsc --noEmit && npx eslint .   # type-check + lint
```
