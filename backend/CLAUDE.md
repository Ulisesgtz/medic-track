# Backend Map — Go API

Module: `github.com/Ulisesgtz/medic-track/backend`. Router: `chi`. DB: PostgreSQL via `pgxpool`.

## Layout

| Path | What's there |
|---|---|
| `cmd/api/main.go` | Entry point: wires DB pool, repos/services/handlers, chi router, CORS, routes |
| `internal/account/` | Account + Child domain: signup, freemium limit, name validation, reading an account and adding a child to an existing one (specs/003-home-listado-hijos) |
| `internal/account/model.go` | `Account`, `Child` structs |
| `internal/account/errors.go` | Domain errors (`ErrEmailAlreadyExists`, `ErrFreemiumChildLimitExceeded`, `ErrInvalidNameFormat`, `ErrAccountNotFound`), `ValidationErrors` |
| `internal/account/service.go` | `CreateAccount` — freemium 1-child limit check (runs first), then field validation (required fields, email format, name format/length via `validateNameFormat`, birth date, height/weight). `validateChildFields` factors out the single-child validation rules (unprefixed field names) that both `validateCreateAccountInput` and `AddChild` build on. `GetAccount`/`AddChild` back the home page's `GET`/`POST children` endpoints — `AddChild` checks the freemium limit (same precedence as `CreateAccount`: before field validation) using the account's current children from `GetByID`. |
| `internal/account/repository.go` | SQL: inserts Account + Children in one transaction; `mapInsertError` maps pg 23505→`ErrEmailAlreadyExists`, pg 23514 (CHECK violation)→`ErrInvalidNameFormat`. `GetByID` (→`ErrAccountNotFound` if missing) and `CreateChild` back the home page endpoints. |
| `internal/account/handler.go` | `POST /accounts`, `GET /accounts/{accountId}`, `POST /accounts/{accountId}/children` — request/response shapes, maps domain errors → HTTP status. An `accountId` that isn't a well-formed UUID is treated as 404, same as a genuinely missing account. |
| `internal/catalog/` | Read-only country/state catalog (`GET /catalog/countries`, `GET /catalog/countries/{code}/states`) |
| `internal/platform/db.go` | `NewPostgresPool` — reads `DATABASE_URL` |
| `internal/httpx/` | `Responder` (constructed via `NewResponder(recorder)`) — `WriteJSON`/`WriteJSONError` methods used by both `account` and `catalog` handlers; every 4xx/5xx response it writes is automatically logged to `error_logs` in a background goroutine, see "Automatic error logging" below |
| `internal/errorlog/` | `Entry` model + `Repository.Create` — persists rows in `error_logs` (specs/002-registro-log-errores); no read/query in this scope on purpose |
| `internal/docs/` | **Generated** OpenAPI/Swagger docs (`docs.go`, `swagger.json`, `swagger.yaml`) — do not hand-edit, see "API docs (Swagger)" below |
| `migrations/*.sql` | Schema, applied manually (no migration tool wired in yet) — `0001` catalog tables + México seed, `0002` accounts, `0003` children, `0004` name length CHECK constraints, `0005` `error_logs` table |
| `.github/workflows/ci.yml` | CI: backend coverage gate (incl. verifying Swagger docs are up to date), frontend coverage gate, Playwright E2E gate — all merge-blocking per constitution Principio VI |

## Known cross-cutting rules to keep in sync when touching name/account fields

- Name format rule (letters incl. accents/ñ, spaces, hyphens, apostrophes, max 100 chars) is owned by the **application layer only** — `internal/account/service.go`'s `namePattern` (Go `\p{L}`) and `frontend/src/features/account-signup/types.ts`'s `NAME_PATTERN` (JS `\p{L}`), which agree since both use the full Unicode "letter" category. The DB CHECK constraint (`migrations/0004_add_name_constraints.sql`) deliberately enforces **length only** — an earlier version also checked character set with an explicit Latin-1 range, which silently diverged from `\p{L}` and rejected valid non-Latin names as an opaque 500; don't reintroduce a character-class regex there.
- Freemium child limit (`1`) is a bare literal in `service.go`'s `CreateAccount` and a separate constant in `frontend/.../AccountSignupForm.tsx` (`FREE_PLAN_CHILD_LIMIT`) — update both if the limit or plan model changes.
- `CreateAccount` checks the freemium limit **before** field-level validation, so a request with 2+ children always gets `422 freemium_child_limit_exceeded` rather than a `400` about some unrelated field on the extra child.

## Automatic error logging (specs/002-registro-log-errores)

**Every new handler package (any new feature/endpoint) MUST take a `*httpx.Responder` in its constructor and write ALL its JSON responses through it** — same pattern as `account.NewHandler`/`catalog.NewHandler`. This is not optional or feature-specific: it's how every backend response in this codebase gets written, and it's what makes error logging automatic for free. There is no other supported way to write a JSON response here (the old package-level `httpx.WriteJSON`/`WriteJSONError` functions were deleted specifically so this can't be bypassed).

Every handler constructor now takes a `*httpx.Responder` (built once in `cmd/api/main.go` via `httpx.NewResponder(errorlog.NewRepository(pool))`) instead of calling package-level `httpx` functions. Any response written through `Responder.WriteJSON`/`WriteJSONError` with a 4xx/5xx status is automatically logged to `error_logs` — no handler code has to opt in per call site. Key points if you touch this:

- **Never call the old `httpx.WriteJSON`/`httpx.WriteJSONError` package functions** — they don't exist anymore; use `h.responder.WriteJSON(ctx, w, status, body, accountID)` (pass `accountID` as `nil` when no account is known yet, e.g. before signup succeeds).
- File/line are captured automatically via `runtime.Caller` inside `Responder.record` — don't add a `file`/`line` parameter to handler call sites, and don't add another layer of indirection between a handler and `Responder` without checking the `skip` offset in `internal/httpx/json.go` still resolves correctly.
- The actual DB write happens in a detached background goroutine with its own timeout — a slow/down `error_logs` insert must never delay or break the HTTP response already sent (verified by `TestResponder_WriteJSONError_RecorderFailureDoesNotAffectResponse` and the latency test in `internal/httpx/json_test.go`).
- The log NEVER stores the user's email — only `account_id` (nullable UUID). Don't add an email field to `errorlog.Entry`.
- No read/query endpoint, and no retention/purge policy exist for `error_logs` on purpose — see `BACKLOG.md`.

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
