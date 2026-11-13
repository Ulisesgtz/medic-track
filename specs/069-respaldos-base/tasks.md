# Tareas: Respaldos de la base de datos

**Entrada**: `specs/069-respaldos-base/` — spec.md, plan.md, research.md (R1–R13), data-model.md, contracts/cli.md y quickstart.md.

**Pruebas**: obligatorias (constitución, Principio VI). La cobertura de `internal/backup` debe pasar del 90 %. Además lleva una prueba de privacidad de los mensajes y una integración real con la etiqueta `integration`. No hay E2E porque la app no cambia.

**Rama**: `feature/069-respaldos-base`. Commit solo cuando el dueño lo pida.

**Reglas que valen para todas las tareas**:
- Ningún dato de las familias en nombres de objeto, consola, `error_logs` ni `backup_runs`: solo nombres de tablas, números y códigos fijos.
- **La llave privada del dueño nunca vive en un sistema**: ni en variables, ni en el repositorio, ni en el bucket. `restore` la lee de un archivo.
- Nada al disco salvo el `PGDATA` efímero de la comprobación, que se borra siempre (también si algo falla).
- Nunca se restaura sobre una base con tablas.
- Todo el código, los identificadores y el esquema van en inglés; la documentación, en español.
- Dependencias con versión exacta: `filippo.io/age` v1.3.2 y `github.com/minio/minio-go/v7` v7.4.1.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Agregar `filippo.io/age v1.3.2` y `github.com/minio/minio-go/v7 v7.4.1` a `backend/go.mod` con `go get` y versión exacta, y correr `go mod tidy`. Revisar que `go build ./...` y `govulncheck` sigan limpios.
- [X] T002 [P] Crear `backend/migrations/0036_backup_runs.sql` con la tabla del data-model:
  - Columnas y restricciones:
    - `id uuid PK default gen_random_uuid()`
    - `kind text NOT NULL CHECK (kind IN ('backup','check'))`
    - `env text NOT NULL CHECK (env ~ '^[a-z]{2,12}$')`
    - `started_at timestamptz NOT NULL DEFAULT now()`
    - `finished_at timestamptz`
    - `status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','failed'))`
    - `failure text CHECK (failure IN ('config','lock','snapshot','dump','encrypt','upload','retention','download','decrypt','restore','verify','record'))`
    - `object_key text CHECK (object_key ~ '^[a-z]{2,12}/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{4}Z\.dump\.age$')`
    - `size_bytes bigint CHECK (size_bytes >= 0)`
    - `table_counts jsonb`
    - `checked_run_id uuid REFERENCES backup_runs(id)`
  - CHECK de forma:
    - `ok` ⇒ `finished_at` y `object_key`;
    - `ok` de un `backup` ⇒ además `size_bytes` y `table_counts`;
    - `failed` ⇒ `failure` y `finished_at`.
  - Índice `(kind, env, status, started_at DESC)`.

  Aplicarla en la base local de desarrollo y en la de pruebas.

---

## Fase 2: Fundamental (bloquea todas las historias)

- [X] T003 [P] Crear `backend/internal/backup/config.go`.
  - `Config` y `LoadConfig(getenv)` leen:
    - `DATABASE_URL`
    - `BACKUP_ENV` (`^[a-z]{2,12}$`)
    - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
    - `R2_BUCKET` (por omisión `peditrack-backups`)
    - `BACKUP_OWNER_RECIPIENT` (debe parsear como destinatario age)
    - `BACKUP_CHECK_IDENTITY` (debe parsear como identidad age)
    - `BACKUP_CHECK_WEEKDAY` (0–6, por omisión 1)
  - Devuelve qué variables faltan **por nombre, nunca su valor**.
  - `Config.String()` nunca imprime secretos.
  - Pruebas en `config_test.go`.
- [X] T004 [P] Crear `backend/internal/backup/naming.go`.
  - `ObjectKey(env, at time.Time) string` → `dev/2026-11-12T090003Z.dump.age` (UTC, al segundo).
  - `ParseObjectKey(key) (env string, at time.Time, ok bool)` solo acepta ese formato.
  - Pruebas en `naming_test.go`: el nombre no lleva nada más; las llaves ajenas, mal formadas o de otro ambiente dan `ok=false`.
