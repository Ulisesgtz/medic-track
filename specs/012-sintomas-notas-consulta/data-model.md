# Modelo de Datos: Síntomas seleccionables y notas previas a la consulta

Migración `backend/migrations/0012_create_symptoms.sql`. Decisiones en [research.md](./research.md) (R1, R3, R6).

## `symptoms` — catálogo (nueva)

| Columna | Tipo | Reglas |
|---|---|---|
| `code` | `TEXT` | PK. Estable, en inglés, `snake_case` (`fever`). Nunca cambia. |
| `name` | `TEXT NOT NULL` | Lo que ve el padre, en español ("Fiebre"). Describe lo observado, nunca un diagnóstico (FR-005). |
| `category` | `TEXT NOT NULL` | Título de la categoría en español ("Respiratorio"). |
| `sort_order` | `INTEGER NOT NULL UNIQUE` | Orden global con huecos (10, 20…). Las categorías se ordenan por su primer síntoma. |
| `active` | `BOOLEAN NOT NULL DEFAULT true` | `false` = retirado: no se ofrece (FR-008), pero sigue en las consultas que lo tienen. |

Siembra (FR-004), `sort_order` de 10 en 10 en este orden:

| Categoría | code → name |
|---|---|
| General | `fever` Fiebre · `fatigue` Cansancio o decaimiento · `irritability` Irritabilidad o llanto · `poor_appetite` Poco apetito · `headache` Dolor de cabeza · `chills` Escalofríos |
| Respiratorio | `cough` Tos · `runny_nose` Mocos o nariz tapada · `sneezing` Estornudos · `sore_throat` Dolor de garganta · `difficulty_breathing` Dificultad para respirar · `wheezing` Silbido al respirar |
| Digestivo | `vomiting` Vómito · `diarrhea` Diarrea · `stomach_ache` Dolor de estómago · `nausea` Náuseas · `constipation` Estreñimiento |
| Oídos y ojos | `ear_pain` Dolor de oído · `red_eyes` Ojos rojos o con lagañas |
| Piel | `rash` Salpullido o ronchas · `itching` Comezón |
| Sueño y ánimo | `poor_sleep` Duerme mal · `sleeping_more` Duerme más de lo normal |

Mantenimiento (sin publicar la app, FR-006): agregar = `INSERT` con un `sort_order` libre; retirar =
`UPDATE symptoms SET active = false`; renombrar = `UPDATE … SET name`. Nunca se borra ni se cambia un `code`.

## `consultation_symptoms` — relación usuario / hijo / síntoma (nueva)

| Columna | Tipo | Reglas |
|---|---|---|
| `consultation_id` | `UUID NOT NULL` | La consulta. |
| `child_id` | `UUID NOT NULL` | El hijo de esa consulta. |
| `account_id` | `UUID NOT NULL` | La cuenta dueña de ese hijo. |
| `symptom_code` | `TEXT NOT NULL REFERENCES symptoms (code)` | El síntoma marcado. |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Cuándo se registró (= al crear la consulta). |

- PK (`consultation_id`, `symptom_code`): un síntoma una sola vez por consulta.
- FK (`consultation_id`, `child_id`) → `consultations (id, child_id)`.
- FK (`child_id`, `account_id`) → `children (id, account_id)`.
- Con esas dos llaves la base garantiza que hijo y cuenta son siempre los de la consulta (FR-009, SC-004).
- Índices: `idx_consultation_symptoms_child_id (child_id)`, `idx_consultation_symptoms_account_id (account_id)`
  (la PK ya cubre las búsquedas por consulta).
- Inmutable: solo `INSERT`, dentro de la transacción que crea la consulta (FR-011). Sin `ON DELETE` (no hay borrado de
  consultas, hijos ni cuentas en la app).

## Cambios a tablas existentes

- `consultations`: `RENAME COLUMN symptoms TO notes` (mismo tipo `TEXT NOT NULL DEFAULT ''`; el texto de cada consulta se
  conserva, FR-013) y `ADD CONSTRAINT consultations_id_child_id_key UNIQUE (id, child_id)`.
- `children`: `ADD CONSTRAINT children_id_account_id_key UNIQUE (id, account_id)`.

## Modelo en Go (`internal/consultation`, `internal/catalog`)

- `catalog.Symptom { Code, Name, Category string }` — lo que lista `GET /catalog/symptoms` (solo activos).
- `consultation.Consultation`: `Symptoms string` → `Notes string`; nuevo `Symptoms []Symptom` (detalle, en orden de
  catálogo, incluye retirados) y `SymptomNames []string` (listado).
- `consultation.CreateConsultationInput`: `Symptoms` → `Notes`; nuevo `SymptomCodes []string` (sin duplicados tras el
  servicio).
- Error nuevo `ErrSymptomNotAvailable` → `400 validation_error` con `details[{field: "symptomCodes", message:
  "symptom_not_available"}]`.

## Modelo en el frontend (`features/consultations/types.ts`, `shared/catalog`)

- `Symptom { code: string; name: string; category: string }`.
- `ConsultationSummary`: `symptoms: string` → `notes: string`; nuevo `symptomNames: string[]`.
- `ConsultationDetail`: `symptoms: string` → `notes: string`; nuevo `symptoms: Symptom[]`.
- Formulario: `symptoms` → `notes`; nuevo `symptomCodes: string[]`.
