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
- `specs/002-registro-log-errores/` — automatic error logging hook: every 4xx/5xx response gets logged to `error_logs` (message, HTTP status, endpoint, file/line, optional account_id — never email) via `internal/httpx`'s `Responder`, without any handler opting in per call site. Implemented on branch `feature/002-registro-log-errores`, not yet merged. No read/query endpoint and no retention policy by design — see `BACKLOG.md`.

## Conventions (full detail in the constitution)

- **Code language**: all code, identifiers, DB schema/columns in English. Docs (specs, plans, constitution, commit prose) in Spanish.
- **Git**: `feature/NNN-slug` / `bugfix/NNN-slug` branches off `develop`, PR back to `develop`. `master` only updated on deploy.
- **Testing**: >90% unit coverage (Go + React) is required per Principio VI; Playwright E2E required for critical flows. Run before every push:
  - Backend: `cd backend && go test ./... -cover` (needs `DATABASE_URL` env pointing at a local Postgres)
  - Frontend unit: `cd frontend && npx vitest run --coverage`
  - Frontend E2E: `cd frontend && npx playwright test` (needs backend + frontend dev servers running)
- **CI**: `.github/workflows/ci.yml` runs the backend coverage gate, frontend coverage gate, and Playwright E2E gate on every PR/push to `develop`/`master`. `cmd/api` (Go entrypoint wiring) is excluded from the backend coverage gate — standing open question, not yet resolved with the user.
- **When you add a new module/feature**: update this file and the relevant `backend/CLAUDE.md`/`frontend/CLAUDE.md` map — they don't update themselves.
- **When a conversation decides something is future work** (explicitly deferred, not building it now): add it to `BACKLOG.md` instead of only noting it in a spec's Supuestos or in memory — specs get buried once done, and memory isn't visible in the repo to anyone else.
