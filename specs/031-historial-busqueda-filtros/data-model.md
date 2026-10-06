# Modelo de datos (Fase 1): Historial con búsqueda y filtros

**No hay tablas, columnas, migraciones ni índices nuevos** (research R2, R9). Todo es lectura sobre lo que ya existe.

## Lo que se lee

| Tabla / columna | Para qué |
|---|---|
| `accounts.plan` (vía `children.account_id`) | El plan decide el acceso (research R6) |
| `consultations`: `id`, `child_id`, `doctor_name`, `consult_date`, `notes`, `created_at`, `record_only` | Lo que se busca y se muestra; `idx_consultations_child_id` acota al hijo |
| `medications.name` (`consultation_id`) | Búsqueda de texto, filtro de medicamento, lista de elección |
| `consultation_symptoms` (`consultation_id`, `symptom_code`) y `symptoms` | Filtro de síntomas (todos los marcados) y nombres en la tarjeta |

## Objetos (en memoria, no se guardan)

### `HistorySearch` (criterio)

| Campo | Tipo | Notas |
|---|---|---|
| `Q` | string | Recortado; si queda vacío no filtra. ≤ 100 caracteres (runas). Se pliega con `foldSpanish` antes de comparar |
| `From`, `To` | `*time.Time` (solo fecha) | Opcionales; `From ≤ To` |
| `Doctor`, `Medication` | string | Recortados, ≤ 200; vacío no filtra |
| `SymptomCodes` | `[]string` | Sin repetidos; ≤ 30; cada uno debe existir en `symptoms` |
| `Kind` | `all` \| `treatment` \| `record` | Vacío = `all` |

Reglas: todos los criterios dados se combinan con `AND`; ninguno inválido se ignora en silencio (`ValidationErrors`).

### `HistoryOptions` (listas de elección)

`Doctors []string`, `Medications []string`: los valores distintos de `consultations.doctor_name` y `medications.name` del
hijo, recortados, ordenados con la misma función de plegado.

### Estado de la pantalla (frontend, en la pestaña)

`HistoryCriteria` = `{ q, from, to, doctor, medication, symptomCodes, kind }`, guardado en `sessionStorage` bajo
`historial:<childId>`; lo inválido se descarta al leerlo (vuelve a los valores por omisión). No es un dato de la cuenta.

## Función de plegado

`foldSpanish(s) = translate(lower(s), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')`: la misma en SQL (`translate(lower(col), …)`;
las mayúsculas acentuadas van también porque `lower()` depende de la configuración regional de la base) y en Go
(minúsculas y sustitución de esos catorce caracteres). Una prueba compara las dos sobre los mismos textos para que no se
separen.

## Transiciones de estado

Ninguna: es solo lectura. Las consultas siguen siendo inmutables (spec 004).
