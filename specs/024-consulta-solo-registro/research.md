# Investigación: Consulta «solo como registro»

## R1 — Cómo se guarda la marca

**Decisión**: columna `consultations.record_only BOOLEAN NOT NULL DEFAULT false` (migración `0016`, de solo agregar). Se
escribe una vez en el `INSERT` de la consulta y no se actualiza nunca (no existe `UPDATE` de consultas: spec 004, FR-014).
**Por qué**: es un hecho de la consulta, no de cada medicamento; con el valor por omisión `false` todas las consultas
existentes quedan como están (FR-009) sin tocar filas.
**Alternativas**: deducirlo de «ningún medicamento tiene hora de inicio» (las consultas anteriores a la spec 012 ya son así,
y se marcarían solas como solo-registro: viola FR-009); una tabla aparte (excesivo para un booleano).

## R2 — Sin hora de inicio, no hay tomas (y nada más cambia)

**Hallazgo**: `Repository.Create` solo genera tomas para un medicamento con `StartTime` (`generateDoseSchedule` devuelve `nil`
si es `nil`; el modelo ya lo documenta: «Dose … generated only when the Medication has a StartTime»), y el frontend ya sabe
mostrar un medicamento sin hora de inicio (sin chips). Todo lo demás se deriva de las tomas: «Tomas de hoy» y el resumen del
hijo (`GetOverview`), «tratamiento activo», los recordatorios (`internal/reminder` lee tomas vencidas), los estados
(`StatusAt`), finalizar y recorrer (piden tomas pendientes o sin registrar).
**Decisión**: con `RecordOnly` el servicio **no exige** `startTime` y la guarda como `nil` aunque llegue una (el servidor,
no el cliente, garantiza «sin horarios»: FR-003/FR-005). Sin tomas, ninguna de las pantallas ni procesos anteriores necesita
saber de la marca. Se **prueba** (no se asume) con una consulta solo-registro contra el resumen del hijo, el tratamiento
activo y la consulta de tomas del recordatorio: devuelven vacío.
**Una prueba de seguridad en el repositorio**: crear con la marca y un `StartTime` mal puesto en la entrada → cero tomas (el
servicio ya lo anuló, la prueba del repositorio lo confirma con la marca puesta).

## R3 — API compatible hacia atrás

- **Petición** (`POST /children/{id}/consultations`): campo nuevo `recordOnly` (booleano, opcional, `false` si falta). Un
  frontend viejo no lo manda: todo igual.
- **Respuestas** (listado y detalle, y la de la creación que ya devuelve el detalle): campo nuevo `recordOnly` (siempre
  presente). Un frontend viejo lo ignora.
- **Orden de despliegue**: primero el backend. Un frontend nuevo contra un backend viejo no manda `recordOnly` válido
  (lo ignoraría y exigiría la hora de inicio): por eso el frontend lee `recordOnly` como opcional y el formulario falla con
  el error de validación normal, nunca guarda a medias.
- **Errores**: sin cambios (`validation_error` con `details`). Con la marca, `medications[i].startTime` ya no se valida.

## R4 — El formulario

- Un checkbox propio dentro del formulario (campo `recordOnly`, `false` por omisión) en la sección de datos de la consulta,
  **después de la fecha**: «Consulta anterior: guardar solo como registro», con el texto auxiliar «No se crearán horarios
  de tomas ni avisos. Esto no se puede cambiar después.» (FR-001; neutro, Principio I). Es un `<input type="checkbox">` con
  `<label>` real y zona táctil de 44 px; mismo estilo en los dos diseños dentro de su variante.
- `MedicationFieldset` recibe `recordOnly` (leído con `useWatch` en el formulario): con la marca **no dibuja** el campo
  «Primera toma» (los dos diseños) y su `register(... startTime, { required })` pasa a `required: false` al ir con la marca.
  Como el campo ya registrado no se desregistra (RHF por omisión conserva el valor de un input desmontado), **lo escrito en
  «Primera toma» no se pierde** al marcar y desmarcar (escenario 1.4).
- `missingFields.ts` deja fuera «la hora de la primera toma» con la marca (el aviso de campos faltantes no la pide).
- El envío manda `recordOnly` y `startTime: null` en cada medicamento cuando la marca está puesta.
- El OCR (`useOcrSuggestion`) no propone hora de inicio hoy; no cambia nada.

## R5 — Listado y detalle

- **`RecordOnlyBadge`**: un chip neutro «Solo registro» (borde y texto de tinta suave sobre `surface`, sin rojo ni ámbar),
  con `aria-label` = su texto; lo usan `ConsultationCard` (listado, junto a la fecha) y el detalle (junto a la fecha o
  doctor), en ambos diseños.
- **Detalle**: ya sin tomas no hay calendario (`TreatmentCalendar` devuelve `null` sin días), ni leyenda, ni chips, ni
  barra de progreso, ni botones. Falta ocultar en la web la tarjeta «Tratamiento activo» (diría «Ninguno · sin tomas
  pendientes», algo falso para un archivo) y mostrar la etiqueta. Cada medicamento sigue diciendo «Cada 8 horas · 7 días»
  (`schedule()` ya omite «primera toma» sin hora).
- **Listado y resúmenes**: `medicationCount` sigue contando los medicamentos (informativos); «Tomas de hoy» ya no incluye
  nada de la consulta porque no tiene tomas.

## R6 — Pruebas

- **Backend**: servicio (con la marca: no exige hora de inicio, la anula si llega, validaciones de nombre/frecuencia/duración
  siguen; sin la marca: igual que antes), repositorio (con la marca: cero tomas; `record_only` se guarda y se lee en el
  detalle y el listado; la consulta normal, `false`), manejador (JSON con `recordOnly`; petición sin el campo = `false`),
  más una prueba de que la consulta solo-registro no aparece en el resumen del hijo ni en las tomas vencidas del recordatorio.
  Cobertura del paquete >90 %.
- **Frontend**: formulario (marcar quita «Primera toma» y no la valida; desmarcar la devuelve con lo escrito; envía
  `recordOnly` y `startTime: null`), tarjeta del listado y detalle (etiqueta; sin «Tratamiento activo» en la web), la
  etiqueta; >90 %.
- **E2E** (`consulta-solo-registro.spec.ts`, 390 y 1280 px): crear una consulta de hace meses con la marca y un
  medicamento sin hora → en el detalle, etiqueta y sin calendario ni tomas; en el listado, etiqueta; el resumen de «Tomas de
  hoy» del hijo sin tomas de ella; y una consulta normal del mismo hijo sigue con sus tomas.

## R7 — Documentación y Swagger

`go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd` desde `backend/` y se sube el
resultado (CI compara). `CLAUDE.md` (línea de la feature 024), `backend/CLAUDE.md` (columna, regla de la hora de inicio y que
las tomas no existen), `frontend/CLAUDE.md` (formulario, etiqueta, detalle) y `BACKLOG.md` (la entrada de convertir una
consulta solo-registro en una con tomas, si se quiere, queda como futura).
