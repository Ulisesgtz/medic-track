# Modelo de Datos: Registro de Log de Errores del Backend

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), todos los nombres de
> campo/tabla/columna están en inglés. La prosa explicativa se mantiene en español.

## Entidad: ErrorLog

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | UUID | Sí (generado) | Identificador primario |
| `message` | string | Sí | Mensaje del error tal como se envió al cliente (FR-002) |
| `http_status` | integer | No | Código de estado HTTP de la respuesta, cuando exista uno claro (FR-002) |
| `endpoint` | string | Sí | Patrón de ruta del endpoint donde ocurrió el error (p. ej. `/catalog/countries/{countryCode}/states`), no la URL literal — ver research.md |
| `file` | string | Sí | Archivo de origen del código que generó el error (FR-002) |
| `line` | integer | Sí | Línea de origen dentro de `file` (FR-002) |
| `account_id` | UUID (FK → `accounts.id`) | No | Cuenta asociada a la solicitud que produjo el error, si existe (FR-003). NUNCA se guarda el correo del usuario (FR-004) |
| `created_at` | timestamp | Sí (generado) | Fecha/hora del evento |

**Reglas de validación**:
- `account_id`, si se proporciona, debe existir en `accounts` (FK); es válido dejarlo `NULL` para errores sin cuenta identificable todavía (p. ej. durante el registro de una cuenta nueva).
- Es un registro de solo-append: no existen operaciones de edición ni eliminación en este alcance (ninguna se expone; ver FR-007).
- Sin política de retención/purga en este alcance (ver Aclaraciones en spec.md, sesión 2026-09-16) — las filas se acumulan indefinidamente por ahora.

## Relaciones

- `ErrorLog.account_id` → `Account.id` (muchos-a-uno, opcional). Una cuenta puede tener múltiples entradas de log asociadas; una entrada de log tiene a lo sumo una cuenta asociada.
- Sin relación con `Child` — los errores se asocian a nivel de cuenta, no de hijo individual, ya que hoy no existe ningún endpoint que opere sobre un hijo por separado (ver contracts/post-accounts.md de la funcionalidad 001).
