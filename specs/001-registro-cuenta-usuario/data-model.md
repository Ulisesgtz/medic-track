# Modelo de Datos: Registro de Cuenta de Usuario y Perfiles de Hijos

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), todos los nombres de
> campo/tabla/columna están en inglés. La prosa explicativa se mantiene en español.

## Entidad: Account (Cuenta — Padre/Tutor)

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | UUID | Sí (generado) | Identificador primario |
| `first_name` | string | Sí | |
| `last_name` | string | Sí | |
| `email` | string | Sí | Único entre cuentas (FR-002); formato validado |
| `country_code` | string (FK → `countries.code`) | No | Selección de catálogo, no texto libre |
| `state_code` | string (FK → `states.code`) | No | Selección de catálogo, dependiente del país elegido |
| `plan` | enum(`free`, `paid`) | Sí | `free` por defecto al crearse (FR-001) |
| `created_at` | timestamp | Sí (generado) | |

**Reglas de validación**:
- `email` único en toda la tabla (constraint UNIQUE + validación de formato antes de persistir).
- `country_code`/`state_code`, si se proporcionan, deben existir en el catálogo (FK).

## Entidad: Child (Hijo)

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | UUID | Sí (generado) | Identificador primario |
| `account_id` | UUID (FK → `accounts.id`) | Sí | Relación con la Cuenta dueña |
| `first_name` | string | Sí | |
| `last_name` | string | Sí | |
| `birth_date` | date | Sí | No puede ser fecha futura (FR-005) |
| `height` | numeric | No | Unidad: cm (ver research.md — detalle de implementación) |
| `weight` | numeric | No | Unidad: kg |
| `created_at` | timestamp | Sí (generado) | |

**Reglas de validación**:
- `birth_date <= fecha actual`.
- `height`, `weight`: si se proporcionan, deben ser numéricos positivos (Caso Límite del spec).
- **Inmutabilidad tras persistir** (FR-006a): una vez que la Cuenta se guarda exitosamente, ningún registro de Child es editable en `first_name`, `last_name` ni `birth_date`, y no existe operación de eliminación en esta fase — esto se aplica a nivel de servicio/API (no se exponen endpoints PATCH/DELETE para Child en este alcance), no como restricción de base de datos.

## Relación

- Una **Account** tiene cero o más **Children** (uno a muchos, FK `child.account_id → account.id`).
- Regla de negocio (no de base de datos, aplicada en el servicio): una Account con `plan = 'free'` no puede tener más de 1 Child persistido (FR-007). La base de datos no impone este límite vía constraint — se valida en la capa de servicio porque es una regla de negocio que puede cambiar (p. ej., otros niveles de plan en el futuro).

## Entidades de catálogo (solo lectura para esta feature)

### Country (`countries`)
| Campo | Tipo |
|---|---|
| `code` | string (PK, p. ej. ISO 3166-1 alpha-2) |
| `name` | string |

### State (`states`)
| Campo | Tipo |
|---|---|
| `code` | string (PK) |
| `country_code` | string (FK → `countries.code`) |
| `name` | string |

Estas tablas se pueblan por migración/seed (ver research.md) y no se crean ni modifican desde esta feature — solo se consultan.
