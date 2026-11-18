# Investigación — Spec 074: Un hijo registrado dos veces al unirse a una familia

Fecha: 2026-11-18. Hechos del código leídos por `Explore` (Haiku); decisiones de la sesión principal.

## R1. Unir = mover las filas al hijo de la familia que ya existe (no cambiar de cuenta al hijo propio)

**Hallazgo**: todas las tablas que cuelgan de un hijo tienen una FK compuesta `(child_id, account_id) → children(id,
account_id)`, `NO ACTION` y ninguna `DEFERRABLE`; no hay `ON DELETE` ni `ON UPDATE` en ninguna migración.

**Decisión**: no se cambia `children.account_id` del hijo propio (eso rompería todas las FK a la vez). Se mueve cada
fila del hijo propio (S, cuenta X) al hijo de la familia (T, cuenta Y) con **un `UPDATE … SET child_id = T,
account_id = Y WHERE child_id = S`** por tabla: `(T, Y)` ya existe en `children`, así que cada FK compuesta se cumple al
final de cada sentencia. Al terminar, S queda vacío y se borra (FR-008).

**Excepción — FK entre hijas**: `consultation_symptoms` y `consultation_appointments` apuntan además a
`consultations(id, child_id)` (0012/0020) y `consultations(id, account_id)` (0032). Al mover las consultas, esas
referencias quedan rotas hasta mover las hijas. **La migración `0040` vuelve esas cuatro FK `DEFERRABLE INITIALLY
IMMEDIATE`** y la unión hace `SET CONSTRAINTS … DEFERRED` dentro de su transacción: se revisan al `COMMIT`. Para el
resto de la app no cambia nada (siguen inmediatas).

**Alternativas descartadas**: `ON UPDATE CASCADE` (cambiaría en silencio el comportamiento de cualquier `UPDATE`
futuro); copiar y borrar (cambia ids, rompe las ligas de los avisos ya enviados, `dose_reminders`, y la idempotencia de
«Tomada»); soltar y recrear las FK en la transacción (bloqueo exclusivo de tablas enteras).

## R2. Qué se mueve, tabla por tabla

| Tabla | Cómo |
|---|---|
| `consultations` | `child_id`, `account_id` (el trigger de la 0032 es solo `BEFORE INSERT`: hay que escribirlo) |
| `consultation_symptoms`, `consultation_appointments` | `child_id`, `account_id` (FK diferidas, R1) |
| `medications`, `doses`, `medication_extensions`, `appointment_notices`, avisos y silencios | no tienen hijo ni cuenta dueña: viajan solos con su padre; sus ids no cambian |
| `supplement_routines` | `child_id`, `account_id`; `supplement_doses` viaja con la rutina |
| `vaccine_records`, `vaccine_card_photos`, `growth_measurements` | `child_id`, `account_id` |
| `child_records` (+ alergias, padecimientos) | se **funden** (R4) |
| `child_device_links` | se **quitan** (como «Quitar» de la spec 047, incluye apagar sus `reminder_devices`) y luego se mueven a T ya quitados, para conservar el historial («por Mateo» en las tomas sigue apuntando a su liga) |

Los autores (`taken_by_*`, `created_by_*`, `corrected_by_*`, `edited_by_*`, `status_by_*`) no se tocan: «por Laura»
sigue. Una prueba (`TestMerge_KnowsEveryChildTable`) recorre `information_schema` y falla si aparece una tabla nueva
con `child_id` que la unión no conoce (como `TestPurge_KnowsEveryTable`).

## R3. Avisos tras unir

**Hallazgo**: el dueño de una toma para los avisos sale de la fila (`consultations.account_id`,
`COALESCE(children.account_id, supplement_routines.account_id)`, `consultation_appointments.account_id`) y los
destinatarios de los integrantes de la familia de ese dueño (`reminder/candidates.go`, `appointment.go`). Los avisos
se reclaman **por toma y persona** (`dose_reminders` PK `(dose_id, account_id)`).

**Decisión**: con `account_id` reescrito a Y, las tomas futuras avisan solas a Y y a su familia (que ya incluye a la
persona que unió). Los avisos ya enviados conservan su fila: nunca se repiten. No hace falta código nuevo en
`reminder` para la unión.

## R4. La ficha (spec 073): fundir

- Si solo S tiene ficha: se mueve (`child_records`, alergias y padecimientos: `child_id`, `account_id`; las listas
  apuntan a `child_records(child_id)`, así que se inserta primero la de T y se borra la de S en vez de actualizar la
  llave primaria).
- Si las dos tienen: alergias y padecimientos = los de T y luego los de S **sin repetir los de texto idéntico** (nombre,
  tipo y nota iguales tras `TrimSpace`); si pasan de 30 → **409 `record_too_long`** con cuál lista, sin cambiar nada
  (la persona quita desde la ficha). Tipo de sangre, pediatra (nombre, teléfono y consultorio como un bloque) y nota
  general: lo que elija la persona si difieren (FR-006). `version + 1`, `updated_by = actor`.
- Todo dentro de la misma transacción, con la fila de T bloqueada (la misma regla de `childrecord.Save`).

