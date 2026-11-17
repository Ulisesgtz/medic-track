# Investigación — Spec 073: Ficha de datos permanentes del hijo

Fecha: 2026-11-17. Hechos del código leídos por `Explore` (Haiku); decisiones de la sesión principal.

## R1. Dónde vive: paquete y tablas nuevos, no columnas en `children`

**Decisión**: paquete `backend/internal/childrecord` y tres tablas (migración `0039`): `child_records` (una fila por
hijo), `child_record_allergies` y `child_record_conditions` (listas ordenadas).

**Por qué**: la ficha tiene listas (alergias, padecimientos) y su propio sello de actualización y versión; meterla en
`children` mezclaría su edición con «Editar datos» de la spec 064 (que tiene reglas de plan sobre la identidad). Las
listas como filas permiten orden explícito (`position`) y topes contados en la base.

**Alternativas descartadas**: `jsonb` en `children` (no se valida en la base, complica la descarga en CSV y el borrado
por columnas de autor); columnas en `children` (no caben las listas).

## R2. Guardar: reemplazo completo con versión (conflictos)

**Hallazgo**: `childprofile` (spec 064) es «gana el último» bajo el bloqueo de la fila; el patrón de conflicto existe en
la spec 051 (`expectedVersion` RFC 3339 + 409 `edit_conflict`).

**Decisión**: `PUT /children/{childId}/record` con **la ficha entera** y `expectedVersion` (entero; `0` = «no había
ficha»). En una transacción: bloquear la fila del hijo `FOR UPDATE`, leer `child_records.version` (0 si no hay); si
difiere → **409 `record_conflict`** con la ficha actual en el cuerpo (la app la muestra sin perder lo escrito, caso E del
mock). Si el contenido normalizado es igual al guardado → 200 sin tocar nada (FR-007: guardar sin cambios no cuenta). Si
cambió → reemplaza la fila y las listas (borra e inserta en orden), `version = version + 1`, `updated_at = now()`,
`updated_by_account_id = actor`. Un entero es más simple que una fecha y no depende de la precisión del reloj.

## R3. Acceso y plan

- `GET /children/{childId}/record` → `seesChild` (`Mark`: dueña, Tutor, Cuidador; Tutor de familia vencida también ve).
- `PUT /children/{childId}/record` → `fullChild` (`Full`: dueña y Tutor de familia de pago).
- **Ningún chequeo de plan** (FR-013, decisión del dueño).
- **No** se registra bajo `/child-device` (FR-016): la lista cerrada `phoneRoutes` de `childdevice_router_test.go` no
  cambia y esa prueba garantiza que el teléfono no la alcanza.
- Una fila en `routes()` de `server/router_test.go` por cada ruta, clasificada para que las pruebas de nivel (dueña,
  Tutor, Cuidador, Hijo, removido, Tutor vencido, extraño) la recorran.
- Cuenta en pausa (spec 070): ninguna de las dos va en `AllowedWhilePending` (la pantalla de pausa no la muestra; la
  descarga la incluye).

## R4. Validación y Principio II

- Textos con `strings.TrimSpace`; nombre de alergia/padecimiento 1–120 runas; notas ≤ 300; nota general ≤ 1000;
  pediatra: nombre ≤ 120, teléfono ≤ 30 (dígitos, espacios, `+`, `-`, `(`, `)`, `.`), consultorio ≤ 300; el teléfono
  sin nombre o el nombre sin teléfono son válidos; tipo de sangre ∈ {`O+`,`O-`,`A+`,`A-`,`B+`,`B-`,`AB+`,`AB-`,
  `unknown`} o vacío; `kind` de alergia ∈ {`medication`,`food`,`other`} o vacío; topes 30 alergias y 30 padecimientos.
- Errores de campo con `httpx.ValidationBody` por **nombre** (`allergies[3].name`), **nunca el valor**.
- Los textos solo en cuerpos JSON; `error_logs` guarda la plantilla de la ruta; una prueba
  (`TestErrorLogsNeverCarryTheRecord`) manda textos reconocibles y revisa que ninguna fila de `error_logs` los tenga.

## R5. Borrado y descarga (spec 070)

- `accountdeletion/purge.go`: `DELETE` de `child_record_allergies`, `child_record_conditions` y `child_records` por
  `account_id` en la sección de tablas por hijo (antes de `children`), y `UPDATE child_records SET
  updated_by_account_id = NULL WHERE updated_by_account_id = $1` (un Tutor que se va deja la ficha del hijo ajeno sin
  autor). `TestPurge_KnowsEveryTable` obliga a ello.
- `dataexport/collect.go`: tres `textTables` (`ficha`, `ficha_alergias`, `ficha_padecimientos`) filtradas por
  `account_id`, así entran también en `FamilyChildren`.

## R6. PDF (spec 050)

`historyexport` agrega `record` (la ficha o `null`) a `documentResponse`; `frontend/.../pdfExport/document/Cover.tsx`
la dibuja en la portada según el mock. La exportación ya decide el plan (es del plan completo); la ficha no cambia eso.

## R7. Sin conexión (spec 067)

**Decisión**: la ficha **se guarda** en el teléfono instalado como lo demás (raíz `child-record` en `PERSISTED_ROOTS`):
en una emergencia sin señal es justo lo que se necesita ver. Mismas reglas: 7 días, solo teléfono instalado, se borra al
cerrar sesión. `privacy.test.ts` lo vigila.

## R8. Frontend

- `features/childRecord/`: `api.ts`, `hooks.ts` (`['child-record', childId]`), `ChildRecordSection` (en el detalle del
  hijo; lugar según el mock), `EditChildRecordPage` (`/children/:childId/ficha/editar`, `useDiscardGuard`,
  `useFieldArray` como los medicamentos de la consulta), `recordText.ts` (textos y la frase fija), `callLink.ts`
  (`tel:` con solo dígitos y `+`).
- Reordenar: no hay componente; botones «Subir»/«Bajar» accesibles (o lo que dibuje el mock).
- La ruta nueva se suma a `shared/clientErrors/routePatterns.ts` (la prueba de la spec 072 lo exige).
- Prueba de redacción (`recordText.test.ts`): sin «riesgo», «peligro», «grave», «urgente», sin clases rojas/ámbar.

## R9. Aviso «Antes de empezar»

**Decisión**: no sube `CurrentDisclaimerVersion`: el aviso ya dice que la app es informativa y no sustituye al médico;
la ficha lleva su propia frase fija (FR-010). El aviso de privacidad es pendiente del dueño.

## R10. Diseño

Mock pedido a Claude Design (FR-019, prompt entregado al dueño el 2026-11-17, estados A–F). Hasta que llegue, el backend
y la lógica del frontend avanzan; las pantallas se construyen tal cual el mock y se miden a 390 y 1280 px.
