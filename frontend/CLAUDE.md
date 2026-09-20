# Frontend Map — React PWA

Vite + React 18 + TypeScript. Forms: React Hook Form. Server state: TanStack Query. Styling: Tailwind CSS v4. Tests: Vitest + Testing Library (unit), Playwright (E2E).

## Layout

| Path | What's there |
|---|---|
| `src/App.tsx` | Router + QueryClientProvider — `/signup` → `AccountSignupPage`, `/home` → `HomePage`, `/children/:childId` → `ChildDetailPage`, `/children/:childId/consultations/new` → `NewConsultationPage`, `/consultations/:consultationId` → `ConsultationDetailPage`, `/planes` → placeholder (`MessagePage`) |
| `src/features/account-signup/` | The account + first child signup feature, and the plan-limit pop-up (see below) |
| `src/features/home/` | The home page: children listing, "Agregar hijo" dialogs, the desktop sidebar, the `account_id`-in-`localStorage` session (see below) |
| `src/features/consultations/` | Child detail page, "Nueva consulta" page (with client-side OCR), consultation detail, dose marking (see below) |
| `src/shared/catalog/` | Country/state catalog fetch hooks (`useCountries`, `useStates`) shared across features |
| `src/shared/ui/` | Presentational pieces used by more than one feature: `Logo`, `AppHeader` (phone dark header: eyebrow, title, action), `FormField` (label + control + inline error), `MessagePage`, `useIsDesktop` (true from 900px, `matchMedia`-based — **the one rule that picks the web or the phone design**) |
| `src/shared/age.ts` | `computeAge(birthDate)` — months under 2 years old, whole years after. `formatAgeLong`/`formatAgeShort` give "5 años 6 meses" / "5a 6m" for the cards, headers and sidebar |
| `src/shared/useLocalDay.ts` | The parent's local "today" `{from, to}`, rolled over at local midnight and re-checked when the app returns to the foreground. Use it, never a `useState(() => localDayRange())` that freezes at mount |
| `src/shared/date.ts` | `formatDateShort('2026-09-15')` → `15 sep 2026`, `formatDateLong` → `12 septiembre 2026`, `formatDayMonth`, `formatTime` — every date shown to the user goes through them (fixed month names, no `Intl`, no timezone shift) |
| `src/shared/apiError.ts` | `ApiError<Kind>` base class (`kind`, `message`, optional `details`) — each feature's `api.ts` defines its own subclass with just the `Kind` union it needs |
| `e2e/*.spec.ts`, `e2e/helpers.ts` | Playwright E2E. **Every flow runs twice, at 390 px (phone) and 1280 px (web)** through `designs` in `helpers.ts`; `signUp`/`fillSignup` create the account. Requires the backend running locally |
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
- Las pantallas con sesión van dentro de `features/home/AppShell.tsx`: en web (≥ 900 px) agrega `ChildrenSidebar`
  (280 px: hijos, "+ Agregar hijo", tutor y plan); en móvil no hay barra. Se **renderiza condicionalmente**, no se
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
| `useSignupForm.ts` | The form state, validation, catalog, submit and post-signup flow shared by both designs. `serverError` is the only feedback path for server-side rules with no client-side equivalent — don't remove it |
| `SignupWeb.tsx` | Mock 11 in the mock's order: Correo, Contraseña (validated, **never sent or stored** — auth will be Clerk/AWS Cognito), Tu nombre/apellido, País/Estado, the "Hijo 1 · Gratis" block, "Crear cuenta", and the Google button |
| `SignupPhone.tsx` | Mock 01, same order and same password/Google decisions as the web one, in a centered column of at most 430px |
| `GoogleSignupButton.tsx` | The "o" separator and "Registrarme con Google" shared by both signups |
| `validation.ts` | `nameValidation`, `emailValidation`, `passwordValidation`, `positiveNumberValidation`, `nameError()` and the mocks' own messages (`EMAIL_MESSAGE`…) — shared by the signup and the "Agregar hijo" modal |
| `FreemiumLimitModal.tsx` | The plan-limit pop-up (mocks 05/15). Opened by `AddChildDialogs` as soon as the parent taps "Agregar hijo" on the free plan with a child, and by `AddChildModal` if the server answers 422. Focus starts on "Ver planes"; "Entendido"/Escape/backdrop close it |
| `types.ts` | Form value types + `NAME_PATTERN`/`NAME_MAX_LENGTH` (mirrors backend's `validateNameFormat` — see backend/CLAUDE.md for the sync caveat) |
| `api.ts` | `createAccount()`, `CreateAccountError extends ApiError<...>` (`validation_error` \| `email_already_exists` \| `freemium_child_limit_exceeded` \| `unknown`) |
| `useAccountSignup.ts` | `useMutation` wrapper around `createAccount` |

- On success it saves the new account id via `useAccountSession` (from `features/home/`) and navigates to `/home`.
- Changing the país `<select>` clears `stateCode` via `register('countryCode', { onChange })` — don't drop it, or a stale estado from a previous país can be submitted silently.
- Name validation (`NAME_PATTERN`/`NAME_MAX_LENGTH`) must stay in sync with `backend/internal/account/service.go`'s `namePattern`.

## `src/features/home/` — home page, sidebar, add-child

| File | Role |
|---|---|
| `HomePage.tsx` | 3 states: no account saved / cuenta sin hijos / listado. Phone: dark header with "Hola, Ana" + tutor initials, one card per child, dashed "+ Agregar hijo", plan note (board screen 2). Web: "Hola, Ana / Tus hijos", solid "Agregar hijo", grid + dashed plan tile (mock 15). Clears the saved `account_id` on a 404 |
| `ChildCard.tsx` | Initial, name, `formatAgeLong`; links to the child detail. Phone variant adds two chips read from the same queries as the child detail (`['consultations', id]`, `['overview', id, day]`): "N consultas" and amber "N tomas hoy" / mint "Sin tomas pendientes"; avatar colour alternates cyan/mint. Web variant is plain |
| `AppShell.tsx`, `ChildrenSidebar.tsx` | Session shell and the web sidebar (see "Sistema visual") |
| `AddChildDialogs.tsx`, `plan.ts` | What "Agregar hijo" opens: the plan-limit pop-up when `atFreePlanLimit(account)`, otherwise `AddChildModal`. Shared by the home and the sidebar |
| `AddChildModal.tsx` | Board screen 7: title/subtitle + "×", Nombre, Apellido, Fecha de nacimiento, Talla/Peso (optional), "Cancelar" + "Guardar". Falls back to `FreemiumLimitModal` if the server still answers 422 |
| `useSidebarSession.ts` | `{ accountId, hasSidebar, isDesktop }` — the single place that decides whether the sidebar is on screen |
| `useAccountSession.ts` | `getAccountId`/`setAccountId`/`clearAccountId` over `localStorage`, each in `try/catch` — the only "session" this app has (no real login yet; next feature, see BACKLOG) |
| `api.ts`, `types.ts` | `fetchAccount()`, `addChild()`, `AccountApiError`; `Account`/`Child` shapes |

## `src/features/consultations/` — child detail, consultations, doses

| File | Role |
|---|---|
| `ChildDetailPage.tsx` | Phone (mock 02): dark header with the child, amber "Tomas de hoy" block (`TodayDosesBlock`, "Marcar tomas"), "Consultas" list with "+ Nueva". Web (board 6): header row with "Nueva consulta", three `SummaryCard`s, the list and the `TodayDosesPanel` |
| `NewConsultationPage.tsx`, `ConsultationForm.tsx` | "Nueva consulta" page (mocks 04/14) and its form: doctor, date, prescription photo (custom "Seleccionar archivo" button triggering a `hidden` `<input type="file" accept="image/*" capture>` via ref — never `sr-only` for this input, never `getUserMedia`), symptoms, medications. The form takes `variant` `'phone'`/`'desktop'`. OCR via `useOcrSuggestion` is only an editable autofill hint (`c/8 h`, `7 días`); numbered prescriptions add one medication per line with a stagger and visible progress; a hint never overwrites a field the parent filled. The missing-photo error shows together with the other missing fields |
| `MedicationFieldset.tsx`, `parsePositiveInt.ts` | One medication card: name, frequency and duration as free text (`c/8 h`, `7 días` — the number is extracted on submit), optional "Desde" time. "Quitar" only with more than one medication |
| `ConsultationDetailPage.tsx`, `MedicationCard.tsx`, `PhotoViewer.tsx` | Consultation detail (mocks 03/13): photo card + viewer, symptoms, each medication with its chips of **one day** and "← Día anterior / Día siguiente →" when the treatment spans several days; web adds "Tratamiento activo" from the overview |
| `ConsultationCard.tsx` | Date, doctor, `symptoms · N medicamentos` ("sin receta" when 0) |
| `SummaryCard.tsx`, `TodayDosesPanel.tsx`, `TodayDosesBlock.tsx` | Summary cards, the web panel and the phone block for today's doses (chip "Marcar"/"Tomada", `aria-pressed`). Data from `fetchChildOverview` with the parent's **local** day as `[from, to)` — the server never guesses time zones (the form sends `utcOffsetMinutes`). The server computes "tratamiento activo" with its own clock |
| `useDoseToggle.ts`, `useMarkAllDoses.ts` | Mutations that mark/unmark a dose (or all of today's) and refresh the consultation detail and the overview |
| `useOcrSuggestion.ts` | Runs `tesseract.js` **in the browser** — the photo never goes to an OCR service, only to this app's own backend (Principio II). A failed/empty OCR never blocks the form. Cloud/AI vision OCR was deliberately rejected — see `specs/004-detalle-consulta-hijo/research.md` and the project's memory — don't propose it again |
| `api.ts`, `types.ts` | `fetchConsultations`, `fetchChildOverview`, `createConsultation`, `fetchConsultationDetail`, `updateDoseStatus`, `ConsultationApiError` |

Consultations, medications and their doses' schedule are immutable once created — no edit/delete UI, only the taken/not-taken toggle.

## Running tests

```bash
npx vitest run --coverage   # unit tests, >90% threshold gate
npx playwright test         # E2E — needs backend (`go run ./cmd/api`) and frontend (`npm run dev`) both running
npx tsc --noEmit && npx eslint .   # type-check + lint
```
