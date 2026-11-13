# Quickstart: validar los respaldos (spec 069)

## 1. Pruebas automáticas

```bash
cd backend && go test ./internal/backup/... ./internal/errordigest/... -cover
```

Lo esperado: todas pasan, con más del 90 % de cobertura en `internal/backup`.

## 2. Integración local (con `pg_dump` 18 y un PostgreSQL local)

```bash
cd backend && go test -tags integration ./internal/backup/ -run Integration -v
```

Lo esperado:
- respalda la base de pruebas a un almacenamiento en memoria;
- la restaura en un servidor efímero;
- los conteos son iguales;
- el directorio temporal ya no existe.

## 3. En DEV (pasos del dueño, `research.md` R13)

1. Aplica la `0036` en DEV.
2. Crea el bucket R2 y el token.
3. Genera tu llave y la de comprobación.
4. Crea el servicio `backup` con sus variables.
5. En Railway, en el servicio `backup`, elige **«Run now»** (o espera a las 03:00).
   - La consola dice «respaldo dev listo: …».
   - En R2 aparece `dev/AAAA-MM-DDThhmmssZ.dump.age`.
   - En `backup_runs` hay una fila `backup` `ok`.
6. Ábrela con tu llave para comprobar que es tuya:

   ```bash
   cd backend && go run ./cmd/backup list
   ```

   ```bash
   createdb -h localhost -U root peditrack_restore_test
   ```

   ```bash
   read -rs BACKUP_RESTORE_TARGET && export BACKUP_RESTORE_TARGET
   ```

   Pega `postgres://root:<clave>@localhost:5432/peditrack_restore_test` y pulsa Enter.

   ```bash
   cd backend && go run ./cmd/backup restore --key ~/peditrack-backup-owner.txt --object latest
   ```

   Lo esperado: «restauración completa: N tablas, conteos iguales». Toma el tiempo: debe ser menos de 1 hora (SC-003).
7. Forzar la comprobación:

   ```bash
   cd backend && go run ./cmd/backup check
   ```

   Lo esperado: una fila `check` `ok`.
8. Forzar una falla: pon una llave R2 mala en el servicio y elige «Run now».
   - La corrida termina con falla.
   - Hay una fila `job:backup` con «The backup could not be uploaded to the storage», sin la URL ni la llave.
   - El siguiente resumen semanal la muestra.
9. Revisa el resumen del lunes: trae la línea «Respaldos: último el … · comprobación el …».

## 4. Lo que no debe pasar

- Que una copia o su nombre se puedan leer sin la llave: `xxd` del objeto muestra el encabezado `age-encryption.org/v1` y nada legible.
- Que haya una fila de `error_logs` con una URL, una llave o un texto de error de terceros.
- Que `restore` escriba sobre una base con tablas: se niega.