- [X] T005 [P] Crear `backend/internal/backup/crypt.go` con age:
  - `Encrypt(dst io.Writer, recipients ...age.Recipient) (io.WriteCloser, error)`, en flujo;
  - `Decrypt(src io.Reader, identity age.Identity) (io.Reader, error)`;
  - `GenerateKey() (public, private string, err error)`;
  - `ParseRecipient` y `ParseIdentity`.

  Pruebas en `crypt_test.go`: dos destinatarios, cada llave sola abre, una tercera no abre, el texto cifrado empieza con `age-encryption.org/v1` y no contiene el claro.
- [X] T006 [P] Crear `backend/internal/backup/report.go`.
  - `Reporter` escribe **de forma síncrona** con `errorlog.Repository.Create` una fila con:
    - `Endpoint: jobreport.EndpointPrefix + "backup"`
    - `HTTPStatus: nil`, `AccountID: nil`
    - el archivo y la línea del llamador (`runtime.Caller`)
  - El mensaje sale de un mapa **fijo** por `Failure`:
    - `config` → «The backup configuration is incomplete»
    - `lock` → «The backup lock could not be taken»
    - `snapshot` → «The database snapshot could not be taken»
    - `dump` → «The database dump failed»
    - `encrypt` → «The backup could not be encrypted»
    - `upload` → «The backup could not be uploaded to the storage»
    - `retention` → «Old backups could not be removed»
    - `download` → «The backup could not be downloaded for the weekly check»
    - `decrypt` → «The backup could not be decrypted for the weekly check»
    - `restore` → «The backup could not be restored for the weekly check»
    - `verify` → «The restored backup does not match its table counts»
  - Nunca agrega el texto del error original.
  - Pruebas en `report_test.go` y `privacy_test.go`: con un error que contiene una URL `postgres://u:p@…`, una llave `AGE-SECRET-KEY-…` y `r2.cloudflarestorage.com`, ninguna fila ni mensaje los contiene.
- [X] T007 Crear `backend/internal/backup/repository.go`, sobre `pgxpool`:
  - `Start(ctx, kind, env) (id uuid.UUID, err error)`
  - `FinishOK(ctx, id, objectKey, sizeBytes *int64, counts map[string]int64, checkedRun *uuid.UUID)`
  - `FinishFailed(ctx, id, failure)`
  - `LatestValidBackup(ctx, env) (*Run, error)`: el `ok` más reciente de `backup`
  - `LastOK(ctx, kind) (*time.Time, error)`: de cualquier ambiente, para el digest
  - `ObjectStates(ctx, env) (map: ok | check_failed)` (antes `ValidObjectKeys`; ver la revisión de código)

  Pruebas en `repository_test.go` contra `DATABASE_URL` (como los demás repositorios): el CHECK rechaza un `ok` sin `object_key`; una corrida `running` nunca es la válida.
- [X] T008 [P] Crear `backend/internal/backup/store.go`.
  - Interfaz `Store`:
    - `Put(ctx, key string, r io.Reader) (size int64, err error)`, en flujo con tamaño desconocido;
    - `Get(ctx, key) (io.ReadCloser, error)`;
    - `List(ctx, prefix) ([]Object, error)`;
    - `Delete(ctx, key) error`.
  - `NewR2Store(cfg)` con minio-go:
    - endpoint `<account>.r2.cloudflarestorage.com`, `Secure: true`;
    - metadato `x-amz-meta-env` en `Put`;
    - 3 intentos con espera en errores de red.
  - `MemoryStore` para pruebas en `store_memory.go`. Una subida que falla a medias **no deja objeto**.
  - Pruebas en `store_test.go` con `MemoryStore` y del armado del endpoint (sin red).

**Punto de control**: con las piezas puras, el repositorio y el almacenamiento en memoria ya se arma una copia de punta a punta en pruebas.

---

## Fase 3: Historia de Usuario 1 — Cada día una copia completa, cifrada y fuera del proveedor (P1) 🎯 MVP

**Objetivo**: FR-001 a FR-007, FR-014, FR-016.

**Prueba independiente**: `backup run` deja un objeto `dev/…dump.age` ilegible sin la llave, una fila `backup` `ok` con conteos y nada en disco. Una falla deja `failed` y una fila `job:backup`.

- [X] T009 [US1] Crear `backend/internal/backup/dump.go`.
  - Interfaz `Dumper`: `Dump(ctx, w io.Writer) (counts map[string]int64, err error)`.
  - `PgDumper`:
    1. Abre en la base viva una transacción `REPEATABLE READ READ ONLY`.
    2. `SELECT pg_export_snapshot()`.
    3. Cuenta `count(*)` de cada tabla base de `public`, en orden, **sin leer filas**.
    4. Corre `pg_dump --format=custom --snapshot=<id> --no-owner --no-privileges --dbname=<url>`, con la salida al `w` y el stderr a un búfer que **no se registra** (solo decide el código de falla).
    5. Cierra la transacción **después** de que `pg_dump` termine.
  - `pg_dump` debe estar en el `PATH`.
  - Pruebas en `dump_test.go`: la construcción de los argumentos y que el stderr nunca sale. El volcado real va en la integración (T024).
