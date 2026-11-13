# Modelo de Datos: Respaldos de la base (spec 069)

## Tabla `backup_runs` (migración `0036_backup_runs.sql`)

Una fila por corrida de respaldo o de comprobación. **Nunca** datos de las familias: solo nombres de tablas, números y códigos fijos.

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK, `gen_random_uuid()` | |
| `kind` | `text` NOT NULL, CHECK `kind IN ('backup','check')` | |
| `env` | `text` NOT NULL, CHECK `env ~ '^[a-z]{2,12}$'` | `dev`, `prod`… (`BACKUP_ENV`) |
| `started_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `finished_at` | `timestamptz` NULL | Al terminar, bien o mal. |
| `status` | `text` NOT NULL DEFAULT `'running'`, CHECK `status IN ('running','ok','failed')` | `running` mientras corre; una corrida que muere a medias se queda así y nunca cuenta como copia válida. |
| `failure` | `text` NULL, CHECK `failure IN ('config','lock','snapshot','dump','encrypt','upload','retention','download','decrypt','restore','verify','record')` | Solo con `status = 'failed'`. |
| `object_key` | `text` NULL, CHECK `object_key ~ '^[a-z]{2,12}/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{4}Z\.dump\.age$'` | El objeto en R2 (respaldo) o el comprobado (comprobación). |
| `size_bytes` | `bigint` NULL, CHECK `>= 0` | Tamaño cifrado. |
| `table_counts` | `jsonb` NULL | `{"accounts": 120, "doses": 5300, …}`: filas por tabla en el instante de la copia (respaldo) o tras restaurar (comprobación). |
| `checked_run_id` | `uuid` NULL REFERENCES `backup_runs(id)` | En una comprobación (buena o fallida), el respaldo comprobado. Un respaldo cuya comprobación más reciente falló en `restore` o `verify` deja de ser válido: `LatestValidBackup` lo salta y `ObjectStates` lo marca `check_failed`. Una comprobación posterior que pasa lo vuelve válido. |

CHECK de forma:
- `status = 'ok'` exige `finished_at`, `object_key`; en un `backup`, también `size_bytes` y `table_counts`.
- `status = 'failed'` exige `failure` y `finished_at`.

Índice: `(kind, env, status, started_at DESC)`, para la última copia válida, el último éxito y la última comprobación.

Retención de la tabla: las filas son pocas (una o dos por día) y no se borran en esta spec.

## Transiciones

```text
backup:  running ──(subida completa, conteos guardados)──► ok
            └──(cualquier paso falla)──► failed(<paso>) + fila en error_logs (job:backup)
            └──(el proceso muere)──► se queda running: nunca válida

check:   running ──(restaurada, mismas tablas, mismos conteos)──► ok
            └──(falla)──► failed(download|decrypt|restore|verify) + fila en error_logs
```

## Objeto en R2

| Campo | Valor |
|---|---|
| Bucket | `R2_BUCKET` (por omisión `peditrack-backups`), privado |
| Llave | `<env>/<AAAA-MM-DD>T<hhmmss>Z.dump.age` (hora UTC de inicio, al segundo: dos corridas en un mismo minuto no comparten nombre) |
| Contenido | `pg_dump --format=custom` del esquema `public`, cifrado con age para dos destinatarios (dueño y comprobación) |
| Metadatos | solo `x-amz-meta-env` |

## Regla de retención (pura, por ambiente)

Se conserva la unión de:
- la copia más reciente de cada uno de los **7 días** más recientes con copia (hora de Ciudad de México);
- la más reciente de cada una de las **4 semanas ISO** más recientes con copia;
- la más reciente de cada uno de los **6 meses** más recientes con copia;
- y siempre la más reciente de todas.

Solo cuentan las copias **registradas** como respaldos terminados en `backup_runs`. Se borra el resto de las registradas. Un objeto cuyo nombre no tiene el formato, de otro ambiente o **sin registro** no se toca: nunca ocupa el lugar de una copia buena.

## Configuración del servicio `backup` (variables de Railway)

| Variable | Contenido | Dónde vive |
|---|---|---|
| `DATABASE_URL` | Referencia al Postgres del proyecto (red interna) | Servicio `backup` |
| `BACKUP_ENV` | `dev` / `prod` | Servicio `backup` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Token limitado al bucket | Servicio `backup` |
| `BACKUP_OWNER_RECIPIENT` | Llave **pública** del dueño (`age1…`) | Servicio `backup` |
| `BACKUP_CHECK_IDENTITY` | Llave **privada** de comprobación (`AGE-SECRET-KEY-1…`) | **Solo** el servicio `backup` |
| `BACKUP_CHECK_WEEKDAY` | Día de la comprobación, `1` = lunes (por omisión) | Servicio `backup` |

La llave privada del dueño **no está en ninguna variable**.
