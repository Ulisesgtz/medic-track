# Modelo de Datos: Digest semanal de errores por correo

Solo hay **una tabla nueva**, pequeña, y tipos en memoria. `error_logs` no cambia (spec 002/018/021).

## Tabla `error_digest_runs` (migración `0024_create_error_digest_runs.sql`)

Una fila por semana en que el servicio intentó mandar el digest. Es lo único que garantiza «uno por semana» entre reinicios y entre copias del API (research R2).

| Columna | Tipo | Reglas |
|---|---|---|
| `week_key` | `TEXT` | **Llave primaria.** Semana ISO de la hora programada en hora de Ciudad de México, `YYYY-Www` (p. ej. `2026-W42`); `CHECK (week_key ~ '^[0-9]{4}-W[0-9]{2}$')` |
| `status` | `TEXT NOT NULL` | `CHECK (status IN ('sending', 'sent', 'failed'))` |
| `claimed_at` | `TIMESTAMPTZ NOT NULL` | cuándo se reclamó por última vez |
| `lease_until` | `TIMESTAMPTZ NOT NULL` | hasta cuándo el reclamo es de quien lo tomó (30 min); vencido y `sending` ⇒ otro puede retomarlo |
| `attempts` | `INTEGER NOT NULL DEFAULT 1` | `CHECK (attempts >= 1)`; cuántas veces se **reclamó** la semana (no cuántos envíos: un reclamo que se libera por una falla de la base también suma); sirve para depurar |
| `sent_at` | `TIMESTAMPTZ` | solo con `status = 'sent'` |
| `failed_at` | `TIMESTAMPTZ` | solo con `status = 'failed'` |

`CHECK ((status = 'sent') = (sent_at IS NOT NULL) AND (status = 'failed') = (failed_at IS NOT NULL))`: el estado y su marca de tiempo no se pueden contradecir.

**No guarda**: el destinatario, el remitente, el asunto, el cuerpo, la clave, la respuesta del proveedor ni ids de cuenta. **Sin retención**: crece 52 filas al año.

### Transiciones de estado

```text
(no existe) ──reclamar──▶ sending ──envío correcto──▶ sent        (final)
                              │
                              ├──agotado o permanente──▶ failed   (final; la semana no se recupera)
                              └──lease vencido──▶ (otra copia lo reclama: sigue en sending, attempts + 1)
```

- `sent` y `failed` son **finales**: el reclamo no los toca nunca.
- Una falla al **armar** el contenido o al **reclamar** no cambia el estado: la semana sigue sin fila (o `sending` con lease), y el siguiente ticker lo reintenta.

## Tipos en memoria (paquete `errordigest`, sin tabla)

- **`Config`**: `APIKey`, `To`, `From`, `Weekday`, `Hour`, `EnvLabel` (de variables de entorno; ver contratos/configuration.md). `Available()` es verdadero si hay clave, destinatario y remitente.
- **`Digest`** (derivado, no se guarda): `Since`, `Until`, `Requests` (`Section`), `Jobs` (`Section`), `PreviousTotal` y `HasComparison`.
  - **`Section`**: `Total` (entradas), `Accounts` (cuentas distintas afectadas, **solo el conteo**), `Groups []Group` (hasta 10, de más a menos frecuente) y `MoreGroups` (cuántos quedaron fuera).
  - **`Group`**: `Endpoint`, `Status` (opcional), `Message` (ya limpio y recortado), `Count`, `FirstSeen`, `LastSeen`.
- **`Message`** (para el `Sender`): `From`, `To`, `Subject`, `Text`, `IdempotencyKey`.

## Cambios en `internal/errorlog` (sin migración)

- `Filter.ExcludeEndpointPrefix string`: excluye los endpoints que empiezan por ese prefijo (`NOT LIKE`, con el escape de `escapeLike`).
- `Stats{Entries, Groups, Accounts int}` y `Repository.Stats(ctx, Filter)`: tres números en una consulta.
- `Repository.OldestEntry(ctx) (*time.Time, error)`: la entrada más antigua, o `nil` si la tabla está vacía.

Los tres usan el índice `idx_error_logs_created_at` (spec 021, migración `0015`); no hace falta ninguno nuevo.