- [X] T010 [US1] Crear `backend/internal/backup/lock.go`: `TryLock(ctx, conn) (release func(), ok bool, err error)` con `pg_try_advisory_lock(<constante>)` en una conexión dedicada. Pruebas en `lock_test.go` contra la base de pruebas: la segunda no obtiene el candado.
- [X] T011 [US1] Crear `backend/internal/backup/service.go` con `Service{cfg, repo, store, dumper, restorer, reporter, now}` y `RunBackup(ctx) (*Run, error)`:
  1. Candado; sin él, sale con nil y sin escribir nada.
  2. `repo.Start(backup)`.
  3. `io.Pipe`: `dumper.Dump` → `Encrypt(owner, check)` → `store.Put(ObjectKey(env, now))`.
  4. `FinishOK` con el tamaño y los conteos.
  5. Cualquier error ⇒ `FinishFailed(<paso>)` + `reporter.Report(<paso>)`, sin dejar el objeto (borrarlo si `Put` alcanzó a terminar y algo posterior falló).

  Pruebas en `service_test.go` con fakes:
  - éxito con `status ok`;
  - falla en cada paso (`snapshot`, `dump`, `encrypt`, `upload`) con su `failure` y su fila;
  - sin candado no se hace nada;
  - una corrida a medias nunca queda `ok`.
- [X] T012 [US1] Crear `backend/cmd/backup/main.go`: subcomandos `run`, `check`, `list`, `restore`, `keygen`, solo cableado.
  - `run`: `LoadConfig`. Si falta algo, `Report(config)` (si hay base) + mensaje en consola con **los nombres** de las variables + salida 2. Luego `RunBackup`, retención (T016) y comprobación si toca (T020). Sale con 1 si algo falló.
  - Consola: una línea por paso, como en contracts/cli.md.
- [X] T013 [P] [US1] Crear `backend/Dockerfile.backup`: etapa `golang:1.27-alpine`, que compila `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/backup ./cmd/backup`, y etapa `postgres:18-alpine`, con `COPY /out/backup /usr/local/bin/backup`, `USER postgres` y `ENTRYPOINT ["backup"]`, `CMD ["run"]`.
- [X] T014 [P] [US1] Crear `backend/railway.backup.json`: builder `DOCKERFILE`, `dockerfilePath: "Dockerfile.backup"`, `deploy.cronSchedule: "0 9 * * *"`, `restartPolicyType: "NEVER"` y sin `healthcheckPath`.

---

## Fase 4: Historia de Usuario 2 — Las copias viejas se van solas (P1)

**Objetivo**: FR-008, FR-009.

**Prueba independiente**: con objetos de muchas fechas, `Keep` conserva exactamente 7/4/6 más el más reciente y nunca toca un nombre ajeno.

- [X] T015 [P] [US2] Crear `backend/internal/backup/retention.go`.
  - `Keep(objects []Object, env string, now time.Time) (keep, remove []Object)`, pura, en hora de `America/Mexico_City`.
  - Conserva la más reciente de cada uno de los **7 días** más recientes con copia, de las **4 semanas ISO** y de los **6 meses**, y siempre la más reciente de todas.
  - Solo considera objetos con `ParseObjectKey` válido y del mismo `env`; los demás no se tocan ni se borran.

  Pruebas en `retention_test.go` con tablas: 90 días diarios, huecos de días fallidos, un solo objeto, objetos ajenos y cambio de mes y de año.
- [X] T016 [US2] En `service.go`, `ApplyRetention(ctx)`: solo después de un `RunBackup` `ok`. `store.List(env+"/")` → `Keep` → `Delete` de cada sobrante. Si falla, `Report(retention)` sin cambiar el `status` del respaldo. Pruebas en `service_test.go`: no borra si el respaldo falló y nunca borra el más reciente.

---

## Fase 5: Historia de Usuario 3 — Restaurar está probado (P1)

**Objetivo**: FR-010 a FR-013.

