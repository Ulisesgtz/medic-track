# Investigación: Respaldos de la base (spec 069)

Decisiones del dueño (2026-11-12): **7 diarias, 4 semanales y 6 mensuales**, **Cloudflare R2**, **dentro de Railway** y la **llave de comprobación aceptada**. Lo que sigue es cómo cumplirlas con lo que ya hay.

## Lo que hay hoy

- El backend es un solo binario Go (`cmd/api`) en Railway, construido con `backend/Dockerfile` (distroless, sin `pg_dump`). La base es el servicio PostgreSQL 18 del mismo proyecto, en la red interna de Railway (`DEPLOY.md`).
- Los procesos en segundo plano reportan con `internal/jobreport` (spec 018). Escribe la fila de `error_logs` **en una goroutine**, sirve para el API que vive siempre, y **no** para un proceso que termina en segundos (la fila se perdería).
- El resumen semanal (`internal/errordigest`, spec 039) arma su contenido de `errorlog.Summary`/`Stats` mediante la interfaz `Source`.
- La puerta de cobertura corre `go test ./internal/...`, así que un `cmd/` nuevo queda fuera igual que `cmd/api`.
- Las migraciones se aplican a mano en DEV antes del merge (la última es la `0035`).

## R1 — Un proceso aparte en Railway, programado (cron)

**Decisión**: un binario nuevo **`cmd/backup`** del mismo módulo, desplegado como **segundo servicio de Railway** (`backup`) con su propia imagen (`backend/Dockerfile.backup`) y configuración (`backend/railway.backup.json`, con `deploy.cronSchedule: "0 9 * * *"` = 03:00 de Ciudad de México, sin horario de verano). Railway lo arranca a esa hora, el proceso hace su trabajo y **termina**, y si la corrida anterior sigue viva no arranca otra. Llega a la base por la **red interna** (`DATABASE_URL` como variable de referencia del servicio Postgres, `postgres.railway.internal`). Las credenciales de R2 y la llave de comprobación viven **solo en ese servicio**, nunca en el del API.

**Justificación**: es la opción A del dueño. La base no se abre más, el API no carga con `pg_dump` ni con llaves, y una falla del respaldo no toca la app (FR-017).

**Alternativas**: un ticker dentro del API (descartado: las llaves de R2 y de comprobación quedarían en el proceso expuesto a internet, y el API distroless no tiene `pg_dump`); GitHub Actions (rechazado por el dueño, opción B).

## R2 — La imagen: PostgreSQL 18 de Alpine

**Decisión**: `Dockerfile.backup` compila `cmd/backup` (`golang:1.27-alpine`, `CGO_ENABLED=0`) y lo copia a **`postgres:18-alpine`**. Ahí ya vienen `pg_dump`, `pg_restore`, `initdb`, `pg_ctl` y `postgres` de la **misma versión mayor** que el servidor. Corre como el usuario `postgres`, no como root: `initdb` lo exige.

**Justificación**: `pg_dump` debe ser igual o más nuevo que el servidor. La comprobación necesita un servidor PostgreSQL propio y efímero (R6).

## R3 — La copia: `pg_dump` en formato personalizado, en un solo instante y sin archivos

**Decisión**: abrir en la base viva una transacción `REPEATABLE READ READ ONLY` y exportar su instante (`pg_export_snapshot()`). Con ese instante:

1. **Contar las filas** de cada tabla del esquema `public` (solo `count(*)`; nunca se lee una fila);
2. correr `pg_dump --format=custom --snapshot=<id> --no-owner --no-privileges`.

Así la copia y los conteos son **exactamente** del mismo instante (FR-002). La salida de `pg_dump` va **en tubería** al cifrado (R4) y de ahí a la subida (R5): **nada toca el disco** (FR-007).

Además, `pg_try_advisory_lock` (una llave fija) en la base viva evita dos corridas a la vez aunque Railway las arrancara. La que no obtiene el candado termina sin hacer nada.

**Justificación**: el formato personalizado viene comprimido y `pg_restore` lo lee desde la entrada estándar. Con conteos del mismo instante, la comprobación (R6) exige **igualdad**, no «parecido».

