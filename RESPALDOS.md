# Respaldos de la base (spec 069)

Guía para activar y usar los respaldos diarios de la base. El código está en `backend/cmd/backup` y
`backend/internal/backup`; el diseño, en `specs/069-respaldos-base/`.

> **Estado (2026-11-12): pendiente de activar.** Nada de esto corre todavía en DEV ni en producción. El primer paso
> (Cloudflare R2) pide registrar un método de pago en Cloudflare, y el dueño lo hará cuando tenga sus datos a la mano.
> Mientras tanto **no hay respaldos**. El pendiente está en `BACKLOG.md` («Respaldos de la base»).
>
> **Sin la infraestructura nada falla.** El código está en `develop` pero apagado: el servicio `backup` no existe, así que
> nada corre cada noche, y el API no lee ni menciona los respaldos mientras no tenga **`BACKUPS_ENABLED=true`** (el
> interruptor del paso 6). Tampoco hace falta aplicar la `0036` hasta activarlos.
>
> No hace falta una base de datos nueva en Railway: las copias van a un bucket de R2 (otro proveedor) y en Railway solo se
> agrega un **servicio** que corre cada noche. Si se creó una base Postgres para esto, no la usa nada y se puede borrar.


**Qué, cuándo y dónde.** Todos los días a las **03:00 de Ciudad de México** (`0 9 * * *` UTC) un servicio aparte de Railway, `backup`, copia **toda** la base con `pg_dump`, la **cifra antes de que salga del proceso** y la sube a **Cloudflare R2** (bucket `peditrack-backups`) como `dev/AAAA-MM-DDThhmmssZ.dump.age` (hora UTC). El nombre solo tiene el ambiente y la hora: ningún dato de las familias. Nada se escribe en disco. Se guardan las 7 copias diarias, las 4 semanales y las 6 mensuales (como máximo 17); la más reciente nunca se borra. Solo cuentan las copias que `backup_runs` registra como terminadas: un objeto sin registro (una corrida que murió después de subir) nunca ocupa el lugar de una copia buena y la retención no lo toca. Los **lunes**, después del respaldo, la **comprobación** restaura la copia nueva en un PostgreSQL desechable dentro del mismo contenedor y revisa que estén las mismas tablas con los mismos conteos. Si no se puede restaurar o los conteos no cuadran, esa copia deja de ser «la última buena»: `restore --object latest` y la siguiente comprobación toman la anterior. Cada corrida queda en `backup_runs`; una falla deja una fila `job:backup` en `error_logs` (mensaje fijo, sin direcciones ni llaves) y el resumen del lunes trae la línea «Respaldos: último el … · comprobación el …».

**Dos llaves.** Cada copia se cifra (age, X25519) para **dos** destinatarios:

- **La tuya.** La privada **no vive en ningún sistema**: ni en Railway, ni en el repositorio, ni en R2, ni en el chat. Solo tú la tienes, en tu gestor de contraseñas y en una segunda ubicación segura (por ejemplo, impresa en un sobre o en una memoria USB guardada aparte).
- **La de comprobación.** Su privada vive **solo** en la variable `BACKUP_CHECK_IDENTITY` del servicio `backup`. La usa la comprobación semanal. Nunca la copies a tu computadora ni al servicio del API.

### Pasos del dueño (una vez por ambiente)

1. **Bucket y token de R2.** En Cloudflare → *R2* → *Create bucket* `peditrack-backups` (sin acceso público ni dominio). Después *Manage R2 API Tokens* → *Create API token* con permiso **Object Read & Write** y **limitado a ese bucket**. Anota el *Account ID*, el *Access Key ID* y el *Secret Access Key* (este último solo se muestra una vez). Para restaurar desde tu computadora conviene un **segundo token de solo lectura** (*Object Read only*) del mismo bucket.
2. **Tus dos llaves**, en tu computadora (con Go instalado), desde `backend/`:

   ```bash
   go run ./cmd/backup keygen
   ```

   La primera vez es **tu** llave: guarda la línea `AGE-SECRET-KEY-1…` en tu gestor de contraseñas y en la segunda ubicación. Anota la línea `age1…` (pública).

   ```bash
   go run ./cmd/backup keygen
   ```

   La segunda vez es la **de comprobación**: su línea `AGE-SECRET-KEY-1…` va directo a Railway (paso 4) y no se guarda en otro lado. La pública no hace falta: se deriva sola.
