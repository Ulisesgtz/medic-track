# PediTrack — Project Map

Pediatric health-record app for parents in Mexico. Built with Spec-Kit (Spec-Driven Development). Backend Go + PostgreSQL, frontend React PWA. See `backend/CLAUDE.md` and `frontend/CLAUDE.md` for module-level maps of each side.

## Where things live

| Area | Path |
|---|---|
| Governance / principles / stack / test policy | `.specify/memory/constitution.md` |
| Feature specs (spec.md, plan.md, tasks.md, data-model.md, contracts/) | `specs/<NNN-feature-name>/` |
| Backend service | `backend/` — see `backend/CLAUDE.md` |
| Frontend PWA | `frontend/` — see `frontend/CLAUDE.md` |
| Dev server launch config (used by the Browser preview tool) | `.claude/launch.json` |
| CI (coverage + E2E gates) | `.github/workflows/ci.yml` |
| API docs (Swagger UI, generated from Go doc comments) | `http://localhost:8080/swagger/index.html` when the backend is running — see `backend/CLAUDE.md` |
| Backlog (future work decided but not yet spec'd) | `BACKLOG.md` |

## Current features

- `specs/001-registro-cuenta-usuario/` — account signup (tutor + children), freemium 1-child limit, name format/length validation. Implemented on branch `feature/001-registro-cuenta-usuario`, PR: https://github.com/Ulisesgtz/medic-track/pull/1 (base `develop`), merged to `develop`.
- `specs/002-registro-log-errores/` — automatic error logging hook: every 4xx/5xx response gets logged to `error_logs` (message, HTTP status, endpoint, file/line, optional account_id — never email) via `internal/httpx`'s `Responder`, without any handler opting in per call site. Implemented on branch `feature/002-registro-log-errores`, merged to `develop`.
- `specs/003-home-listado-hijos/` — home page: lists the tutor's children (name + age), "Agregar hijo" modal reusing feature 001's form/freemium limit, and the no-auth `account_id`-in-`localStorage` "session" used to return to the home without a real login. Adds `GET /accounts/{accountId}` and `POST /accounts/{accountId}/children` to `internal/account`. Implemented on branch `feature/003-home-listado-hijos`, merged to `develop`.
- `specs/004-detalle-consulta-hijo/` — child detail page: lists a child's medical consultations, a form to register a new one (doctor, date, prescription photo, medications with dosing schedule, symptoms) with client-side OCR (`tesseract.js`) as an editable autofill aid (numbered prescriptions autofill one medication per line, added progressively with visible progress), and per-dose "tomada/no tomada" marking with no date/status restriction. New backend package `internal/consultation` (Consultation/Medication/Dose, all immutable except `Dose.taken`). Implemented on branch `feature/004-detalle-consulta-hijo`, PR: https://github.com/Ulisesgtz/medic-track/pull/4 (base `develop`), merged to `develop`.
- `specs/005-identidad-visual-front-end/` — visual identity and front-end redesign: PediTrack logo + PWA icons/manifest, design tokens (`frontend/src/index.css`, reference in `design-tokens.md` with the Tailwind recipes), all screens and both modals restyled, desktop children sidebar (`AppShell`, from 900px). Purely visual (FR-013): no route/API/data changes, except the consultation detail now returns medication `startTime` as `HH:MM`. **Every new screen must follow `specs/005-identidad-visual-front-end/design-tokens.md`** (see "Sistema visual" in `frontend/CLAUDE.md`). Implemented on branch `feature/005-identidad-visual-front-end`, PR: https://github.com/Ulisesgtz/medic-track/pull/5 (base `develop`), merged to `develop`.
- `specs/006-resumen-detalle-hijo/` — child detail summary matching the desktop mock: `GET /children/{childId}/overview?from=&to=` (today's doses in the parent's local day + the treatment still running, derived only from the dose schedule), `symptoms`/`medicationCount` on the consultations list, and `utcOffsetMinutes` on consultation creation so medication start times are read in the parent's time zone. Implemented on branch `feature/005b-alinear-mock-escritorio` (together with the desktop-mock alignment of the child detail), PR: https://github.com/Ulisesgtz/medic-track/pull/6 (base `develop`), merged to `develop`.
- `specs/007-homologar-pantallas-a-mocks/` — todas las pantallas hechas como los mocks entregados (tablero + `repo-pr/mockups/01…15`), con la lista de desviaciones y su motivo en su spec. **Los mocks web y los móvil son diseños separados y nunca se mezclan**: la app usa `useIsDesktop` (≥ 900 px = web) y renderiza uno u otro, sin clases responsivas `lg:` que combinen ambos. Nueva consulta es una página (`/children/:id/consultations/new`), "Agregar hijo" con el plan lleno abre el pop-up del plan de inmediato. Los registros (móvil 01 y web 11) tienen el campo Contraseña (solo validado, no se guarda) y el botón "Registrarme con Google" (aviso "pronto"): la autenticación real será con Clerk o AWS Cognito (ver `BACKLOG.md`). Branch `feature/007-homologar-pantallas-a-mocks`.

## Conventions (full detail in the constitution)

- **Code language**: all code, identifiers, DB schema/columns in English. Docs (specs, plans, constitution, commit prose) in Spanish.
- **Git**: `feature/NNN-slug` / `bugfix/NNN-slug` branches off `develop`, PR back to `develop`. `master` only updated on deploy.
- **Testing**: >90% unit coverage (Go + React) is required per Principio VI; Playwright E2E required for critical flows. Run before every push:
  - Backend: `cd backend && go test ./... -cover` (needs `DATABASE_URL` env pointing at a local Postgres)
  - Frontend unit: `cd frontend && npx vitest run --coverage`
  - Frontend E2E: `cd frontend && npx playwright test` (needs backend + frontend dev servers running)
- **CI**: `.github/workflows/ci.yml` runs the backend coverage gate, frontend coverage gate, and Playwright E2E gate on every PR/push to `develop`/`master`. `cmd/api` (Go entrypoint wiring) is excluded from the backend coverage gate — standing open question, not yet resolved with the user.
- **Web mocks are for web, phone mocks for phone — never mix them.** Each screen has a phone design and a web design (mocks 01–05 vs 11–15 and the board). Render exactly one per viewport with `useIsDesktop` (`frontend/src/shared/ui/`), and test both (E2E runs every flow at 390 px and 1280 px).
- **When the user gives a mock, build exactly that mock** (structure, sections, order, texts, colors, sizes) — not an interpretation, and not a substitute made from whatever data already exists. Before saying it's done: (1) measure the mock (its scale, frame width, sizes and positions — e.g. sample the image with PIL) and render the app at the mock's own width; (2) put mock and app side by side and check section by section, not just pixels of one element; (3) if the mock shows data the API doesn't have, build the data (endpoint, spec) instead of swapping in different content; (4) list every remaining deviation with its reason (e.g. a color that would break the 4.5:1 rule) and let the user decide. Ask only when genuinely blocked. The mock wins over `design-tokens.md` where they differ, except accessibility minimums, which must be flagged rather than silently broken.
- **When you add a new module/feature**: update this file and the relevant `backend/CLAUDE.md`/`frontend/CLAUDE.md` map — they don't update themselves.
- **Every new backend endpoint MUST write its responses through `*httpx.Responder`** (see backend/CLAUDE.md's "Automatic error logging") so it's automatically captured in `error_logs` — not optional, and there's no other supported way to write a JSON response in this backend.
- **When a conversation decides something is future work** (explicitly deferred, not building it now): add it to `BACKLOG.md` instead of only noting it in a spec's Supuestos or in memory — specs get buried once done, and memory isn't visible in the repo to anyone else.
