# Contrato: `cmd/backup` (spec 069)

Un binario con subcomandos. Sin API HTTP ni pantallas: la app no cambia (FR-017). Los textos de consola van en español, sin datos de las familias, y nunca imprimen una llave privada salvo `keygen`, que la genera.

## `backup run` (lo que corre el cron de Railway)

1. Lee la configuración (`data-model.md`). Si falta algo, escribe una fila `job:backup` `config` y sale con código 2.
2. Toma el candado de la base. Si otra corrida lo tiene, sale con 0 sin escribir nada.
3. Hace el respaldo: instante → conteos → `pg_dump` → cifrar → subir → `backup_runs.status = 'ok'`.
4. Aplica la retención en R2 (solo los objetos de su ambiente).
5. Si hoy es `BACKUP_CHECK_WEEKDAY` en Ciudad de México, corre la comprobación de la copia recién hecha.
6. Sale con 0 si todo salió bien y con 1 si algo falló. Cada falla dejó su fila en `error_logs` y su `status`.

**Consola**: una línea por paso, como «respaldo dev listo: dev/2026-11-12T090003Z.dump.age, 48.0 MB, 61 tablas». Sin URLs ni llaves.

## `backup check`

Lo mismo que el paso 5, sobre la copia válida más reciente del ambiente. Sale con 0 o con 1.

## `backup list`

Las copias del ambiente en R2, de la más nueva a la más vieja: llave, tamaño y su estado en `backup_runs`: `ok`, «la comprobación falló: no la uses» o «sin registro de éxito: no la uses» (sin `DATABASE_URL`: «sin registro (no hay DATABASE_URL)»).

## `backup restore --key <archivo> --object <llave|latest>` (base destino en `BACKUP_RESTORE_TARGET`)

Para el dueño, desde su computadora o desde un contenedor con la misma imagen:

1. Lee la llave **privada del dueño** desde `--key`, un archivo. Nunca la acepta por argumento ni por variable.
2. Lee la URL de la base destino de `BACKUP_RESTORE_TARGET`, **nunca de un argumento** (quedaría en el historial y a la vista de los demás procesos). La clave de esa URL, y la de `DATABASE_URL` en `pg_dump`, viajan a los programas como `PGPASSWORD` en su entorno, no en sus argumentos.
3. Se niega si la base destino ya tiene alguna tabla en `public` («la base destino no está vacía: restaura siempre en una base nueva»).
4. Baja, descifra y restaura con `pg_restore --exit-on-error --no-owner`. `latest` es la última copia buena: terminada y sin una comprobación fallida.
5. Compara los conteos con los guardados de esa copia, si la base viva sigue accesible, e imprime «restauración completa: 61 tablas, conteos iguales» o la lista de tablas que no cuadran (solo nombres y números).

Requiere R2 (las variables `R2_*`) y `BACKUP_ENV`. **No pide ninguna llave en variables**. `DATABASE_URL` es opcional: sin ella, `latest` es la copia más nueva del ambiente en R2 y no se comparan conteos. `list` funciona igual. Ninguno de los dos escribe en `error_logs`.

## `backup keygen`

Imprime un par nuevo:

```text
# llave pública (va en BACKUP_OWNER_RECIPIENT, o se deriva sola para la de comprobación)
age1…
# llave PRIVADA — guárdala en tu gestor de contraseñas y en un segundo lugar seguro; no la pegues en el chat ni en el repositorio
AGE-SECRET-KEY-1…
```

## Fila de falla en `error_logs`

| Campo | Valor |
|---|---|
| `endpoint` | `job:backup` |
| `http_status` | nulo |
| `message` | Fija por tipo, en inglés como las demás filas de procesos. Ejemplos: `The backup configuration is incomplete`, `The database dump failed`, `The backup could not be uploaded to the storage`, `Old backups could not be removed`, `The backup could not be restored for the weekly check`, `The restored backup does not match its table counts`, `The backup run could not be recorded in the database` |
| `file`, `line` | Los del llamador |
| `account_id` | nulo |

## Línea del resumen semanal (`internal/errordigest`)

- `Respaldos: último el 12 nov a las 03:00 · comprobación el 10 nov a las 03:06`
- `Respaldos: ninguno en los últimos 2 días` (sin un `backup ok` en 48 h)
- `Respaldos: sin registros` (tabla vacía)
