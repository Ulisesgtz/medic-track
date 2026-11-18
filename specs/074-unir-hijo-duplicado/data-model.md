# Modelo de datos — Spec 074

Migración `0040_child_merge_and_hide.sql` (aplicarla en DEV **antes** del merge).

## Cambios

### `children` (columna nueva)

| Columna | Tipo | Regla |
|---|---|---|
| `hidden_at` | `timestamptz NULL` | La dueña ocultó a este hijo. Solo tiene efecto si la dueña es integrante activa (Tutor o Cuidador) de una familia (R8). |

### FK que pasan a `DEFERRABLE INITIALLY IMMEDIATE`

Las cuatro que apuntan de una hija a `consultations`: `consultation_symptoms → consultations(id, child_id)` (0012),
`consultation_symptoms → consultations(id, account_id)` (0032), `consultation_appointments → consultations(id,
child_id)` (0020) y `consultation_appointments → consultations(id, account_id)` (0032). Se sueltan y se vuelven a crear
con el mismo nombre, mismas columnas y `DEFERRABLE INITIALLY IMMEDIATE` (los nombres reales se toman de
`pg_constraint` al escribir la migración). Fuera de la unión se comportan igual que hoy.

### `child_merges` (tabla nueva, de solo agregar)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid PK` | |
| `family_account_id` | `uuid NOT NULL → accounts(id)` | Cuenta dueña de la familia (Y). |
| `target_child_id` | `uuid NOT NULL` | Hijo que queda (T); FK `(target_child_id, family_account_id) → children(id, account_id)`. |
| `source_account_id` | `uuid NULL → accounts(id)` | De quién era el hijo propio (X); `NULL` si X se borró (spec 070). |
| `merged_by_account_id` | `uuid NULL → accounts(id)` | Quién unió (hoy siempre = X); `NULL` si se borró. |
| `merged_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `counts` | `jsonb NOT NULL` | Solo números: `consultations`, `vaccines`, `cardPhotos`, `measurements`, `supplements`, `activities`, `record` (bool), `devicesRemoved`. |

Índice `(target_child_id)`. Sin nombres, sin textos libres, sin datos de salud.

## Reglas al unir (S → T)

1. Bloquear: la cuenta Y (`FOR UPDATE`), las filas de S y T (`FOR UPDATE`, en orden de id).
2. Revisar: `S.account_id = actor`, nivel `Full` del actor sobre T (`access`), ninguna cuenta en pausa, `S ≠ T`,
   `S.account_id ≠ Y`.
3. `SET CONSTRAINTS <las cuatro FK> DEFERRED`.
4. Quitar los accesos activos del teléfono de S (spec 047) y apagar sus dispositivos.
5. `UPDATE … SET child_id = T, account_id = Y WHERE child_id = S` en: `consultations`, `consultation_symptoms`,
   `consultation_appointments`, `supplement_routines`, `vaccine_records`, `vaccine_card_photos`,
   `growth_measurements`, `child_device_links`.
6. Fundir la ficha (research R4); 409 `record_too_long` si una lista pasa de 30.
7. Escribir en T los datos elegidos del registro (R5); 409 `birth_date_conflict` si la fecha elegida es posterior a una
   medida o vacuna ya unidas.
8. Borrar S (ya vacío) e insertar `child_merges`.
9. `COMMIT` (aquí se revisan las FK diferidas).

Cualquier error: `ROLLBACK`, nada cambia (SC-003).

## Validación de la petición

- `pairs`: 1–10; `ownChildId` y `familyChildId` distintos y sin repetirse en la lista.
- `choices`: un valor `own`/`family` por cada campo que difiere; si falta uno → 400 `choices` con el nombre del campo
  (nunca su valor). Campos: `firstName`, `lastName`, `birthDate`, `height`, `weight`, `growthReferenceSex`,
  `bloodType`, `pediatrician`, `generalNote`.

## Ocultar

`PUT /accounts/{id}/hidden-children` reemplaza el conjunto: `hidden_at = now()` a los nuevos (los que ya estaban
conservan su fecha), `NULL` a los que salen. `family.Leave` y `RemoveMember` hacen `UPDATE children SET hidden_at =
NULL WHERE account_id = <quien sale>` en su transacción.

## Purga y descarga (spec 070)

- `purgeSteps`: `UPDATE child_merges SET source_account_id = NULL / merged_by_account_id = NULL` donde sea la cuenta
  borrada; `DELETE FROM child_merges WHERE family_account_id = $1` antes de `children`. `TestPurge_KnowsEveryTable` lo
  exige.
- `dataexport`: tabla `uniones` (fecha y conteos) en el ZIP de la cuenta dueña; los hijos ocultos ya entran por
  `account_id`.