**Prueba independiente**: `backup check` restaura la copia más reciente en un PostgreSQL efímero, compara y borra el directorio. Una copia dañada o con conteos distintos deja `failed` y su fila. `backup restore` se niega sobre una base con tablas.

- [X] T017 [US3] Crear `backend/internal/backup/restore.go`.
  - Interfaz `Restorer`: `RestoreAndCount(ctx, r io.Reader) (map[string]int64, error)`.
  - `EphemeralRestorer`:
    1. `os.MkdirTemp`;
    2. `initdb -D <dir>/data -U postgres --auth=scram-sha-256 --pwfile=<dir>/pwfile --encoding=UTF8 --locale=C` (contraseña aleatoria de la corrida);
    3. `pg_ctl -D … -l <dir>/server.log -o "-c listen_addresses=127.0.0.1 -c unix_socket_directories= -p <puerto libre>" -w start` (research R6: el socket Unix no arranca en Windows);
    4. `createdb -h 127.0.0.1 -p <puerto> restore_check`;
    5. `pg_restore --exit-on-error --no-owner -d restore_check`, con el lector en la entrada estándar;
    6. contar las tablas de `public`;
    7. `pg_ctl stop -m fast`;
    8. **`defer os.RemoveAll(dir)` siempre**.
  - `CompareCounts(expected, got) []Mismatch`: mismas tablas y conteos iguales; devuelve solo nombres y números.

  Pruebas en `restore_test.go`: `CompareCounts` (tabla faltante, sobrante, conteo distinto) y que el directorio se borra aunque falle (con un `exec` falso).
- [X] T018 [US3] En `service.go`, `RunCheck(ctx) (*Run, error)`:
  1. `LatestValidBackup(env)`;
  2. `repo.Start(check)`;
  3. `store.Get` → `Decrypt(check identity)` → `restorer.RestoreAndCount`;
  4. `CompareCounts` con `run.table_counts`.

  Si todo cuadra, `FinishOK(checked_run_id, counts)`. Si no, `FinishFailed(download|decrypt|restore|verify)` + `Report`. Pruebas en `service_test.go` con fakes: los cuatro caminos de falla y el éxito.
- [X] T019 [US3] En `service.go`, `Restore(ctx, ownerKeyPath, objectKey|"latest", targetURL)`:
  - lee la identidad del archivo;
  - se niega si `targetURL` tiene alguna tabla en `public` («la base destino no está vacía: restaura siempre en una base nueva»);
  - baja, descifra y corre `pg_restore --exit-on-error --no-owner -d <target>`;
  - cuenta y compara con `table_counts` de esa copia, si la base de `backup_runs` es accesible.

  Pruebas en `service_test.go`: la base con tablas se rechaza, una llave equivocada no abre y la comparación funciona.
- [X] T020 [US3] En `cmd/backup/main.go`: `run` corre `RunCheck` después de la retención si el día de hoy en `America/Mexico_City` es `BACKUP_CHECK_WEEKDAY`. Agregar los subcomandos `check`, `list` (llave, tamaño y si es `ok` según `ValidObjectKeys`), `restore --key --object --target` y `keygen` (la pública y luego la privada con su advertencia, contracts/cli.md).
- [X] T021 [US3] Escribir en `DEPLOY.md` una sección nueva **«Respaldos de la base (spec 069)»**:
  - qué se respalda, cuándo y dónde;
  - los pasos del dueño (research R13: bucket y token de R2 limitado, `keygen` de las dos llaves, dónde guardar la privada y su segunda copia, la `0036`, el servicio `backup` con `railway.backup.json` y sus variables);
  - el **procedimiento de restauración paso a paso**: crear una base **nueva**, `restore --key … --object latest` con `BACKUP_RESTORE_TARGET`, revisar el resultado y solo después cambiar `DATABASE_URL` del API;
  - cómo cambiar una llave;
  - qué hacer si una llave se pierde;
  - cuánto se espera que ocupe y cómo ver el uso de R2.

  Quitar «Respaldos de la base» de la lista de faltas para producción.

---

## Fase 6: Historia de Usuario 4 — Lo mismo en DEV y en producción, y el resumen semanal (P2)

**Objetivo**: FR-015, FR-016 y la línea del digest.

**Prueba independiente**: las copias de dos ambientes quedan separadas por el prefijo, y el resumen semanal dice el último respaldo y la última comprobación, o «ninguno en los últimos 2 días».

