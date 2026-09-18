# Frontend Map — React PWA

Vite + React 18 + TypeScript. Forms: React Hook Form. Server state: TanStack Query. Styling: Tailwind CSS v4. Tests: Vitest + Testing Library (unit), Playwright (E2E).

## Layout

| Path | What's there |
|---|---|
| `src/App.tsx` | Router + QueryClientProvider — routes `/signup` → `AccountSignupPage`, `/home` → `HomePage`, `/children/:childId` → `ChildDetailPage`, `/consultations/:consultationId` → `ConsultationDetailPage` |
| `src/features/account-signup/` | The account + children signup feature (see below) |
| `src/features/home/` | The home page feature: children listing, "Agregar hijo" modal, the `account_id`-in-`localStorage` session (see below) |
| `src/features/consultations/` | Child detail page, consultation registration form (with client-side OCR) and detail, dose marking (see below) |
| `src/shared/catalog/` | Country/state catalog fetch hooks (`useCountries`, `useStates`) shared across features |
| `src/shared/age.ts` | `computeAge(birthDate)` — pure function, months under 2 years old, whole years after |
| `src/shared/apiError.ts` | `ApiError<Kind>` base class (`kind`, `message`, optional `details`) — each feature's `api.ts` defines its own subclass (`CreateAccountError`, `AccountApiError`) with just the `Kind` union it needs, instead of duplicating the constructor |
| `e2e/account-signup.spec.ts` | Playwright E2E specs for signup — requires backend running locally |
| `e2e/home-listado-hijos.spec.ts` | Playwright E2E specs for the home page flow (specs/003-home-listado-hijos) |
| `e2e/detalle-consulta-hijo.spec.ts` | Playwright E2E specs for registering a consultation and marking a dose (specs/004-detalle-consulta-hijo) |
| `vite.config.ts` | Includes the Tailwind v4 Vite plugin — don't remove it, the whole UI silently loses styling if it's dropped |
| `vitest.config.ts` | Coverage thresholds (>90%), `coverage.all: true` so untested files count |

## Sistema visual

Tokens de color y tipografía viven en el bloque `@theme` de `src/index.css`; la referencia de uso es
`specs/005-identidad-visual-front-end/design-tokens.md`. Reglas que rompen el diseño si se ignoran:

- Un solo botón sólido (`--color-confirmed`) por pantalla; las acciones secundarias van con contorno
  `--color-action`. Dos botones sólidos en la misma vista es el error más común.
- Texto blanco solo sobre `--color-ink`, `--color-action` y `--color-confirmed`. Sobre `--color-bright`
  y `--color-pending` va tinta oscura — invertirlo baja el contraste por debajo de 4.5:1.
- Ámbar (`--color-pending`) significa "el padre no lo ha marcado", nunca una advertencia médica
  (Principio I). No hay rojo de alerta en la app.
- La jerarquía la hace la escala tipográfica (900 en titulares, números de resumen en 34 px), no los
  bordes grises — no reintroducir `border-slate-*` en las tarjetas.
- El logo (`src/shared/ui/Logo.tsx`) solo va en header, pantalla de registro e icono/splash de la PWA.

## `src/features/account-signup/` — signup form