## R5. Datos del registro (spec 064)

Si difieren `first_name`, `last_name`, `birth_date`, `height`, `weight` o `growth_reference_sex`, la persona elige
(`own`/`family`) y se escribe en T. Validaciones de siempre: la fecha de nacimiento elegida no puede ser posterior a
ninguna medida ni vacuna **ya unidas** (409 `birth_date_conflict`, como la spec 064); no se sella «Corregido el …»
(la línea de la unión lo dice).

## R6. Quién puede y el plan

En la transacción, con las filas de S y T bloqueadas (`FOR UPDATE`, en orden de id) y la cuenta dueña Y bloqueada:
S pertenece a la cuenta que pide (`children.account_id = actor`); el nivel del actor sobre T es `Full` (`access`: Tutor
de familia de pago vigente sin cuenta en pausa); el actor no está en pausa. Si algo falla → 403 `merge_not_allowed`
sin cambios. Un Cuidador nunca llega a `Full`: no puede unir.

Bloqueos de concurrencia: marcar una toma bloquea la fila de `doses` y la unión no la toca (solo cambia la consulta):
no se pisan. Editar una consulta de S (spec 051) bloquea la consulta: la unión la espera o la edición espera a la
unión y luego responde 404 (el hijo cambió; la app recarga).

## R7. Topes

No se revisan al unir (spec, casos límite). La vista previa trae los conteos resultantes y cuáles pasan su tope
(rutinas activas por tipo 10, fotos de cartilla 10, medidas 500, fotos de recetas 100 de la cuenta Y) para el aviso D2
del mock.

## R8. Ocultar

**Decisión**: columna `children.hidden_at timestamptz NULL` (migración `0040`). Un hijo está **oculto** cuando
`hidden_at IS NOT NULL` **y** su dueña es integrante activa de una familia (Tutor o Cuidador): así, si sale o la
quitan, vuelve solo; además `Leave`/`RemoveMember` limpian `hidden_at` en su transacción (para que reingresar no lo
oculte otra vez).

- `PUT /accounts/{accountId}/hidden-children` con el conjunto de ids (solo la dueña, `ownsAccount`; cualquier plan;
  409 `no_family` sin familia activa; 400 si un id no es suyo).
- Se excluye de: `GET /accounts/me` y `GET /accounts/{id}` (los ocultos van aparte en `hiddenChildren`, solo id y
  nombre), la barra lateral, «Tu día», el selector de la spec 071 (`ownChildren`) y los avisos **a cuentas**
  (`reminder/candidates.go` y `appointment.go`: `ch.hidden_at IS NULL OR` la dueña sin familia activa). El teléfono del
  hijo sigue avisando (FR-004).
- **Sigue contando**: para el tope de hijos (`AddChildIfUnderLimit`), para el tratamiento activo del plan gratuito
  (spec 030), en la descarga de datos (spec 070) y en la purga.
- Las rutas por hijo (`/children/{id}/…`) siguen respondiendo a la dueña: «oculto» es presentación, no acceso. Al
  volver a mostrar, los avisos siguen desde ese momento (las tomas pasadas ya no son «vencidas por avisar»: el reclamo
  de la spec 011 solo toma las de la ventana corriente).

## R9. Registro de la unión

Tabla `child_merges` (id, `family_account_id`, `target_child_id`, `source_account_id`, `merged_by_account_id`,
`merged_at`, `counts jsonb` con números): sin nombres ni datos de salud. Las respuestas de cuenta traen en cada hijo
`merges: [{at, byFirstName}]` para la línea «Se unió el 3 dic con el registro de Laura» (G). Purga: se borran con la
cuenta dueña Y; si se borra X, sus columnas de autor quedan en `NULL` (paso nuevo en `purgeSteps`). Descarga: tabla
`uniones` en el ZIP de Y.

## R10. Frontend

- `features/family/` → `merge/`: `MergeFlow` (estados A–F del mock), `pairing.ts` (sugerencia pura: normaliza sin
  acentos ni mayúsculas, nombre o nombre + apellido, nunca usa la fecha), `mergeText.ts` (textos; prueba de redacción
  sin juicios), `api.ts`/`hooks.ts`.
- `InvitationPage`: tras aceptar, si `account.children` propios > 0 y rol Tutor/Cuidador, navega a
  `/familia/como-seguir` en vez de `/home`. Cerrar = «Conservar ambas» (no se guarda nada).
- `FamilyPage`: sección de la persona invitada con «Unir con un hijo de la familia» (solo `Full` y con hijos propios) y
  «Ocultar mis hijos» / «Volver a mostrar»; `AccountPage`: «Hijos ocultos» (H).
- Rutas nuevas en `App.tsx` y en `shared/clientErrors/routePatterns.ts`; `RequireConnection` (spec 067).
- Tras unir: invalidar `['accounts','me']`, `['family']` y las llaves del hijo S; borrar la copia sin conexión de S.

## R11. Aviso «Antes de empezar»

No sube `CurrentDisclaimerVersion`. El aviso de privacidad (la persona puede pasar sus datos a la familia) es
pendiente del dueño.
