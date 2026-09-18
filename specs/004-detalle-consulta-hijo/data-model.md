# Modelo de Datos: Detalle de Hijo — Consultas y Recetas

> Nota: por el Principio de "Idioma del Código" de la constitución (v1.7.0), todos los nombres de
> campo/tabla/columna están en inglés. La prosa explicativa se mantiene en español.

## Entidades

### Consultation (tabla `consultations`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `child_id` | UUID FK → `children.id` | Requerido |
| `doctor_name` | TEXT NOT NULL | Requerido (FR-004) |
| `consult_date` | DATE NOT NULL | Requerido, no puede ser futura (misma regla que `birth_date` de feature 001) |
| `photo` | BYTEA NOT NULL | Obligatoria (Aclaraciones de spec.md) — ver research.md sobre por qué `bytea` |
| `symptoms` | TEXT NOT NULL DEFAULT '' | Texto libre, opcional a nivel de negocio (puede quedar vacío) |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Reglas**: Inmutable una vez creada (FR-014) — no hay endpoint de edición ni borrado. DEBE tener al menos un `Medication` asociado para poder crearse (FR-015, validado a nivel de servicio antes del insert transaccional).

### Medication (tabla `medications`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `consultation_id` | UUID FK → `consultations.id` | Requerido |
| `name` | TEXT NOT NULL | Requerido |
| `frequency_hours` | INTEGER NOT NULL | Cada cuántas horas se toma (p. ej. 8, 12, 24). Debe ser positivo. |
| `duration_days` | INTEGER NOT NULL | Duración del tratamiento en días. Debe ser positivo. Puede venir autollenado por OCR pero siempre como valor editable (FR-006) |
| `start_time` | TIME NULL | Hora del día de la primera toma (p. ej. "08:00"). Si es NULL, no se generan `Dose` (FR-010) |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Reglas**: Cada medicamento mantiene su propia frecuencia/duración/horario, independiente de los demás medicamentos de la misma consulta (FR-008). Inmutable junto con su Consultation (FR-014).

### Dose (tabla `doses`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `medication_id` | UUID FK → `medications.id` | Requerido |
| `scheduled_at` | TIMESTAMPTZ NOT NULL | Fecha/hora esperada de esta toma, calculada a partir de `start_time` + múltiplos de `frequency_hours`, acotado por `duration_days` (research.md) |
| `taken` | BOOLEAN NOT NULL DEFAULT false | Único campo mutable de todo el modelo — se actualiza vía `PATCH .../doses/{doseId}` (FR-011, FR-016) |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Reglas**: Solo existen `Dose` para medicamentos con `start_time` definido (FR-010) — se generan todas de una vez, en la misma transacción que crea la Consultation (research.md). `taken` se puede actualizar en cualquier momento sin importar si `scheduled_at` ya pasó (FR-016) — es el único dato no inmutable de este modelo.

## Relaciones

```text
Account (feature 001) 1───N Child (feature 001)
Child 1───N Consultation
Consultation 1───N Medication
Medication 1───N Dose (solo si Medication.start_time no es NULL)
```

## Concepto: Sesión local (reutilizado, sin cambios)

Igual que en specs/003-home-listado-hijos: el `account_id` en `localStorage` del navegador sigue siendo la única "sesión". Esta funcionalidad no introduce ningún cambio a ese mecanismo — los endpoints nuevos identifican al hijo/consulta por su UUID en la ruta, sin autenticación, continuando la misma postura ya aceptada.
