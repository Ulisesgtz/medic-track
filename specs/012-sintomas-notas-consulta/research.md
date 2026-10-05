# Investigación: Síntomas seleccionables y notas previas a la consulta

Decisiones técnicas de la spec 012. Cada una: Decisión / Justificación / Alternativas consideradas.

## R1. Catálogo: una tabla `symptoms`, orden global y la categoría como texto

**Decisión**: tabla `symptoms` con `code` (texto en inglés, PK, p. ej. `fever`), `name` (español), `category` (el
título en español, p. ej. "Oídos y ojos"), `sort_order` (entero global: 10, 20, 30…) y `active`. Las categorías se
ordenan por el `sort_order` de su primer síntoma; dentro de cada una, por `sort_order`. Sembrada en la migración, como
`countries`.

**Justificación**: el usuario pidió dos tablas (catálogo y relación). Un orden global con huecos permite insertar un
síntoma o una categoría nueva en cualquier lugar con un `INSERT`, sin publicar la app (FR-006) y sin una tercera tabla.
`code` estable y separado del nombre permite corregir el nombre visible sin romper consultas (FR-007).

**Alternativas**: tabla `symptom_categories` aparte (más normalizada, pero una tabla más que el usuario no pidió y que
hoy no aporta: las categorías no tienen más atributos que nombre y orden); lista fija en el frontend (obligaría a
publicar la app para cualquier cambio, contra FR-006); `category` como código + traducción (no hay otros idiomas).

## R2. `GET /catalog/symptoms`, público como los países

**Decisión**: endpoint nuevo en `internal/catalog` que devuelve solo los síntomas **activos**, en orden, con `code`,
`name` y `category`. Público (sin sesión), como `/catalog/countries`.

**Justificación**: el catálogo no contiene datos de nadie; el mismo patrón que ya existe (paquete `catalog`, ruta
pública en `internal/server/router.go`). Los síntomas retirados no se ofrecen (FR-008), pero se siguen leyendo desde
cada consulta (R5), así que el catálogo no necesita devolverlos.

**Alternativas**: devolverlo dentro de otra respuesta (p. ej. la del hijo) — acopla cosas que no se relacionan; exigir
sesión — no protege nada y complica el caché.

## R3. Relación `consultation_symptoms` con hijo y cuenta, garantizados por llaves compuestas

**Decisión**: `consultation_symptoms (consultation_id, child_id, account_id, symptom_code, created_at)`, PK
(`consultation_id`, `symptom_code`). Llaves foráneas: (`consultation_id`, `child_id`) → `consultations (id, child_id)`;
(`child_id`, `account_id`) → `children (id, account_id)`; `symptom_code` → `symptoms (code)`. Para eso se agregan
`UNIQUE (id, child_id)` a `consultations` y `UNIQUE (id, account_id)` a `children` (ya son únicas por `id`; la restricción
solo permite referenciarlas en pareja). Índices por `child_id` y por `account_id`.

**Justificación**: el usuario pidió la relación usuario/hijo/síntoma para consultar directo por hijo o por cuenta. Con
las llaves compuestas es **la base** la que impide que un síntoma quede con un hijo o una cuenta que no son los de su
consulta (FR-009, SC-004), sin depender de que el código lo haga bien.

**Alternativas**: solo `consultation_id` + `symptom_code` (lo mínimo; hijo y cuenta se obtienen con joins) — es lo más
simple, pero el usuario pidió la relación explícita; copiar hijo y cuenta sin llaves compuestas — podrían desalinearse
sin que nada lo impida; un trigger — más difícil de ver y probar que una restricción declarativa.

## R4. Guardar los síntomas en la misma transacción que la consulta

**Decisión**: `POST /children/{childId}/consultations` acepta `symptomCodes: string[]` (opcional). El servicio quita
duplicados (FR: "se guarda una sola vez") y el repositorio inserta dentro de la transacción que ya crea la consulta,
medicamentos y tomas, con un `INSERT … SELECT` que toma `account_id` del hijo y solo acepta síntomas activos:

```sql
INSERT INTO consultation_symptoms (consultation_id, child_id, account_id, symptom_code)
SELECT $1, ch.id, ch.account_id, s.code
FROM children ch JOIN symptoms s ON s.code = ANY($3) AND s.active
WHERE ch.id = $2
```