3. **Migración `0036`** (`backup_runs`) en la base de DEV, con el mismo método de las anteriores (script de `node`/`pg`, no `psql`). Sin ella el respaldo falla al registrar la corrida; el API no la necesita.
4. **El servicio `backup` en Railway.** En el proyecto: *New* → *GitHub Repo* → el mismo repositorio y la rama `develop`. En *Settings*:
   - *Root Directory*: `/backend`;
   - *Config-as-code* (*Railway Config File*): `/backend/railway.backup.json`. Eso fija `Dockerfile.backup`, el horario `0 9 * * *` y que no se reinicie al terminar;
   - sin dominio público (no atiende peticiones).

   Variables:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (la referencia al Postgres del proyecto, por la red interna) |
   | `BACKUP_ENV` | `dev` (en producción, `prod`) |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Los del token de lectura y escritura del paso 1 |
   | `R2_BUCKET` | Opcional; por omisión `peditrack-backups` |
   | `BACKUP_OWNER_RECIPIENT` | Tu llave **pública** (`age1…`) |
   | `BACKUP_CHECK_IDENTITY` | La llave **privada de comprobación** (`AGE-SECRET-KEY-1…`) |
   | `BACKUP_CHECK_WEEKDAY` | Opcional: el día de la comprobación, 0 = domingo … 6 = sábado (por omisión 1, lunes) |

   Si falta una variable, la corrida termina con código 2, la consola dice **cuáles** faltan (nunca sus valores) y queda una fila `job:backup` «The backup configuration is incomplete».
5. **Probarlo.** En el servicio, *Deployments* → **Run now** (o espera a las 03:00). La consola dice «respaldo dev listo: dev/…, N MB, N tablas»; en R2 aparece el objeto y en `backup_runs` una fila `backup` `ok`. Para forzar la comprobación, cambia temporalmente `BACKUP_CHECK_WEEKDAY` al día de hoy y vuelve a correrlo.
6. **Encender el aviso en el resumen semanal.** En el servicio del **API** (`medic-track`, no en `backup`) agrega `BACKUPS_ENABLED=true`. Desde el siguiente lunes el correo de errores trae «Respaldos: último el … · comprobación el …», o «ninguno en los últimos 2 días» si el respaldo dejó de correr. Ponlo solo cuando los pasos 1 a 5 estén hechos: antes, la línea solo diría que no hay respaldos.
6. **Una restauración de prueba** (abajo), para saber que tu llave abre las copias y cuánto tarda (debe ser menos de una hora).
7. **Aviso de privacidad**: mencionar que hay copias cifradas de la base en Cloudflare R2.

### Restaurar, paso a paso

Se restaura **siempre en una base nueva y vacía**: `restore` se niega si la base destino tiene alguna tabla. Nunca sobre la base viva.

Hace falta tu computadora con **Go** y las herramientas de **PostgreSQL 18** (`pg_restore` debe ser igual o más nuevo que el servidor de la copia), y el archivo de **tu llave privada** (un `.txt` con la línea `AGE-SECRET-KEY-1…`; las líneas con `#` se ignoran). Borra ese archivo al terminar.

1. **Crea la base destino.** Para producción o un incidente, un Postgres **nuevo** en Railway (*New* → *Database* → *PostgreSQL*) y su URL pública. Para practicar, una local:

   ```bash
   createdb -h localhost -U root -E UTF8 -T template0 peditrack_restore_test
   ```

2. **Variables en tu terminal** (las de R2, de preferencia con el token de solo lectura). `DATABASE_URL` de la base **viva** es opcional: con ella `latest` es la última copia buena (terminada y sin una comprobación fallida) y al final se comparan los conteos; sin ella (por ejemplo, si lo que se perdió es la base) `latest` es la copia más nueva de R2, aunque nada la haya registrado, y no se compara nada.

   ```bash
   export BACKUP_ENV=dev R2_ACCOUNT_ID='…' R2_ACCESS_KEY_ID='…' R2_SECRET_ACCESS_KEY='…'
   ```

   La base destino va en `BACKUP_RESTORE_TARGET`, **nunca en la línea del comando**: así su clave no queda en el historial de la terminal ni a la vista de otros programas. Con `read -rs` se pega sin que se vea ni se guarde:

   ```bash
   read -rs BACKUP_RESTORE_TARGET && export BACKUP_RESTORE_TARGET
   ```

   Pega la URL completa de la base nueva (`postgres://usuario:clave@host:puerto/base`) y pulsa Enter. `restore` le pasa la clave a `pg_restore` por su entorno, no por sus argumentos.