| File | Role |
|---|---|
| `AccountSignupForm.tsx` | Main form: tutor fields, children field array, freemium-limit gating (`handleAddChild`), renders `FreemiumLimitModal` |
| `ChildFieldset.tsx` | One repeatable child block: name/apellido/fecha nacimiento (required) + talla/peso (optional) |
| `FreemiumLimitModal.tsx` | Pop-up shown when trying to add a 2nd child on the free plan — "Ver planes" / "Quedarme con el plan gratuito" |
| `types.ts` | Form value types + `NAME_PATTERN`/`NAME_MAX_LENGTH` (mirrors backend's `validateNameFormat` — see backend/CLAUDE.md for the sync caveat) |
| `api.ts` | `createAccount()`, `CreateAccountError extends ApiError<...>` (discriminated by `.kind`: `validation_error` | `email_already_exists` | `freemium_child_limit_exceeded` | `unknown`) |
| `useAccountSignup.ts` | `useMutation` wrapper around `createAccount` |

## Notable behaviors when touching this feature

- `AccountSignupForm.tsx` renders a generic fallback error banner for any server rejection that isn't `email_already_exists` or the freemium modal (e.g. a `validation_error` the client didn't catch) — don't remove that branch, it's the only feedback path for server-side rules with no client-side equivalent.
- On a successful save, `AccountSignupForm.tsx` saves the new account id via `useAccountSession` (from `features/home/`) and navigates to `/home` (FR-003 of specs/003-home-listado-hijos) — there is no more inline "Cuenta creada exitosamente" message; tests assert on the navigation instead.
- `ChildFieldset.tsx` validates height/weight are positive client-side (`positiveNumberValidation`, mirrors the backend's `> 0` check) so the common case never reaches the server-error fallback above.
- Changing the país `<select>` clears `stateCode` via `register('countryCode', { onChange: ... })` — don't drop that `onChange`, or a stale estado from a previous país can be submitted silently (react-hook-form keeps unregistered field values by default).
- Name validation (`NAME_PATTERN`/`NAME_MAX_LENGTH` in `types.ts`) must stay in sync with `backend/internal/account/service.go`'s `namePattern` — see backend/CLAUDE.md for why the DB no longer duplicates the character-set rule.
- `FreemiumLimitModal.tsx` traps Tab focus between its two buttons — it's a real modal overlay (`aria-modal="true"`), so don't let focus escape it.

## `src/features/home/` — home page

| File | Role |
|---|---|
| `HomePage.tsx` | 3 states: no account saved / cuenta sin hijos / listado; clears the saved `account_id` and falls back to the "no account" state on a 404 from `fetchAccount` |
| `ChildCard.tsx` | Name + `computeAge`; links to the child detail route (`ChildDetailPage`, in `features/consultations/` — specs/004-detalle-consulta-hijo) |
| `AddChildModal.tsx` | Modal for "Agregar hijo"; reuses `ChildFieldset` and `FreemiumLimitModal` from `features/account-signup/` as-is, no duplication. `ChildFieldset`'s "Quitar hijo" button is the modal's only dismiss control (wired to `onClose`) — valid only while the child is still unsaved, since it can never be removed once persisted (FR-006a); there's no separate "Cancelar" button duplicating the same action |
| `useAccountSession.ts` | `getAccountId`/`setAccountId`/`clearAccountId` over `localStorage`, each wrapped in `try/catch` — the only "session" this app has (no real login yet) |
| `api.ts` | `fetchAccount()`, `addChild()`, `AccountApiError extends ApiError<...>` (discriminated by `.kind`: `not_found` | `validation_error` | `freemium_child_limit_exceeded` | `unknown`) |
| `types.ts` | `Account`/`Child` shapes matching `GET /accounts/{accountId}`'s response |

Because `AddChildModal.tsx` reuses `ChildFieldset` cross-feature, both `useAccountSession` and `AddChildModal` are imported from `features/home/` inside `features/account-signup/AccountSignupForm.tsx` too — a deliberate cross-feature import rather than moving shared pieces into `shared/` prematurely (see specs/003-home-listado-hijos/research.md).

## `src/features/consultations/` — child detail, consultations, doses

| File | Role |
|---|---|
| `ChildDetailPage.tsx` | Lists a child's consultations (empty/listed states) and owns the "Registrar consulta" modal (renders `ConsultationForm`). The modal box itself scrolls internally (`max-h-[85vh] overflow-y-auto`) instead of the fixed backdrop — don't move that scroll back onto the backdrop, or a content-height change (e.g. collapsing a medication) can desync the scroll position enough that a click lands on the backdrop and closes the modal mid-edit |
| `ConsultationCard.tsx` | Doctor + date; links to the consultation's detail |
| `ConsultationForm.tsx` | Registration form: doctor, date, prescription photo (custom "Seleccionar archivo" button triggering a `hidden` `<input type="file" accept="image/*" capture>` via ref — never `sr-only` for this input, its native intrinsic width leaks into the modal's layout and causes horizontal overflow; never `getUserMedia`), medications field array, symptoms. Runs OCR on the photo via `useOcrSuggestion` purely as an editable autofill hint — the raw OCR text is never submitted directly, only whatever ends up in the form fields. `extractPrescriptionHints`/`extractMedications` parse the OCR text for doctor/date/medications (numbered-list prescriptions yield one medication per line via `extractNumberedMedications`, falling back to a single best-guess via `extractSingleMedication` otherwise); newly-needed fieldsets are `append`ed one at a time with a short stagger (`MEDICATION_STAGGER_MS`) and a visible "Agregando medicamentos… N de M" progress line, instead of dumping every fieldset at once — a hint only ever fills a field the parent left empty, never overwrites |
| `MedicationFieldset.tsx` | One repeatable medication: name, frequency (hours), duration (days), optional start time. Collapsible to a one-line summary (name — frequency — duration) via a header toggle for scanning a prescription with many medications — never collapsed by default, the parent must see every OCR-derived value before trusting it (Principio I). The header row uses CSS Grid (`grid-cols-[minmax(0,1fr)_auto]`, nested for the badge/summary/chevron) rather than flexbox — nested flex-shrink didn't reliably truncate the summary text, letting it overflow the modal |
| `useOcrSuggestion.ts` | Runs `tesseract.js` **in the browser** on the selected photo — the photo is never sent to any OCR service, only to this app's own backend (privacy: Principio II). A failed/empty OCR result never blocks the form. Cloud/AI vision OCR (which reads handwriting far better) was deliberately rejected for this project — see `specs/004-detalle-consulta-hijo/research.md` and the project's memory — don't propose it again |
| `ConsultationDetailPage.tsx` | Full detail: photo, doctor, date, medications with their doses (if any), symptoms |
| `DoseCheckbox.tsx` | Marks/unmarks a dose — always enabled, no "treatment still active" restriction (a dose can be toggled regardless of its date) |
| `api.ts` | `fetchConsultations`, `createConsultation`, `fetchConsultationDetail`, `updateDoseStatus`, `ConsultationApiError extends ApiError<...>` |
| `types.ts` | `ConsultationSummary`, `ConsultationDetail`, `Medication`, `Dose` |

Consultations, medications and their doses' schedule are immutable once created — there is no edit/delete UI anywhere in this feature, only `DoseCheckbox`'s taken/not-taken toggle.

## Running tests

```bash
npx vitest run --coverage   # unit tests, >90% threshold gate
npx playwright test         # E2E — needs backend (`go run ./cmd/api`) and frontend (`npm run dev`) both running
npx tsc --noEmit && npx eslint .   # type-check + lint
```