Si el número de filas insertadas no coincide con el de códigos pedidos, uno no existe o está retirado: la transacción
se revierte y responde `400 validation_error` con `details: [{field: "symptomCodes", message: "symptom_not_available"}]`
(FR-010).

**Justificación**: una consulta nunca queda a medias (con consulta pero sin síntomas, o al revés). La cuenta sale de la
base, no del cliente, así que no se puede falsear.

**Alternativas**: validar primero con otra consulta y luego insertar — dos idas a la base y una ventana entre ambas;
endpoint aparte para agregar síntomas — rompería la inmutabilidad (FR-011).

## R5. Lectura: nombres de los síntomas en el listado, objetos en el detalle

**Decisión**:
- Detalle (`GET /consultations/{id}`): `symptoms: [{code, name, category}]` en orden de catálogo, **incluidos los
  retirados** (FR-008), y `notes`.
- Listado (`GET /children/{childId}/consultations`): por consulta `symptomNames: string[]` en orden de catálogo (un
  `array_agg(... ORDER BY sort_order)` en una subconsulta) y `notes`. El frontend arma "Fiebre, Tos, Vómito +2".
- El campo de texto `symptoms` de las respuestas y del `POST` pasa a llamarse `notes`, y `symptoms` pasa a ser la lista.

**Justificación**: el listado solo necesita nombres; el detalle muestra pastillas y puede necesitar la categoría. Una
sola consulta por pantalla. Renombrar el campo evita que "symptoms" signifique dos cosas. El frontend y el backend **no** se publican
juntos (Cloudflare Pages y Railway, `DEPLOY.md`), así que el `POST` sigue aceptando `symptoms` (texto) como las notas
mientras conviven versiones (revisión del PR #10); una pestaña vieja abierta en el detalle necesita recargar, y sin
precaché en el service worker la recarga ya trae la versión nueva.

**Alternativas**: mantener `symptoms` como texto y llamar a la lista `symptomList` — deja el nombre equivocado para
siempre; que el frontend cruce códigos contra el catálogo — no funciona con síntomas retirados (el catálogo ya no los
trae).

## R6. Migración `0012`

**Decisión**: una migración que (1) renombra `consultations.symptoms` a `notes` (conserva cada carácter, FR-013,
SC-002), (2) agrega las dos restricciones `UNIQUE` de R3, (3) crea `symptoms` y la siembra con los 23 síntomas de FR-004,
(4) crea `consultation_symptoms` con sus llaves e índices.

Códigos: `fever`, `fatigue`, `irritability`, `poor_appetite`, `headache`, `chills`, `cough`, `runny_nose`, `sneezing`,
`sore_throat`, `difficulty_breathing`, `wheezing`, `vomiting`, `diarrhea`, `stomach_ache`, `nausea`, `constipation`,
`ear_pain`, `red_eyes`, `rash`, `itching`, `poor_sleep`, `sleeping_more`.

**Justificación**: `RENAME COLUMN` es instantáneo y no copia datos. Las migraciones se aplican a mano en orden (y así las
aplica CI), igual que las anteriores.

**Alternativas**: columna `notes` nueva + copiar + borrar `symptoms` — más pasos para el mismo resultado.

## R7. Frontend: `SymptomPicker` con chips, sección propia bajo el grupo de la receta

**Decisión**:
- Hook `useSymptoms()` en `src/shared/catalog/` (junto a `useCountries`), TanStack Query con `staleTime` largo.
- Componente `SymptomPicker` en `features/consultations/`: un `fieldset` con leyenda "¿Qué síntomas tuvo?" y, por
  categoría, un subtítulo y los chips. Cada chip es un `<button type="button" aria-pressed>` con nombre fijo (regla de
  `frontend/CLAUDE.md` para botones de alternancia), `min-h-11`, `rounded-full`.
- Estilo (tokens de `design-tokens.md`, referencia visual: filtros tipo pastilla con borde): sin seleccionar, fondo
  `surface`, borde `slate-300`, texto `ink`; seleccionado, fondo `action` con texto blanco (permitido sobre `action`) y
  una palomita a la izquierda, para que no dependa solo del color (FR-002).
- El valor va en el formulario como `symptomCodes: string[]` (React Hook Form `Controller`).
- El cuadro pasa a `notes` con etiqueta "Notas previas a la consulta" y el ejemplo como `placeholder`.
- Ubicación: en ambos diseños, una sección propia **después del grupo "Leído de tu receta"** y antes de los
  medicamentos: primero los chips, luego las notas. En el web esto saca el cuadro del grupo de la receta, donde lo tenía
  el mock 14: la receta no trae síntomas y el OCR nunca los llenó (FR-017); se anota como desviación en la spec 007.
- Si el catálogo falla: `Notice` informativo en la sección ("No pudimos cargar la lista de síntomas. Puedes guardar la
  consulta y escribirlos en las notas.") y el formulario se puede enviar (FR-016).
- Si el servidor responde `symptom_not_available`: mensaje en español ("Uno de los síntomas que elegiste ya no está
  disponible. Revisa la lista e intenta de nuevo."), se vuelve a pedir el catálogo y se quitan de la selección los que
  ya no están; lo demás del formulario se conserva.

**Justificación**: los chips con `aria-pressed` son el patrón que ya usa la app (chips de toma); un `fieldset` por
formulario da contexto a los lectores de pantalla. La palomita cumple "no solo color".

**Alternativas**: checkboxes nativos (accesibles, pero no es el diseño pedido); `role="listbox"` multiselección (más
difícil de usar con lector de pantalla que botones sueltos).

## R8. Listado y detalle

**Decisión**: `ConsultationCard` arma el subtítulo con `symptomNames` (hasta 3, "+N"), y si no hay, con `notes`
recortado como hoy; siempre seguido de "· N medicamentos" (FR-015). En el detalle (móvil y web), la sección "Síntomas"
muestra pastillas de solo lectura (`span`, fondo `hint`, borde `hint-border`, texto `ink`) y debajo "Notas previas a la
consulta"; cada una se omite si está vacía (FR-014).

## R9. Pruebas

**Decisión**:
- Backend: repositorio con BD real (siembra del catálogo, guardar y leer síntomas, una relación con otro hijo u otra
  cuenta rechazada por la base, síntoma retirado rechazado y transacción revertida, retirado visible en el detalle,
  notas conservadas); servicio (duplicados, lista vacía); handler (`symptomCodes`, `notes`, 400 con
  `symptom_not_available`); `catalog` (`ListSymptoms` solo activos y en orden); `router_test.go` (ruta pública).
- Frontend: `SymptomPicker` (seleccionar/quitar, `aria-pressed`, grupos en orden, catálogo fallido), formulario (envía
  `symptomCodes` y `notes`, error `symptom_not_available`), `ConsultationCard` (3 + "+N", notas como respaldo), detalle
  (pastillas, notas, secciones vacías omitidas), `useSymptoms`.
- E2E a 390 y 1280 px: registrar una consulta eligiendo síntomas y escribiendo notas, y verlos en el listado y el
  detalle (se extiende `e2e/detalle-consulta-hijo.spec.ts` y los de nueva consulta); los helpers que crean consultas por
  API cambian `symptoms` por `notes`.
- Cobertura >90% en ambos lados (Principio VI).

## R10. Documentación de la API y mapas

**Decisión**: actualizar los comentarios Swagger de los handlers tocados y regenerar `docs/`; actualizar
`backend/CLAUDE.md` (migración 0012, catálogo de síntomas), `frontend/CLAUDE.md` (`SymptomPicker`, `useSymptoms`) y
`CLAUDE.md` (feature 012); anotar la desviación del mock 14 en `specs/007-homologar-pantallas-a-mocks/spec.md`.

## Fuentes del catálogo inicial

- Secretaría de Salud / IMSS: afecciones respiratorias (~38 %) y digestivas (~10 %) como principales motivos de consulta
  pediátrica — https://asisucede.com.mx/enfermedades-diarreicas-y-respiratorias-principales-motivos-de-consulta-imss/ ,
  https://www.redalyc.org/pdf/4236/423640828003.pdf
- Consulta pediátrica ambulatoria en temporada de influenza: tos 61 %, fiebre 43 % —
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4012523/
- UNAM, enfermedades por las que más se acude al pediatra —
  https://massalud.facmed.unam.mx/index.php/las-9-enfermedades-por-las-que-mas-se-acude-al-pediatra/