**Alternativas**: `pg_dumpall` (descartado: incluye roles y otras bases que no se restauran en un servicio nuevo); el respaldo de volúmenes de Railway (no se cuenta con él: queda en el mismo proveedor y la misma cuenta, Supuestos).

## R4 — Cifrado con age, para dos destinatarios

**Decisión**: **`filippo.io/age` v1.3.2** (biblioteca de Go: cifrado en flujo, X25519). Cada copia se cifra para **dos destinatarios**:

- `BACKUP_OWNER_RECIPIENT`: la llave **pública** del dueño. La privada no está en ningún sistema.
- La llave **de comprobación**: su privada vive en `BACKUP_CHECK_IDENTITY`, solo en el servicio `backup`, y la pública se deriva de ella.

`cmd/backup keygen` genera un par e imprime la privada **solo en la terminal**, así el dueño no necesita instalar `age`. Una copia cifrada para age se puede abrir también con la herramienta oficial `age` si algún día no existe este código.

**Justificación**: FR-003 y FR-013. age es pequeño, auditado y sin configuración insegura posible. Con dos destinatarios, el dueño abre cualquier copia y la comprobación también, sin que la llave del dueño viva en el sistema.

**Alternativas**: GPG (más complejo y más fácil de configurar mal); el cifrado del lado del servidor de R2 (descartado: R2 tendría la llave).

## R5 — Cloudflare R2 con su API compatible con S3

