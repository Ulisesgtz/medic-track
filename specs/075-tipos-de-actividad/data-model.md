# Modelo de datos — Spec 075

Migración `backend/migrations/0041_activity_types.sql` (aplicarla en DEV antes del merge).

## Tabla nueva `activity_types` (catálogo)

| Columna | Tipo | Reglas |
|---|---|---|
| `code` | `TEXT` PK | estable, en inglés (`school`, `sports`, `arts`, `therapy`, `habits`, `other`) |
| `name` | `TEXT NOT NULL` | nombre visible en español |
| `sort_order` | `INTEGER NOT NULL UNIQUE` | orden del formulario y de los segmentos |
| `active` | `BOOLEAN NOT NULL DEFAULT true` | `false` = retirado: no se ofrece; las actividades que lo tienen lo conservan |

Semilla:

| code | name | sort_order |
|---|---|---|
| `school` | Escolar | 10 |
| `sports` | Deportiva | 20 |
| `arts` | Artística y cultural | 30 |
| `therapy` | Terapia y seguimiento | 40 |
| `habits` | Hábitos y cuidado diario | 50 |
| `other` | Otra | 60 |

Mantenimiento por SQL: agregar un tipo = `INSERT` con un `sort_order` libre; retirar = `UPDATE … SET active = false`;
nunca `DELETE` de un tipo usado (la FK lo impide).

## Cambio en `supplement_routines`

```sql
ALTER TABLE supplement_routines ADD COLUMN activity_type TEXT NULL REFERENCES activity_types (code);
UPDATE supplement_routines SET activity_type = 'habits' WHERE kind = 'activity';
ALTER TABLE supplement_routines ADD CONSTRAINT supplement_routines_activity_type_only_activities
    CHECK ((kind = 'activity') = (activity_type IS NOT NULL));
```

- Toda actividad tiene exactamente un tipo; ningún suplemento tiene.
- El tipo **no** se valida contra `active` en la base (una actividad conserva un tipo retirado); el servidor exige un
  tipo activo al **crear** y al **cambiarlo**.
- Cambiar el tipo solo escribe `activity_type` y `updated_at`.

## Lo que no cambia

`supplement_doses`, recordatorios, silencios, `medication_*`, `child_merges`: sin cambios. La unión (spec 074) mueve la
fila entera; la purga no toca el catálogo.