- [X] T022 [US4] En `backend/internal/errordigest/`:
  - una interfaz opcional `BackupStatus { LastOK(ctx, kind string) (*time.Time, error) }`;
  - `Build` la consulta si está y guarda `LastBackup`/`LastCheck` en `Digest`;
  - `Render` agrega la línea de contracts/cli.md:
    - «Respaldos: último el 12 nov a las 03:00 · comprobación el 10 nov a las 03:06» (hora de Ciudad de México);
    - «Respaldos: ninguno en los últimos 2 días» sin un `backup ok` en 48 h;
    - «Respaldos: sin registros» con la tabla vacía.
  - Sin `BackupStatus`, no hay línea.

  Pruebas en `content_test.go` y en la de privacidad del digest.
- [X] T023 [US4] En `backend/cmd/api/main.go`, pasarle al digest `backup.NewRepository(pool)` como `BackupStatus`. Pruebas: las del digest con un fake.

---

## Fase 7: Pulido

- [X] T024 Crear `backend/internal/backup/backup_integration_test.go` con `//go:build integration`, que necesita `pg_dump`, `pg_restore`, `initdb` y `pg_ctl` 18 en el `PATH` y `DATABASE_URL`:
  - `RunBackup` real de la base de pruebas a `MemoryStore`;
  - `RunCheck` real (PostgreSQL efímero);
  - conteos iguales;
  - el directorio temporal ya no existe;
  - el objeto empieza con `age-encryption.org/v1`.

  Correrla en local; queda fuera de CI.
- [X] T025 Correr `cd backend && go vet ./... && go test ./... -cover`: `internal/backup` por encima del 90 %, más `govulncheck ./...` y `gofmt -l`.
- [X] T026 [P] Documentos:
  - `CLAUDE.md`: entrada de la spec 069.
  - `backend/CLAUDE.md`: `internal/backup`, `cmd/backup`, `Dockerfile.backup`, `railway.backup.json`, la `0036` y la regla «la llave privada del dueño nunca en un sistema».
  - `BACKLOG.md`:
    - marcar «Respaldos de la base» como hecho;
    - anotar los pendientes del dueño (R2, llaves, la `0036` en DEV, el servicio de Railway, la restauración de prueba y el aviso de privacidad);
    - anotar el respaldo continuo como idea si alguna vez hace falta perder menos de un día.
- [X] T027 Poner `Estado: Implementada` en `spec.md` y dejar el resumen del PR. El commit y el PR solo cuando el dueño lo pida.

---

## Dependencias y orden

- **T001** → todo lo demás. **T002** antes de T007.
- **Fase 2**: T003, T004, T005, T006 y T008 en paralelo; T007 después de T002.
- **US1** (T009–T014) depende de la Fase 2. Es el MVP.
- **US2** (T015, T016): T015 solo depende de T004; T016, de T011.
- **US3** (T017–T021) depende de US1: necesita copias.
- **US4** (T022, T023) depende de T007.
- **Pulido** al final.

## Ejemplos en paralelo

- Fase 2: `config.go`, `naming.go`, `crypt.go`, `report.go` y `store.go` son archivos distintos.
- US1: `Dockerfile.backup` (T013) y `railway.backup.json` (T014) en paralelo con T011.
- US2 (T015) puede ir en paralelo con US1.

## Estrategia de implementación

1. **MVP = Fases 1–3**: una copia diaria cifrada en R2, con su registro y su aviso de falla. Ya protege los datos aunque falte lo demás.
2. Luego la retención (US2), para que el costo no crezca.
3. Luego la restauración probada (US3), la parte que convierte el respaldo en una garantía.
4. El resumen semanal (US4) y la integración real.

## Cobertura de los requisitos

| Requisito | Tareas |
|---|---|
| FR-001 diario | T014, T012 |
| FR-002 coherente | T009, T011 |
| FR-003 cifrado | T005, T011 |
| FR-004 R2 limitado | T008, T021 |
| FR-005 nombre | T004 |
| FR-006 dentro de Railway, una a la vez | T010, T013, T014 |
| FR-007 sin disco | T011, T017 |
| FR-008 retención | T015, T016 |
| FR-009 nunca la última | T015, T016 |
| FR-010 procedimiento | T019, T021 |
| FR-011 comprobación semanal | T017, T018, T020 |
| FR-012 solo conteos | T017, T006 |
| FR-013 llave de comprobación | T003, T005, T018 |
| FR-014 fallas | T006, T011, T018 |
| FR-015 resumen | T022, T023 |
| FR-016 ambientes | T003, T004 |
| FR-017 la app no cambia | (nada en el frontend; el API solo pasa una fuente al digest) |
