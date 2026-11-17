# Plan de Implementación: Respaldos de la base de datos

**Rama**: `feature/069-respaldos-base` | **Fecha**: 2026-11-12 | **Especificación**: [spec.md](spec.md)
**Entrada**: Especificación de la funcionalidad desde `/specs/069-respaldos-base/spec.md`

## Resumen

Un **segundo servicio de Railway**, `backup`, construido del mismo backend (`cmd/backup`, imagen `postgres:18-alpine`), arranca cada día a las 03:00 de Ciudad de México. Cada corrida hace esto:

1. Toma un candado en la base, para que nunca haya dos corridas.
2. Exporta un instante de la base y cuenta las filas de cada tabla en ese mismo instante.
3. Corre `pg_dump` sobre ese instante y lo **cifra en flujo con age para dos llaves**: la del dueño, que no vive en ningún sistema, y la de comprobación, que vive solo en ese servicio.
4. Lo sube a **Cloudflare R2** sin tocar el disco.
5. Registra la corrida en `backup_runs` (migración `0036`).
6. Aplica la retención 7/4/6.
7. Los lunes, **restaura la copia en un PostgreSQL efímero** del mismo contenedor y compara tablas y conteos.

Cada falla deja una fila fija en `error_logs` como `job:backup`. El resumen semanal suma una línea con el último respaldo y la última comprobación. El dueño tiene `keygen`, `list` y `restore` para el procedimiento escrito de `DEPLOY.md`. La app no cambia.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.4 (mismo módulo `backend/`).

**Dependencias Principales**:
- Ya usadas: `pgx/v5` y `internal/errorlog`.
- **Nuevas**, con versión exacta:
  - `filippo.io/age` v1.3.2 (del 2026-08-29), para cifrar;
  - `github.com/minio/minio-go/v7` v7.4.1 (del 2026-10-12), el cliente S3 para R2.
- Herramientas del contenedor: `pg_dump`, `pg_restore`, `initdb`, `pg_ctl` y `postgres` 18 de la imagen `postgres:18-alpine`.

**Almacenamiento**: tabla `backup_runs` en la base de la app y el bucket privado de R2.

**Pruebas**:
- `go test` con *fakes* de almacenamiento, volcado y restauración.
- El repositorio contra la base de pruebas.
- Una prueba de integración con la etiqueta `integration`, con `pg_dump` y `postgres` reales, fuera de CI.

**Plataforma Objetivo**: Railway (un servicio cron) y la computadora del dueño (`restore`, `keygen`).

**Tipo de Proyecto**: un servicio web existente más un proceso programado nuevo en el mismo módulo. Sin frontend.

**Objetivos de Rendimiento**:
- Con la base actual de DEV (decenas de MB), el respaldo tarda menos de 2 minutos y la comprobación menos de 5.
- La app no nota nada (SC-007): `pg_dump` lee en un instante sin bloquear escrituras.

**Restricciones**:
- La llave privada del dueño nunca vive en un sistema.
- Ningún dato de las familias en nombres, registros ni mensajes.
- Nada al disco salvo el `PGDATA` efímero de la comprobación, que se borra.
- Restaurar siempre en una base nueva.

**Escala/Alcance**: un ambiente hoy (DEV), producción después con la misma configuración. Como mucho unas 17 copias por ambiente.

## Verificación de la Constitución

| Principio | Cumple | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | No toca datos de salud ni la app. Los mensajes son técnicos y fijos. |
| II. Privacidad | ✅ | Copias cifradas antes de salir, con una llave del dueño fuera del sistema. Bucket privado con un token limitado. Nombres sin datos. La comprobación solo mira conteos. La llave de comprobación está aceptada por el dueño y vive solo en el servicio `backup`. **Pendiente del dueño**: mencionar en el aviso de privacidad que se guardan copias cifradas en Cloudflare R2 (encargado del tratamiento). |
| III. Stack fijo | ✅ | Go y PostgreSQL. El servicio corre en el mismo proveedor que ya se usa. |
| IV. Freemium sin secuestrar datos | ✅ | Protege los datos de todas las cuentas por igual. |
| V. Simplicidad | ✅ | Un binario, una tabla y dos dependencias pequeñas. La retención y el nombre son funciones puras. Sin respaldo continuo (queda en el backlog si hace falta). |
| VI. Pruebas | ✅ | Más del 90 % en `internal/backup`. Prueba de privacidad de los mensajes. Integración real con `pg_dump` y restauración. La prueba de restauración del dueño está en el quickstart. |

