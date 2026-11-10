# Investigación: Editar los datos del hijo (spec 064)

## R1 — Dónde vive el backend

- **Decisión**: un paquete nuevo, `internal/childprofile`, con una ruta `PUT /children/{childId}`. Lo que el padre ve del hijo (las respuestas de `GET /accounts/me` y `GET /accounts/{accountId}`) sigue en `internal/account`, que solo agrega `correctedAt` y `correctedBy` al hijo.
- **Justificación**:
  - Crear la medida de la casilla necesita la validación y el insert de `internal/growth` dentro de la misma transacción.
  - `internal/account` ya es grande (Clerk, el aviso, las familias). Si importara `growth`, se mezclarían responsabilidades.
  - `childprofile` importa `account` (las reglas del nombre) y `growth`. No hay ciclo: `growth` solo importa `access` y `httpx`.
- **Alternativas consideradas**:
  - `internal/account`: concentra todo lo de cuentas, pero lo acopla a `growth`.
  - `PATCH` con campos sueltos: complica distinguir «vaciar» de «no mandar» en la talla y el peso. `PUT` manda el hijo entero, como la edición de consultas de la spec 051.

## R2 — Migración `0035`

- **Decisión**: `children.corrected_by_account_id UUID NULL REFERENCES accounts(id)` y `children.corrected_at TIMESTAMPTZ NULL`, con `CHECK ((corrected_by_account_id IS NULL) = (corrected_at IS NULL))`, igual que `growth_measurements` y `vaccine_records`.
- **Justificación**: FR-008 pide solo la huella de la última corrección, sin historial (Supuestos de la spec).
- **Alternativas consideradas**: una tabla de historial de cambios. Se descartó porque la spec no la pide y guardaría datos anteriores del hijo sin necesidad (Principio II).
- **Aplicarla en DEV antes del merge.**

## R3 — Plan y anti-reciclar (FR-002)

- **Decisión**:
  - En la transacción: `SELECT … FROM children c JOIN accounts a ON a.id = c.account_id WHERE c.id = $1 FOR UPDATE OF c`. Se lee el nombre, el apellido, la fecha, la talla, el peso y `a.plan`.
  - Si cambia el nombre, el apellido o la fecha (comparando con lo guardado, con el nombre sin espacios sobrantes) y `a.plan <> 'paid'`, responde 422 `freemium_consultation_limit_exceeded` con `reason: "child_identity"`, **antes** de escribir nada y aunque la talla o el peso también cambien.
  - Mandar la misma identidad que ya está guardada nunca pide el plan.
- **Justificación**: el formulario del plan gratuito manda la identidad sin cambios, así que la regla se decide solo por lo que cambia. El plan es el de la cuenta dueña, el mismo criterio que la gráfica (spec 063) y el historial (spec 031).
- **Alternativas consideradas**: que el plan gratuito no mande esos campos. Se descartó porque obliga a un cuerpo con dos formas y complica el contrato.

## R4 — Fecha de nacimiento contra lo anotado (FR-005), atomicidad

- **Decisión**:
  - **En la edición**: con la fila del hijo bloqueada `FOR UPDATE`, se buscan `growth_measurements.measured_on < $nueva` y `vaccine_records.applied_on < $nueva` del hijo, ordenadas por fecha. Si hay alguna, responde 409 `birth_date_conflict` con `measurements: ["2022-03-03", …]` y `vaccinations: ["2022-03-10"]` (solo fechas, hasta 20 de cada una, más los conteos totales). No se escribe nada.
  - **En las escrituras de medidas y vacunas**: hoy validan la fecha contra el nacimiento **antes** de la transacción (`growth.Service.clean`, `vaccination.Service`, que lee `ChildBirthDate` sin bloqueo). Una medida podía validarse con la fecha vieja mientras otra persona cambiaba el nacimiento.
  - Se agrega una **revisión bajo bloqueo** en las cuatro escrituras:
    - `growth.Repository.Create`: ya bloquea `FOR UPDATE`; se lee también `birth_date`.
    - `growth.Repository.Update`: pasa a una transacción que bloquea la fila del hijo con `FOR SHARE`.
    - `vaccination.Repository.Create` y `Update`: bloquean la fila del hijo con `FOR SHARE`.
  - Las cuatro vuelven a comparar la fecha con `birth_date` y, si queda antes, responden el mismo error de validación de hoy («antes del nacimiento»).
  - `FOR SHARE` choca con el `FOR UPDATE` de la edición, así que una de las dos espera a la otra.
