# Backend Map — Go API

Module: `github.com/Ulisesgtz/medic-track/backend`. Router: `chi`. DB: PostgreSQL via `pgxpool`.

## Layout

| Path | What's there |
|---|---|
| `cmd/api/main.go` | Entry point: wires DB pool, repos/services/handlers, chi router, CORS, routes |
| `internal/account/` | Account + Child domain: signup, freemium limit, name validation |
| `internal/account/model.go` | `Account`, `Child` structs |
| `internal/account/errors.go` | Domain errors (`ErrEmailAlreadyExists`, `ErrFreemiumChildLimitExceeded`, `ErrInvalidNameFormat`), `ValidationErrors` |
| `internal/account/service.go` | `CreateAccount` — freemium 1-child limit check (runs first), then field validation (required fields, email format, name format/length via `validateNameFormat`, birth date, height/weight) |
| `internal/account/repository.go` | SQL: inserts Account + Children in one transaction; `mapInsertError` maps pg 23505→`ErrEmailAlreadyExists`, pg 23514 (CHECK violation)→`ErrInvalidNameFormat` |
| `internal/account/handler.go` | `POST /accounts` — request/response shapes, maps domain errors → HTTP status |
| `internal/catalog/` | Read-only country/state catalog (`GET /catalog/countries`, `GET /catalog/countries/{code}/states`) |
| `internal/platform/db.go` | `NewPostgresPool` — reads `DATABASE_URL` |
| `internal/httpx/` | Shared `WriteJSON`/`WriteJSONError` response helpers — used by both `account` and `catalog` handlers, don't reintroduce per-package copies |
| `internal/docs/` | **Generated** OpenAPI/Swagger docs (`docs.go`, `swagger.json`, `swagger.yaml`) — do not hand-edit, see "API docs (Swagger)" below |
| `migrations/*.sql` | Schema, applied manually (no migration tool wired in yet) — `0001` catalog tables + México seed, `0002` accounts, `0003` children, `0004` name length CHECK constraints |
| `.github/workflows/ci.yml` | CI: backend coverage gate (incl. verifying Swagger docs are up to date), frontend coverage gate, Playwright E2E gate — all merge-blocking per constitution Principio VI |

## Known cross-cutting rules to keep in sync when touching name/account fields

- Name format rule (letters incl. accents/ñ, spaces, hyphens, apostrophes, max 100 chars) is owned by the **application layer only** — `internal/account/service.go`'s `namePattern` (Go `\p{L}`) and `frontend/src/features/account-signup/types.ts`'s `NAME_PATTERN` (JS `\p{L}`), which agree since both use the full Unicode "letter" category. The DB CHECK constraint (`migrations/0004_add_name_constraints.sql`) deliberately enforces **length only** — an earlier version also checked character set with an explicit Latin-1 range, which silently diverged from `\p{L}` and rejected valid non-Latin names as an opaque 500; don't reintroduce a character-class regex there.
- Freemium child limit (`1`) is a bare literal in `service.go`'s `CreateAccount` and a separate constant in `frontend/.../AccountSignupForm.tsx` (`FREE_PLAN_CHILD_LIMIT`) — update both if the limit or plan model changes.
- `CreateAccount` checks the freemium limit **before** field-level validation, so a request with 2+ children always gets `422 freemium_child_limit_exceeded` rather than a `400` about some unrelated field on the extra child.

## API docs (Swagger)

Every handler in `internal/account/handler.go` and `internal/catalog/handler.go` carries `@Summary`/`@Param`/`@Success`/`@Failure`/`@Router` doc comments (swaggo/swag syntax) directly above the function. The Swagger UI is served at `http://localhost:8080/swagger/index.html` when the API is running (`go run ./cmd/api`) — use it to explore endpoints, payload/response shapes, and to try requests live against your local DB.

**After changing any handler's request/response types or doc comments**, regenerate the docs:

```bash
go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd
```

CI fails the build if `internal/docs/` is stale relative to the annotations (it re-runs the same command and diffs the output), so always commit the regenerated files together with the handler change.

## Running tests

```bash
export DATABASE_URL="postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable"  # local dev creds
go test ./... -cover
```

Coverage target: >90% per package (Principio VI of the constitution). `cmd/api` itself has 0% coverage (wiring-only, currently unaddressed — standing open question, not yet resolved with the user) and is excluded from the CI coverage gate for that reason.