Sin violaciones. Se revisó de nuevo después del diseño y sigue igual.

**Riesgos que el diseño atiende**:
- **Una copia a medias que parezca buena.** Solo es `ok` al terminar la subida, con los conteos guardados.
- **Restaurar sobre la base viva.** `restore` se niega si la base destino no está vacía.
- **Perder la fila de la falla.** Se escribe de forma síncrona, no con `jobreport`.
- **Un `pg_dump` más viejo que el servidor.** La imagen es de la misma versión mayor.
- **Una retención que borre de más.** Nunca la copia más reciente, y solo objetos del formato y del ambiente propios.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/069-respaldos-base/
├── spec.md
├── plan.md              # este archivo
├── research.md          # R1–R13
├── data-model.md        # backup_runs, objeto en R2, retención, variables
├── quickstart.md
├── contracts/cli.md     # subcomandos, fila de falla, línea del resumen
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Código Fuente

```text
backend/
├── migrations/0036_backup_runs.sql     # NUEVO
├── cmd/backup/main.go                  # NUEVO: subcomandos run | check | list | restore | keygen (solo cableado)
├── internal/backup/                    # NUEVO
│   ├── config.go          # variables, validación (sin imprimir secretos)
│   ├── naming.go          # llave del objeto, parseo
│   ├── retention.go       # Keep(objects, now) 7/4/6, pura
│   ├── crypt.go           # age: cifrar para 2 destinatarios, descifrar, keygen
│   ├── store.go           # interfaz Store + R2 (minio-go): Put en flujo, Get, List, Delete
│   ├── dump.go            # instante exportado + conteos + pg_dump --snapshot (interfaz Dumper)
│   ├── restore.go         # PostgreSQL efímero, pg_restore, conteos (interfaz Restorer); restore a una URL vacía
│   ├── repository.go      # backup_runs: Start, Finish, LatestValid, LastOK
│   ├── report.go          # filas fijas job:backup (síncronas)
│   ├── service.go         # Run / Check / Restore: orquestación y limpieza
│   └── *_test.go          # + backup_integration_test.go (etiqueta integration)
├── internal/errordigest/  # + BackupStatus opcional y la línea «Respaldos: …»
├── cmd/api/main.go        # el digest recibe el repositorio de backup_runs
├── Dockerfile.backup      # NUEVO: build Go → postgres:18-alpine, USER postgres
└── railway.backup.json    # NUEVO: builder Dockerfile.backup, cronSchedule "0 9 * * *", sin healthcheck
DEPLOY.md                  # sección «Respaldos»: pasos del dueño y procedimiento de restauración
```

**Decisión de Estructura**: el paquete nuevo `internal/backup` queda dentro de la puerta de cobertura (`go test ./internal/...`). `cmd/backup` es solo cableado, como `cmd/api`.

## Orden de construcción

1. Migración `0036` y `repository.go` con sus pruebas.
2. Las piezas puras: `naming`, `retention`, `crypt`, `config` y `report`.
3. `store` (R2) detrás de una interfaz, con un *fake* en memoria para las pruebas.
4. `dump` y `restore` detrás de interfaces; `service` con la orquestación y su limpieza.
5. `cmd/backup` (subcomandos), `Dockerfile.backup` y `railway.backup.json`.
6. La línea del digest.
7. La integración local con `pg_dump` real.
8. `DEPLOY.md` (procedimiento), `CLAUDE.md`, `backend/CLAUDE.md` y `BACKLOG.md`.

## Seguimiento de Complejidad

Sin violaciones de la constitución que justificar.