3. **Ver las copias**, desde `backend/`:

   ```bash
   go run ./cmd/backup list
   ```

   Cada copia dice `ok`, «la comprobación falló: no la uses» o «sin registro de éxito: no la uses».

4. **Restaurar** (la última, u otra por su nombre en lugar de `latest`):

   ```bash
   go run ./cmd/backup restore --key ~/peditrack-backup-owner.txt --object latest
   ```

   Lo esperado: «restauración completa: dev/…, N tablas, conteos iguales». Si dice que hay tablas que no cuadran, **no la uses** y prueba con la copia anterior.
5. **Revisar** la base restaurada: entra con `psql`, cuenta un par de tablas que conozcas y, si puedes, apunta un API de prueba a ella.
6. **Solo después**, en el servicio del API de Railway, cambia `DATABASE_URL` a la base nueva y vuelve a desplegar. Cambia también la referencia del servicio `backup`.
7. Lo que pasó entre la copia (03:00) y el incidente **no está** en la copia: se pierde como máximo un día.
8. Cierra la terminal (o `unset BACKUP_RESTORE_TARGET`) y borra el archivo de tu llave.

### Cambiar una llave

- **La tuya**: genera otra con `keygen`, pon su pública en `BACKUP_OWNER_RECIPIENT` y **conserva la privada anterior** hasta que la retención borre la última copia cifrada con ella (6 meses), o hasta que ya no la necesites. Las copias viejas no se vuelven a cifrar.
- **La de comprobación**: genera otra, pon su privada en `BACKUP_CHECK_IDENTITY` y corre **Run now** para que haya una copia cifrada con ella antes de la siguiente comprobación. Una comprobación manual de una copia anterior al cambio fallará.

### Si se pierde o se filtra una llave

- **Perdiste la tuya**: las copias siguen protegidas y la comprobación las sigue abriendo. Genera una nueva **ya** y cambia `BACKUP_OWNER_RECIPIENT`. Las copias anteriores solo las abre la llave de comprobación. Si en ese tiempo necesitaras restaurar una, es una emergencia: copia esa llave de Railway a un archivo en tu computadora solo para usarla en `restore --key`, bórrala al terminar y **cámbiala** después (como abajo). Desde la siguiente corrida hay copias con tu llave nueva.
- **Se filtró una llave** (la tuya o la de comprobación): quien la tenga **todavía necesita acceso a R2** para leer una copia. Cámbiala como arriba, rota también el token de R2 y, si sospechas que alguien tuvo las dos cosas, trátalo como un incidente de datos (aviso de privacidad / LFPDPPP).
- **Perdiste las dos**: las copias existentes ya no se pueden abrir. Genera llaves nuevas; desde la siguiente corrida hay copias útiles.

### Espacio y costo

Una copia comprimida y cifrada de DEV pesa hoy decenas de MB (la base local de pruebas, 70 MB); con 17 copias como máximo se mantiene muy por debajo de los **10 GB gratuitos** de R2, y R2 no cobra la salida de datos. El uso se ve en Cloudflare → *R2* → *peditrack-backups* → *Metrics*. Las fotos (`bytea`) son lo que más pesa: si la base crece mucho, ver «Fotos en Postgres» en `BACKLOG.md`. En Railway el servicio `backup` solo cobra los minutos que corre cada noche.

### Si algo falla

`GET /ops/error-logs?endpointPrefix=job:backup` (mensajes fijos: configuración incompleta, candado, instantánea, volcado, cifrado, subida, registro en la base, retención, descarga, descifrado, restauración o conteos distintos) y la consola de la corrida en Railway. Una corrida que no consigue el candado porque otra sigue en curso termina sin hacer nada y sin falla.
