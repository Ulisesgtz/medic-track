# Frontend Map — React PWA

Vite + React 18 + TypeScript. Forms: React Hook Form. Server state: TanStack Query. Styling: Tailwind CSS v4. Tests: Vitest + Testing Library (unit), Playwright (E2E).

## Layout

| Path | What's there |
|---|---|
| `src/App.tsx` | Router + QueryClientProvider — routes `/signup` → `AccountSignupPage`, `/home` → `HomePage`, `/children/:childId` → `ChildDetailPlaceholder` |
| `src/features/account-signup/` | The account + children signup feature (see below) |
| `src/features/home/` | The home page feature: children listing, "Agregar hijo" modal, the `account_id`-in-`localStorage` session (see below) |
| `src/shared/catalog/` | Country/state catalog fetch hooks (`useCountries`, `useStates`) shared across features |
| `src/shared/age.ts` | `computeAge(birthDate)` — pure function, months under 2 years old, whole years after |
| `e2e/account-signup.spec.ts` | Playwright E2E specs for signup — requires backend running locally |
| `e2e/home-listado-hijos.spec.ts` | Playwright E2E specs for the home page flow (specs/003-home-listado-hijos) |
| `vite.config.ts` | Includes the Tailwind v4 Vite plugin — don't remove it, the whole UI silently loses styling if it's dropped |
| `vitest.config.ts` | Coverage thresholds (>90%), `coverage.all: true` so untested files count |

## `src/features/account-signup/` — signup form

| File | Role |
|---|---|
| `AccountSignupForm.tsx` | Main form: tutor fields, children field array, freemium-limit gating (`handleAddChild`), renders `FreemiumLimitModal` |
| `ChildFieldset.tsx` | One repeatable child block: name/apellido/fecha nacimiento (required) + talla/peso (optional) |
| `FreemiumLimitModal.tsx` | Pop-up shown when trying to add a 2nd child on the free plan — "Ver planes" / "Quedarme con el plan gratuito" |
| `types.ts` | Form value types + `NAME_PATTERN`/`NAME_MAX_LENGTH` (mirrors backend's `validateNameFormat` — see backend/CLAUDE.md for the sync caveat) |
| `api.ts` | `createAccount()`, `CreateAccountError` (discriminated by `.kind`: `validation_error` | `email_already_exists` | `freemium_child_limit_exceeded` | `unknown`) |
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
| `ChildCard.tsx` | Name + `computeAge`; links to the (placeholder) child detail route |
| `ChildDetailPlaceholder.tsx` | Minimal stub rendered at `/children/:childId` — the real consultas/recetas screen is a separate future feature (FR-005/FR-007) |
| `AddChildModal.tsx` | Modal for "Agregar hijo"; reuses `ChildFieldset` and `FreemiumLimitModal` from `features/account-signup/` as-is, no duplication |
| `useAccountSession.ts` | `getAccountId`/`setAccountId`/`clearAccountId` over `localStorage`, each wrapped in `try/catch` — the only "session" this app has (no real login yet) |
| `api.ts` | `fetchAccount()`, `addChild()`, `AccountApiError` (discriminated by `.kind`: `not_found` | `validation_error` | `freemium_child_limit_exceeded` | `unknown`) |
| `types.ts` | `Account`/`Child` shapes matching `GET /accounts/{accountId}`'s response |

Because `AddChildModal.tsx` reuses `ChildFieldset` cross-feature, both `useAccountSession` and `AddChildModal` are imported from `features/home/` inside `features/account-signup/AccountSignupForm.tsx` too — a deliberate cross-feature import rather than moving shared pieces into `shared/` prematurely (see specs/003-home-listado-hijos/research.md).

## Running tests

```bash
npx vitest run --coverage   # unit tests, >90% threshold gate
npx playwright test         # E2E — needs backend (`go run ./cmd/api`) and frontend (`npm run dev`) both running
npx tsc --noEmit && npx eslint .   # type-check + lint
```