**Decisión**: **`github.com/minio/minio-go/v7` v7.4.1** contra `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.

- Sube con `PutObject` en partes, con tamaño desconocido (en flujo).
- **La copia solo queda «válida» al terminar la subida**: hasta entonces la corrida está `running`, y una subida a medias no deja objeto (FR-002, casos límite).
- 3 intentos con espera ante fallas de red.
- Las credenciales son un **token de R2 limitado a ese bucket** con «Object Read & Write»: leer y borrar sirven a la retención y a la comprobación.

**Llave del objeto (FR-005)**: `<env>/<AAAA>-<MM>-<DD>T<hhmmss>Z.dump.age` (`dev/2026-11-12T090003Z.dump.age`; al segundo desde la revisión de código: con minutos, dos corridas en el mismo minuto compartían el nombre y la limpieza de una podía borrar la copia de la otra). Nada más: ni el tamaño ni los conteos van en el nombre, y en metadatos solo el ambiente.

**Alternativas**: `aws-sdk-go-v2` (más dependencias para lo mismo); la API propia de Cloudflare (no es S3 y obliga a usar el token de cuenta).

## R6 — La comprobación: restaurar en un PostgreSQL efímero dentro del mismo contenedor

**Decisión**: los **lunes**, después del respaldo (03:00), y también a mano con `cmd/backup check`, la comprobación hace esto:

1. Toma la copia más reciente **válida** de `backup_runs` (R7).
2. La baja de R2 en flujo y la descifra con `BACKUP_CHECK_IDENTITY`.
3. Arranca un **PostgreSQL efímero**: `initdb --encoding=UTF8 --locale=C --auth=scram-sha-256` con una **contraseña aleatoria de esta corrida** (32 bytes, escrita solo en el directorio temporal, que es 0700, y borrada en cuanto `initdb` la lee) y `pg_ctl start` escuchando **solo en `127.0.0.1`**, en un puerto libre elegido al momento y sin socket Unix (`unix_socket_directories=`). `createdb`, `pg_restore` y la conexión de los conteos reciben la contraseña en su entorno. Así ningún otro proceso ni usuario de la máquina (la del dueño, si corre la integración) puede leer la copia restaurada.
4. La restaura con `pg_restore --exit-on-error`.
5. Cuenta las filas de cada tabla y las compara con los conteos guardados de esa copia: **mismo conjunto de tablas y conteos iguales**.
6. Para el servidor y **borra el directorio**, salga bien o mal.

**Justificación**: no carga ni arriesga la base viva (nunca se restaura en el servidor de la app), no sale a internet salvo a R2, y el resumen del lunes (08:00) ya ve el resultado de las 03:00. Solo mira estructura y conteos (FR-012).

**Lo que se aprendió al probarlo de verdad (T024)**:

- **Socket Unix**: se descartó porque en Windows (donde el dueño corre la integración) `pg_ctl` no arranca con `listen_addresses=''`. Con `127.0.0.1` se comporta igual en Linux y en Windows.
- **UTF8 explícito**: sin él, `initdb` toma la codificación del sistema (WIN1252 en Windows) y un emoji en unas notas hace fallar la restauración.
- **`pg_dump` sin `--schema=public`**: con esa opción la copia trae `CREATE SCHEMA public`, que choca con el esquema que toda base nueva ya tiene. La copia es de la base completa; los conteos siguen siendo de las tablas de `public`.
- **Espera de los programas**: `pg_ctl start` deja el servidor vivo, y si hereda una tubería del proceso (la del stderr), `Wait` espera a que el servidor termine. Primero se acotó la espera (`WaitDelay`), pero la revisión de código vio que eso daba por buena una copia **cortada**: si `pg_dump` terminaba mientras la subida de una parte tardaba más de 5 s, el final se perdía. El arreglo de raíz es que `ExecRunner` **no cree tuberías** para lo que descarta (stderr y un stdout que nadie lee van al dispositivo nulo); el servidor escribe su registro en un archivo del directorio temporal.
- Con la base local (70 MB cifrados, 40 tablas), el respaldo tarda unos 7 s y la comprobación unos 28 s.

**Alternativas**: restaurar en una base temporal del servidor de Railway (descartado: carga de más en la base viva y una copia completa de los datos en el mismo servidor); restaurar fuera de Railway (descartado: la llave de comprobación saldría del servicio).

## R7 — Las corridas en la base: tabla `backup_runs` (migración `0036`)

**Decisión**: una fila por corrida, `kind` (`backup`/`check`), `env`, `started_at`, `finished_at`, `status` (`running`/`ok`/`failed`), `failure` (un código fijo), `object_key`, `size_bytes`, `table_counts` (jsonb: nombre de tabla → número) y, en las comprobaciones, `checked_run_id`. **Nunca** datos de las familias: solo nombres de tablas y números.

**Justificación**: la comprobación necesita saber cuál copia está completa y qué conteos esperar. La retención no debe borrar la última buena. El resumen semanal dice la fecha del último éxito (FR-015).

## R8 — Avisos de falla: una fila síncrona en `error_logs`

**Decisión**: el proceso escribe la fila de falla **de forma síncrona** con `errorlog.Repository.Create`, porque `jobreport` la escribe en una goroutine y un proceso que termina la perdería.

- Usa `endpoint = "job:backup"` (el prefijo `jobreport.EndpointPrefix`), sin estado HTTP, con archivo y línea.
- El mensaje es fijo y por tipo: `config`, `lock`, `snapshot`, `dump`, `encrypt`, `upload`, `retention`, `download`, `decrypt`, `restore`, `verify`, por ejemplo «The backup could not be uploaded to the storage».
- **Nunca** el texto de error de terceros, la URL, la llave del objeto ni credenciales (FR-014).
- Un éxito no escribe nada.
- Sin configuración completa, el proceso escribe **una** fila `config` y termina con error, así se ve en el resumen.

## R9 — El resumen semanal dice cuándo fue el último respaldo

**Decisión**: `errordigest` gana una fuente opcional, `BackupStatus` (`LastOK(ctx, kind) (*time.Time, error)`), que implementa `internal/backup.Repository`. `Render` agrega una línea fija:

- «Respaldos: último el 12 nov a las 03:00 · comprobación el 10 nov a las 03:06».
- «Respaldos: ninguno en los últimos 2 días» cuando no hay un `ok` reciente.
- «Respaldos: sin registros» cuando la tabla está vacía.

Las fallas ya salen en la sección de procesos (`job:backup`).

## R10 — La retención: una función pura

**Decisión**: `Keep(objects, now) (keep, delete)`:

- conserva el objeto más reciente de cada uno de los **últimos 7 días** con copia, de las **últimas 4 semanas ISO** y de los **últimos 6 meses**, en hora de Ciudad de México;
- **nunca** borra el más reciente;
- solo mira los objetos con nombre del formato de R5, del mismo ambiente **y registrados en `backup_runs` como respaldos terminados**: cualquier otro objeto (de otro ambiente, con otro nombre o sin registro, como el de una corrida que murió después de subir) **no se toca** y nunca ocupa el lugar de una copia buena.

Corre después de cada respaldo exitoso (FR-008, FR-009). Con 7 + 4 + 6 quedan como máximo 17 copias (menos cuando coinciden).

## R11 — Restaurar a mano: `cmd/backup restore`

**Decisión**: el procedimiento de `DEPLOY.md` usa `go run ./cmd/backup restore --key <archivo de la llave del dueño> --object <llave|latest>`, con la URL de una base nueva en `BACKUP_RESTORE_TARGET` (capturada con `read -rs`: nunca en la línea del comando, que queda en el historial). La clave de esa URL llega a `pg_restore` como `PGPASSWORD` en su entorno (`SplitPassword`), igual que la de `DATABASE_URL` a `pg_dump`. Baja, descifra con la llave del dueño, **se niega si la base destino ya tiene tablas** (casos límite: nunca sobre la viva) y restaura. Después compara los conteos con los guardados de esa copia.

Esto requiere el **mismo** `pg_restore` 18 en la computadora del dueño, o correr el mismo contenedor. El procedimiento da ambos caminos.

`cmd/backup list` muestra las copias (ambiente, fecha y tamaño). La llave se lee de un archivo, nunca de un argumento ni de una variable que quede en el historial de la terminal.

`latest` es la última copia **buena**: terminada y sin una comprobación más reciente que haya fallado en `restore` o `verify`.

`list` y `restore` usan una configuración **de solo lectura** (`LoadReadConfig`): `BACKUP_ENV` y las variables `R2_*`, **sin ninguna llave** (la de comprobación nunca sale del servicio `backup`) y con `DATABASE_URL` **opcional**. Sin la base viva —que puede ser justo lo que se perdió—, `latest` es la copia más nueva del ambiente según su nombre en R2, y no hay conteos contra qué comparar. Ni `list` ni `restore` escriben en `error_logs`.

## R12 — Pruebas

- **Unitarias** (`internal/backup`, más del 90 %):
  - la retención, con tablas de fechas;
  - el nombre del objeto;
  - el cifrado y descifrado con dos destinatarios, y que cada llave sola abre;
  - la orquestación con *fakes* de `Store`, `Dumper` y `Restorer`: éxito, cada falla deja su fila y su `status`, y la limpieza del directorio siempre ocurre;
  - la comparación de conteos;
  - que los mensajes de falla no contienen URL, llaves ni texto ajeno (prueba de privacidad);
  - el repositorio contra la base de pruebas.
- **De integración local** (`backup_integration_test.go`, con la etiqueta `integration`, fuera de CI): con un PostgreSQL y `pg_dump` locales, hace la copia de la base de pruebas a un `Store` en memoria, la restaura en un servidor efímero y compara. La corre el dueño o quien tenga `pg_dump` 18.
- **Digest**: la línea nueva en `content_test.go`.
- No hay E2E: la app no cambia (FR-017).

## R13 — Pasos del dueño (en `DEPLOY.md`)

1. En Cloudflare, crear el bucket R2 `peditrack-backups` (sin acceso público) y un token de API **limitado a ese bucket** con «Object Read & Write».
2. En su computadora, generar su llave con `go run ./cmd/backup keygen`, guardar la privada en su gestor de contraseñas y en una segunda ubicación, y anotar la pública.
3. Generar la llave de comprobación con `keygen` y pegar su privada en Railway, solo en el servicio `backup`.
4. Aplicar la migración `0036` en DEV.
5. Crear en Railway el servicio `backup` desde el mismo repositorio, con la ruta de configuración `backend/railway.backup.json`, y sus variables:
   - `DATABASE_URL` como referencia al Postgres;
   - `BACKUP_ENV=dev`;
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`;
   - `BACKUP_OWNER_RECIPIENT`;
   - `BACKUP_CHECK_IDENTITY`.
6. Correrlo una vez a mano y seguir el procedimiento de restauración en una base de prueba (SC-003).