- **Justificación**: SC-003 exige que ninguna medida ni vacuna quede antes del nacimiento, también con dos personas a la vez.
- **Alternativas consideradas**:
  - Un trigger en la base: complica los mensajes de error y no sigue el patrón del proyecto.
  - Bloqueo de la cuenta: más amplio de lo necesario.
- **Otras fechas**: un `grep` de `birth_date` en `backend/internal` encuentra solo `account`, `growth`, `vaccination` y `historyexport`, que solo lo lee para el PDF. Consultas, suplementos, actividades y citas no dependen del nacimiento. La fotos de la cartilla (`vaccine_card_photos`) no tienen fecha.

## R5 — La casilla «Anotarlo también como medida de hoy» (FR-007)

- **Decisión**:
  - El cuerpo trae `measurement: { measuredOn: "YYYY-MM-DD" }` (la fecha del teléfono) o `null`.
  - El servidor la valida con `growth.Validate`: hasta mañana en UTC, no antes del nacimiento **nuevo**, y los rangos 0.3–200 kg y 30–220 cm. Usa los valores **nuevos** de talla y peso que no estén vacíos.
  - Si la talla y el peso están vacíos, responde 400 en `measurement`.
  - La medida se inserta en la misma transacción con una función de `growth` que recibe `pgx.Tx`: `growth.InsertInTx(ctx, tx, childID, accountID, actor, Cleaned)`. Esa función revisa el tope de 500 (`growth_limit_exceeded`) con la fila ya bloqueada por la edición.
  - El formulario ofrece la casilla solo si la talla o el peso cambian (escenario US1-7). El servidor no exige ese cambio: una medida con los mismos valores es válida.
  - Los errores de rango de la medida van en `measurement.weightKg` y `measurement.heightCm` para que el formulario los muestre junto a la casilla.
- **Justificación**: las dos cosas se guardan juntas o ninguna (FR-007), con las mismas reglas de la spec 063.
- **Alternativas consideradas**: que el frontend haga dos peticiones (`PUT` hijo + `POST` medida). Se descartó porque no es atómico.

## R6 — Validaciones y «sin cambios» (FR-004, FR-006, FR-008)

- **Decisión**:
  - El nombre y el apellido se validan con la misma función del registro (`account.validateNameFormat`, que se exporta como `account.ValidateName`), después de quitar espacios.
  - `birthDate` no puede ser futura, revisado contra el día de mañana en UTC, como la cartilla (el formulario la bloquea con la fecha del teléfono).
  - `height` y `weight` son `null` o números `> 0`, la regla del registro (`account.service.go`).
  - **Sin cambios** (todos los campos iguales y sin medida): responde 200 con el hijo **sin** sellar `corrected_*`.
  - Con una medida pero sin cambios en el hijo: se crea la medida y el hijo no se sella.
- **Justificación**: FR-008 dice que guardar sin cambios no cuenta como corrección.

## R7 — Quién (FR-003)

- **Decisión**:
  - La ruta va en `internal/server/router.go` con `fullChild`, junto a las del hijo. **No va en `/child-device`.**
  - Filas nuevas en `router_test.go`: dueña 200, Tutor de familia de pago 200, Cuidador 403, Tutor de familia vencida 403, integrante Hijo 403, otra cuenta 403/404 (como las demás rutas `fullChild`), teléfono del hijo sin ruta.
  - El autor visible se resuelve con `LEFT JOIN accounts kb ON kb.id = c.corrected_by_account_id` y `kb.first_name`, como en `growth`.

## R8 — Las respuestas del hijo

- **Decisión**:
  - `childResponse` (en `internal/account/handler.go`) agrega `correctedAt` (RFC 3339 o `null`) y `correctedBy` (el nombre de pila o `null`).
  - Las cuatro consultas de `account/repository.go` que leen `children` hacen el `LEFT JOIN` del autor.
  - `PUT /children/{childId}` devuelve el mismo `childResponse`, con el rol, el plan y `readOnly` de quien edita.
  - En el frontend, `Child` (`features/home/types.ts`) agrega `correctedAt?` y `correctedBy?`.
- **Justificación**: el detalle del hijo ya lee al hijo de la cuenta (`useAccount`), así que no hace falta otra petición.

## R9 — Frontend

- **Decisión**:
  - **Entrada**: una fila «Editar datos» en «Lo demás» (`MoreRows`, `features/childDetail/ChildDetailParts.tsx`), en ambos diseños, solo con `canAdd` (nivel completo y no solo lectura). Su valor dice «Corregido el 9 nov por Ana» si lo hay. El detalle del hijo no tiene hoy un lugar para los datos del registro y «Lo demás» ya agrupa lo que no es del día. El encabezado (`PageHeader`) se deja para «Nueva consulta», el único botón sólido.
  - **Página**: `/children/:childId/editar` (`features/childProfile/EditChildPage.tsx`), con dos diseños (`useIsDesktop`), `RoutinePageFrame`/`PageHeader`, `StickyActionBar` y `useUnsavedWork`.
    - Campos: nombre, apellido, fecha (`max` = hoy del teléfono), talla y peso (decimales con coma o punto).
    - La casilla aparece solo si cambió la talla o el peso.
    - Las reglas del nombre son las de `account-signup/validation.ts` (`nameValidation`, `nameError`).
  - **Plan gratuito**: los tres campos de identidad van `disabled` con la marca «Plan completo».
    - La dueña: la marca abre `FreemiumLimitModal reason="child_identity"`. `planCopy.ts` agrega la fila del motivo y `PlanLimitReason` agrega `child_identity`.
    - Un Tutor: frase fija («La dueña de la familia tiene el plan»), como `GROWTH.chartFamilyPlan`. Un Tutor de familia gratuita es de solo lectura, así que no llega al formulario; el caso real es la dueña.
  - **Errores**:
    - 409 `birth_date_conflict`: aviso neutral bajo la fecha con los conteos y las fechas (formato «3 mar 2022»).
    - 422 `child_identity`: el modal.
    - 422 `growth_limit_exceeded`: el aviso del tope.
    - 400: errores por campo.
  - **Después de guardar**: invalidar `['account']` (o la clave que usa `useAccount`), `['growth', childId]`, `['growth-chart', childId]`, el resumen del hijo y la cartilla. Luego `navigate(-1)` o al detalle con `replace`.
  - **Textos** en `childProfileText.ts`, con prueba de redacción contra las palabras que evalúan.
- **Alternativas consideradas**: editar en un diálogo sobre el detalle. Se descartó porque el proyecto usa páginas para los formularios, con `useUnsavedWork` y `StickyActionBar`.

## R10 — Pruebas

- **Backend**:
  - `go test ./...` con y sin `pool_max_conns=4`.
  - `childprofile` > 90 %: plan, conflictos, casilla, sin cambios, atomicidad con dos gorutinas (editar fecha y anotar medida a la vez) y `error_logs` sin nombres ni valores.
  - Las pruebas de `growth` y `vaccination` cubren la revisión bajo bloqueo.
- **Frontend**: vitest con cobertura > 90 % en `features/childProfile/`, `ChildDetailPage.test.tsx` (la fila) y `FreemiumLimitModal`.
- **E2E**: `frontend/e2e/editar-hijo.spec.ts` a 390 y 1280.
  - La dueña corrige talla y peso con la casilla y lo ve en Crecimiento.
  - La dueña de pago corrige el nombre y la fecha.
  - Una fecha que choca muestra el aviso.
  - El plan gratuito ve los campos bloqueados y la API responde 422.
  - Un Cuidador no ve la fila y la API responde 403.
