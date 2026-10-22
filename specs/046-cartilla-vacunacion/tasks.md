---

description: "Lista de tareas de la spec 046: cartilla de vacunación del hijo"
---

# Tareas: Cartilla de vacunación del hijo

**Entrada**: `specs/046-cartilla-vacunacion/` (spec.md aclarada, plan.md, research.md R1–R12, data-model.md, contracts/api.md, quickstart.md)

**Pruebas**: obligatorias (Principio VI): >90 % en `internal/vaccination` y en el frontend. Las marcadas «(TDD)» se escriben **antes** del código que prueban. Todo endpoint escribe por `*httpx.Responder`.

**Organización**: la migración y el catálogo bloquean todo (Fase 1). Después, el backend de dosis (Fase 2, US1) y de fotos (Fase 3, US2), y el frontend (Fases 4 y 5). El acceso familiar y la privacidad (Fase 6, US4) cierran, y la Fase 7 es E2E, documentación y verificación. **MVP = Fases 1, 2 y 4** (registro manual completo). Un commit por fase.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin depender de una tarea sin terminar).
- **[US1]…[US4]**: la historia de `spec.md` (US1 registro manual, US2 foto de la cartilla, US3 ayuda de lectura, US4 compartir con la familia).
- **[DUEÑO]**: la hace el dueño del producto fuera del código; se marca si **bloquea** algo.
- **Trampas conocidas del repo**: los archivos son **CRLF** (editar con scripts de Python que preserven los finales de línea y revisar `git diff --stat`); los heredocs de bash se rompen con apóstrofes (usar un archivo de Python escrito con la herramienta de escritura); `npm run build` compila también las pruebas (`tsc -b`), así que **terminar cada fase de frontend con `npm run build`**; `gofmt -l` marca todo por el CRLF (ignorarlo); en Windows las E2E locales necesitan `VITE_CLERK_PUBLISHABLE_KEY` (si no está, las corre el CI).
- **Nombres de referencia**: paquete `backend/internal/vaccination`; constante `MaxPhotosPerChild = 10`; carpeta `frontend/src/features/vaccinations/`; ruta `/children/:childId/cartilla`.

---

## Fase 1: Base de datos y catálogo (bloquea todo)

- [X] T001 Línea base: `cd backend && export DATABASE_URL="postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable" && go vet ./... && go test ./... -cover` y `cd ../frontend && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4 && npm run build` en verde antes de tocar nada.
- [X] T002 Crear `backend/migrations/0028_vaccination_card.sql` **exactamente** según `data-model.md`: (a) `vaccine_catalog (code TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT true)` **sin ninguna columna de edad, dosis objetivo o calendario** (Principio I) con la semilla de ~16 nombres (BCG, hepatitis B, hexavalente acelular, pentavalente acelular, rotavirus, neumocócica conjugada, influenza, SRP, SR, DPT, Td, Tdpa, VPH, hepatitis A, varicela, COVID-19, polio, meningococo; `sort_order` de 10 en 10; comentario «lista a validar con la Cartilla Nacional de Salud»); (b) `vaccine_records` con `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `child_id`, `account_id`, `vaccine_code TEXT NULL REFERENCES vaccine_catalog(code)`, `custom_name TEXT NULL`, `applied_on DATE NOT NULL`, `dose_number INTEGER NULL`, `lot TEXT NULL`, `place TEXT NULL`, `notes TEXT NULL`, `created_by_account_id UUID NOT NULL REFERENCES accounts(id)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `corrected_by_account_id UUID NULL REFERENCES accounts(id)`, `corrected_at TIMESTAMPTZ NULL`; CHECKs: **exactamente uno** de `vaccine_code`/`custom_name` (`(vaccine_code IS NULL) <> (custom_name IS NULL)`), `custom_name` 1–100 caracteres, `dose_number` 1–20, `lot` ≤ 60, `place` ≤ 120, `notes` ≤ 500, **`corrected_by_account_id` y `corrected_at` ambos nulos o ambos presentes**; `FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id)`; índices `(child_id, applied_on, created_at)` y `(account_id)`; (c) `vaccine_card_photos` con `id`, `child_id`, `account_id`, `photo BYTEA NOT NULL CHECK (octet_length(photo) > 0)`, `created_by_account_id UUID NOT NULL REFERENCES accounts(id)`, `created_at`, la misma `FOREIGN KEY (child_id, account_id)` e índice `(child_id, created_at)`. Aplicarla a la base local con el script de `node`/`pg` o `psql` que ya use el repo.
- [X] T003 [P] (TDD) Escribir `backend/internal/catalog/vaccines_test.go` (molde: las pruebas de `ListSymptoms`): solo las activas, en `sort_order`, `[]` y no `null` si no hay; una retirada (`active = false`) no aparece; el JSON es `{ "vaccines": [{ "code", "name" }] }` y **no trae ninguna edad ni calendario**. Las filas de prueba se agregan con `code` `test_…` y `sort_order` alto y se borran al terminar (como `tempSymptom`).
- [X] T004 Implementar en `backend/internal/catalog/` (`model.go` tipo `Vaccine`, `repository.go` `ListVaccines`, `handler.go` `ListVaccines` con anotaciones Swagger y `@Router /catalog/vaccines [get]`) y registrar `r.Get("/catalog/vaccines", d.Catalog.ListVaccines)` **público** en `backend/internal/server/router.go` junto a `/catalog/symptoms` (añadir su fila pública en `router_test.go`). Respuesta por `*httpx.Responder`. Hace pasar T003.
- [X] T005 [P] Frontend: `frontend/src/shared/catalog/useVaccines.ts` (molde: `useSymptoms`, `VACCINES_QUERY_KEY`, `staleTime` de 10 min) y su prueba `useVaccines.test.tsx`.

**Punto de control**: migración aplicada en local; `go test ./internal/catalog ./internal/server -cover` en verde; `npx vitest run src/shared/catalog` en verde. **Commit de fase**: «feat(046): migración 0028 y catálogo de vacunas».

---

## Fase 2: Historia 1 — Dosis a mano, backend (Prioridad: P1) 🎯 MVP

**Objetivo**: crear, listar, corregir y borrar dosis con todas sus reglas. **Prueba independiente**: con las rutas, crear tres dosis de un hijo, listarlas, corregir una (con huella) y borrar otra, sin foto.

### Pruebas primero (TDD)

- [X] T006 [P] [US1] Escribir `backend/internal/vaccination/testhelpers_test.go` (pool con `DATABASE_URL`, saltar si falta; crear cuenta de pago, hijo con `birth_date`, un segundo hijo de **otra** cuenta, y un helper para sembrar una dosis) y `validate_test.go` para la validación pura de `validate.go`: exactamente uno de `vaccineCode`/`customName` (error en el campo `vaccine`); `customName` 1–100 (recortado); `appliedOn` obligatoria y `AAAA-MM-DD`; **no posterior a la fecha UTC del servidor + 1 día** ni **anterior a `birth_date`** (error en `appliedOn`); `doseNumber` 1–20; `lot` ≤ 60; `place` ≤ 120; `notes` ≤ 500; los mensajes en español y **fijos** (no repiten lo escrito).
- [X] T007 [P] [US1] Escribir `backend/internal/vaccination/repository_test.go` contra la base real: crear con código del catálogo y con `custom_name`; **la base rechaza** un `(child_id, account_id)` que no sea el real (llave compuesta), ambos o ninguno de código/nombre (CHECK), longitudes fuera de rango y `corrected_by` sin `corrected_at`; un `vaccine_code` retirado se rechaza al crear pero un registro que ya lo tiene se puede corregir; listar de `applied_on DESC, created_at DESC`; `name` es el del catálogo (aunque esté retirada) o el `custom_name`; duplicado = misma vacuna (mismo código, o mismo `custom_name` sin distinguir mayúsculas ni acentos), `dose_number` y `applied_on` en el mismo hijo; corregir llena `corrected_by_account_id`/`corrected_at` y devuelve el **nombre de pila** (nunca el correo); borrar de verdad; un id de otro hijo es `ErrNotFound`.
- [X] T008 [P] [US1] Escribir `backend/internal/vaccination/handler_test.go` (molde: `appointment/handler_test.go`): 201/200/204 felices; 400 `validation_error` con `details` por campo; **409 `duplicate_vaccination`** y 201 con `allowDuplicate: true`; 404 `vaccination_not_found` (inexistente o de otro hijo); ninguna respuesta contiene un correo; y **una prueba de que `error_logs` y los mensajes de error nunca traen** el `customName`, el lote, el lugar ni las notas (patrón `TestErrorLogsNeverCarryTheTokenNorTheEmail` de `family`).

### Implementación

- [X] T009 [US1] Crear `backend/internal/vaccination/model.go` (`Vaccination`, `Input`, `Photo`), `errors.go` (`ErrNotFound`, `ErrDuplicate`, `ErrPhotoLimit`, `ValidationErrors`) y `validate.go` (la validación pura de T006 con los límites **textuales** de T002; la fecha de «hoy» se inyecta para poder probar). Hace pasar T006.
- [X] T010 [US1] Implementar `backend/internal/vaccination/repository.go` (dosis): `Create` (una transacción: lee `birth_date` y `account_id` del hijo **con la misma `tx`**, valida la fecha, busca el duplicado, inserta), `List`, `Update` (solo los campos enviados; llena `corrected_*`; revisa el duplicado excluyéndose a sí misma), `Delete`. **Dentro de la transacción solo se usa `tx`** (nunca el pool: lección de la spec 045). El nombre de pila de quien creó/corrigió sale de `accounts.first_name` en la misma consulta. Hace pasar T007.
- [X] T011 [US1] Implementar `backend/internal/vaccination/service.go` y `handler.go` (`ListVaccinations`, `CreateVaccination`, `UpdateVaccination`, `DeleteVaccination`; cuerpo máximo 16 KiB; Swagger con `@Router /children/{childId}/vaccinations` etc.; **todas las respuestas por `*httpx.Responder`**; el 409 y los 400 con mensajes fijos). El actor es la cuenta de la sesión (`access.FromContext(ctx).ActorAccountID`). Hace pasar T008.
- [X] T012 [US1] Registrar en `backend/internal/server/router.go` (`Deps.Vaccination`) **y** en `backend/cmd/api/main.go` las rutas de dosis de `contracts/api.md`: `r.With(seesChild).Get("/children/{childId}/vaccinations", …)` y `r.With(fullChild)` para `Post`, `Patch /children/{childId}/vaccinations/{vaccinationId}` y `Delete`. En `backend/internal/server/router_test.go` agregar **una fila por ruta** en las matrices que ya recorren dueña, Tutor, Cuidador, rol Hijo, persona quitada, Tutor de una familia sin plan y ajena (`seesChild` = Mark, `fullChild` = Full).
- [X] T013 [US1] Regenerar Swagger: `cd backend && go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd` y confirmar que el diff solo trae lo nuevo.

**Punto de control**: `go vet ./... && go test ./internal/vaccination ./internal/server -cover` (>90 % en `vaccination`). **Commit de fase**: «feat(046): dosis de la cartilla — repositorio, rutas y permisos (backend)».

---

## Fase 3: Historia 2 — Fotos de la cartilla, backend (Prioridad: P1)

**Objetivo**: subir, listar (solo metadatos), abrir y borrar fotos con el tope de 10. **Prueba independiente**: subir dos fotos de un hijo, ver la lista sin imágenes, abrir una y borrar otra, sin dosis.

- [X] T014 [P] [US2] (TDD; la firma de imagen se extrajo a `internal/imagecheck` y `consultation` la usa, sin duplicarla) Escribir `backend/internal/vaccination/photo_validate_test.go`: la imagen se reconoce por su firma (JPEG, PNG, GIF, WebP, HEIC/HEIF; **reutilizar** la lógica de `consultation.looksLikeImage` —extraerla a una función exportada de un paquete común o copiar la firma con una prueba que la mantenga igual, decidir sin duplicar si es posible—), `photoBase64` base64 válido, **máximo 5 MiB decodificados** y cuerpo de petición **8 MiB**; un archivo que no es imagen o pasa de 5 MiB = 400 `validation_error` en `photoBase64` con mensaje fijo.
- [X] T015 [P] [US2] (TDD) Escribir `backend/internal/vaccination/photo_repository_test.go` contra la base real: subir y listar (`id`, `createdAt`, `createdByName`, **sin** la imagen); abrir una por id; id de otro hijo = `ErrNotFound`; borrar de verdad; **tope `MaxPhotosPerChild = 10`**: la 11 devuelve `ErrPhotoLimit`, y tras borrar una cabe otra; el tope es **por hijo** (otro hijo de la misma cuenta sube las suyas) y **igual en ambos planes**; **carrera**: 4 subidas a la vez cuando hay 9 → exactamente una entra, **con el pool limitado a 4 conexiones** (`DATABASE_URL=…&pool_max_conns=4`; la prueba debe terminar y no colgarse); la `CHECK (octet_length(photo) > 0)` rechaza una foto vacía.
- [X] T016 [P] [US2] (TDD) Escribir `backend/internal/vaccination/photo_handler_test.go`: 201 con `{ id, createdAt, createdByName }`; 422 `photo_limit_exceeded` con `reason: "vaccine_card"` y `limit: "10"`; `GET` de la lista `{ photos, limit: 10 }`; `GET` de una foto `{ id, photoBase64 }`; 404 `photo_not_found`; 204 al borrar; sin correos en ninguna respuesta; y que `error_logs` no trae el contenido de la foto.
- [X] T017 [US2] Implementar en `backend/internal/vaccination/` (`photo.go`, ampliando `repository.go`, `service.go`, `handler.go`) `AddPhoto` (**una transacción que bloquea la fila del hijo**: `SELECT … FROM children WHERE id = $1 FOR UPDATE`, cuenta las fotos del hijo y, si hay `MaxPhotosPerChild` o más, `ErrPhotoLimit`; si no, inserta; **solo se usa `tx`**), `ListPhotos` (sin la columna `photo`), `GetPhoto`, `DeletePhoto`, con anotaciones Swagger y todas las respuestas por `*httpx.Responder`; límite de cuerpo 8 MiB (`http.MaxBytesReader`). Hace pasar T014–T016.
- [X] T018 [US2] Registrar en `backend/internal/server/router.go` y `backend/cmd/api/main.go` las rutas de fotos: `seesChild` para `Get /children/{childId}/vaccine-card-photos` y `Get …/{photoId}`; `fullChild` para `Post` y `Delete …/{photoId}`; una fila por ruta en `router_test.go` con la misma matriz de roles. Regenerar Swagger (T013).

**Punto de control**: `go vet ./... && go test ./... -cover` y `DATABASE_URL=…&pool_max_conns=4 go test ./internal/vaccination -count=2` sin colgarse. **Commit de fase**: «feat(046): fotos de la cartilla con tope de 10 por hijo (backend)».

---

## Fase 4: Historia 1 — Cartilla manual, frontend (Prioridad: P1) 🎯 MVP

**Objetivo**: la cartilla por hijo en dos diseños, con alta, corrección y borrado. **Prueba independiente**: en el navegador, agregar tres dosis, corregir una, borrar otra y ver el estado vacío, sin foto. **Nota**: no hay mock entregado; se construye con `design-tokens.md` y las reglas de «Sistema visual» de `frontend/CLAUDE.md` (un solo botón sólido por pantalla, sin rojo de alerta médica, ámbar nunca como advertencia).

### Lo puro y los textos (TDD)

- [ ] T019 [P] [US1] (TDD) Escribir y luego crear `frontend/src/features/vaccinations/types.ts` (`Vaccination`, `VaccinePhotoMeta`, `VaccinationInput`) y `groupByVaccine.ts` con `groupByVaccine.test.ts`: agrupa por vacuna (mismo `vaccineCode`, o mismo `customName` sin distinguir mayúsculas ni acentos), dosis por fecha ascendente dentro del grupo, grupos por su dosis más reciente, **sin ningún dato calculado de «faltan» o «completa»** (la prueba lo verifica: la forma del resultado no tiene esos campos).
- [ ] T020 [P] [US1] (TDD) Crear `frontend/src/features/vaccinations/vaccineText.ts` (**todos los textos de la función en un solo lugar**: títulos, estado vacío, frase neutral permanente de FR-017 «Lo registrado es lo que tú capturaste y no sustituye la cartilla ni el criterio de tu médico», mensajes de error, confirmación de borrado «No se puede deshacer», «Corregida el {fecha} por {nombre}», explicación del tope de fotos) y `vaccineText.test.ts` con la **prueba de redacción**: ningún texto (ni los de `parseVaccineText`) contiene `toca`, `atras`, `completa`, `incompleta`, `alerta`, `urgente`, `recomend`, `debes`, `semáforo`, `rojo`, ni consejos de salud, y cada estado (vacío, error, tope) tiene una salida.
- [ ] T021 [P] [US1] Crear `frontend/src/features/vaccinations/api.ts` (`fetchVaccinations`, `createVaccination`, `updateVaccination`, `deleteVaccination`, `VaccinationApiError` con `kind` `validation_error`|`duplicate`|`not_found`|`forbidden`|`unknown` y `details`; **los textos libres solo en el cuerpo**, jamás en la dirección) y `hooks.ts` (`['vaccinations', childId]`, mutaciones que invalidan; `useVaccinations`, `useSaveVaccination`, `useDeleteVaccination`) con `api.test.ts` y `hooks.test.tsx` (rutas, métodos, que nada salvo los ids viaja en la dirección, el 409 con `allowDuplicate`).

### Pantallas

- [ ] T022 [US1] Crear `frontend/src/features/vaccinations/VaccineDialog.tsx`: diálogo (portal, `role="dialog"`, `aria-modal`, Escape, foco que vuelve al botón que lo abrió, hoja desde abajo en móvil y centrado en web como `ConfirmDialog`) para **agregar y corregir**: «Vacuna» (una lista con el catálogo `useVaccines` y la opción «Otra…» que abre un campo de texto), «Fecha de aplicación» (`<input type="date">` con `max` = hoy local y `min` = fecha de nacimiento del hijo), «Dosis» (número 1–20, opcional), «Lote», «Lugar o médico», «Nota» (opcionales; límites 60/120/500 con contador); **sin placeholders con datos de ejemplo**; el 409 muestra «Ya tienes esta vacuna con esta dosis y fecha» con «Guardar de todos modos» (reenvía con `allowDuplicate`); los errores del servidor por campo; salir con datos pide confirmar (`useUnsavedWork`). Con `VaccineDialog.test.tsx` (alta con código, alta «otra», corrección precargada, fecha fuera de rango, 409 y confirmación, estados de envío).
- [ ] T023 [US1] Crear `frontend/src/features/vaccinations/VaccineList.tsx` y `VaccineGroup.tsx`: cada grupo con el nombre de la vacuna y sus dosis («Dosis 2 · 14 mar 2021 · Centro de salud», `formatDateShort`), la huella «Corregida el … por Ana» cuando exista, y «Corregir»/«Borrar» **solo si `canAdd`**; **sin porcentajes, sin conteos de pendientes, sin colores de estado**; el borrado abre el `ConfirmDialog` de `features/family/ConfirmDialog.tsx` en tono `ink` con las palabras de `vaccineText.ts` y «No se puede deshacer». Con `VaccineList.test.tsx`.
- [ ] T024 [US1] Crear `frontend/src/features/vaccinations/VaccinationCardPage.tsx` y la ruta `/children/:childId/cartilla` en `frontend/src/App.tsx` (dentro de `RequireSession`): **dos diseños con `useIsDesktop`** (móvil: encabezado oscuro con el nombre del hijo y «← Volver», una columna; web: dentro de `AppShell` con la lista y el panel de fotos, enlace «← Inicio» a la página del hijo), «+ Agregar vacuna» (el **único botón sólido**), la frase neutral permanente, estados **cargando**, **error con «Reintentar»** y **vacío** con la salida «Agregar vacuna» (y, en la Fase 5, «Guardar foto de la cartilla»). Con `VaccinationCardPage.test.tsx` a móvil y web (`stubMatchMedia`).
- [ ] T025 [US1] Crear `frontend/src/features/vaccinations/CardEntry.tsx` (tarjeta «Cartilla de vacunación» con el conteo de dosis y de fotos, sin juicio, un `Link` a la cartilla) y montarla en `frontend/src/features/consultations/ChildDetailPage.tsx` en **ambos diseños**, junto a las secciones de citas, suplementos y actividades. Con `CardEntry.test.tsx` y la prueba de `ChildDetailPage` actualizada.
- [ ] T026 [US1] `cd frontend && npm run build && npx eslint src && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4` en verde (la cobertura de `features/vaccinations` > 90 %).

**Punto de control**: el flujo del MVP funciona en el navegador (agregar, corregir, borrar, estado vacío) en 390 y 1280 px. **Commit de fase**: «feat(046): cartilla manual — pantalla, diálogo y tarjeta de entrada (frontend)».

---

## Fase 5: Historias 2 y 3 — Fotos y ayuda de lectura, frontend (Prioridades: P1 y P2)

**Objetivo**: guardar y ver fotos de la cartilla y, opcionalmente, proponer filas desde la imagen. **Prueba independiente**: guardar dos fotos, abrir una, borrar otra; y con un texto leído simulado, ver filas propuestas, editar una, descartar otra y confirmar el resto.

- [ ] T027 [P] [US2] Generalizar `frontend/src/features/consultations/PhotoViewer.tsx` con una propiedad opcional `label` (por omisión «Foto de la receta», para no cambiar nada existente) que se usa en el `aria-label` y en el `alt`; actualizar su prueba y verificar que `ConsultationDetailPage` no cambia.
- [ ] T028 [P] [US2] (TDD) Ampliar `frontend/src/features/vaccinations/api.ts` y `hooks.ts` con `fetchPhotos`, `fetchPhoto`, `uploadPhoto` (`{ photoBase64 }`), `deletePhoto` y los hooks `usePhotos`, `useUploadPhoto`, `useDeletePhoto` (la imagen solo se pide al abrirla), con su prueba: el 422 `photo_limit_exceeded` (`reason: "vaccine_card"`) se convierte en el `kind` del tope.
- [ ] T029 [US2] Crear `frontend/src/features/vaccinations/CardPhotos.tsx`: botón «Guardar foto de la cartilla» que abre un **`<input type="file" accept="image/*">` oculto SIN `capture`** y **sin `getUserMedia`** (el teléfono ofrece Fototeca / Tomar foto / Elegir archivo; nunca `sr-only` para este input), **`shrinkPhoto` reutilizado** de `consultations/shrinkPhoto.ts` antes de enviar, miniaturas con la fecha, abrir en grande con `PhotoViewer label="Foto de la cartilla"`, «Borrar» con `ConfirmDialog` (solo si `canAdd`), el tope «Ya guardaste 10 fotos de esta cartilla. Borra una para guardar otra» sin perder nada, y el aviso neutral cuando el navegador no puede reducir la imagen. Con `CardPhotos.test.tsx` (incluye que el input **no** tiene `capture`).
- [ ] T030 [P] [US3] (TDD) Escribir y luego crear `frontend/src/features/vaccinations/parseVaccineText.ts` con `parseVaccineText(text, catalog)` **puro**: encuentra fechas (`dd/mm/aa`, `dd/mm/aaaa`, `dd-mm-aaaa`, `dd mmm aaaa` con meses en español), las valida contra la fecha de nacimiento y hoy, y el nombre por **coincidencia sin acentos ni mayúsculas** contra el catálogo (`code`) o lo deja como «otra» con el texto leído; devuelve `ProposedRow[]` (`name`/`code`, `appliedOn`, `doseNumber?`) **sin guardar nada**; texto vacío o sin coincidencias → `[]`. `parseVaccineText.test.ts` con varios formatos y con basura de OCR.
- [ ] T031 [US3] Crear `frontend/src/features/vaccinations/ProposedRows.tsx` (cada fila propuesta **editable** —nombre con el mismo selector, fecha, dosis—, **descartable** y **confirmable una a una**; «Confirmar las seleccionadas» guarda solo esas con `useSaveVaccination`; si la fecha es inválida se marca en la fila; mensaje «No encontramos vacunas en la foto. Puedes capturarlas a mano» sin bloquear nada; barra de progreso de lectura como la receta) y conectarla en `CardPhotos.tsx`: tras elegir la foto se llama a **`useOcrSuggestion().runOcr(file)` reutilizado** (tesseract en el teléfono, nunca un servicio externo) y se pasa su texto a `parseVaccineText`. Con `ProposedRows.test.tsx` (hook simulado: filas, editar, descartar, confirmar solo algunas, lectura vacía o fallida, fecha inválida).
- [ ] T032 [US2] Montar `CardPhotos` en `VaccinationCardPage.tsx` en ambos diseños (móvil: sección bajo la lista; web: panel a la derecha) y completar el estado vacío con «Guardar foto de la cartilla». Ajustar `VaccinationCardPage.test.tsx`.
- [ ] T033 [US2] `cd frontend && npm run build && npx eslint src && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4` en verde.

**Punto de control**: se puede guardar una foto, verla, borrarla, y ver filas propuestas con un texto simulado. **Commit de fase**: «feat(046): fotos de la cartilla y ayuda de lectura (frontend)».

---

## Fase 6: Historia 4 — Acceso familiar y privacidad (Prioridad: P2)

**Objetivo**: el Cuidador solo ve y la privacidad queda al día. **Prueba independiente**: con un Tutor y un Cuidador, el Tutor registra y el Cuidador ve sin poder editar.

- [ ] T034 [US4] Frontend: en `VaccinationCardPage`, `VaccineList`, `VaccineGroup` y `CardPhotos` decidir **todo** lo de escritura con `useChildAccess(account, childId).canAdd` (no con `account.plan`): el Cuidador, el rol Hijo y el Tutor de una familia sin plan **no ven** «Agregar», «Corregir», «Borrar» ni «Guardar foto», y no ven ninguna explicación de plan (no hay función de pago); mientras la cuenta no carga no se ofrece nada. Pruebas en cada componente para los cuatro casos (`dueña`, `Tutor`, `Cuidador`, `Tutor sin plan`).
- [ ] T035 [P] [US4] Privacidad: subir `CurrentDisclaimerVersion` en `backend/internal/account/disclaimer.go` (fecha del cambio) y agregar a `frontend/src/features/home/WelcomeDisclaimer.tsx` la frase «Las vacunas y las fotos de la cartilla de tu hijo son datos de salud: se guardan solo en tu cuenta y las personas que invites podrán verlas según su rol.»; actualizar las pruebas de `WelcomeDisclaimer.test.tsx` y cualquier prueba del backend que fije la versión.
- [ ] T036 [P] [US4] Backend: en `backend/internal/vaccination/` una prueba de integración que recorra **el nivel por rol** contra la base real con la familia real (dueña `paid`, Tutor, Cuidador, otra cuenta): el Cuidador lee dosis y fotos y recibe 403 en cada escritura; la ajena recibe 403 en todo; **un Tutor cuya familia dejó de pagar baja a solo lectura** (regla de la spec 032) y recupera la escritura si vuelve a pagar. Complementa la matriz de `router_test.go` de T012/T018.
- [ ] T037 [US4] `go vet ./... && go test ./... -cover` y `npm run build && npx vitest run` en verde.

**Punto de control**: Cuidador solo lectura en pantalla y servidor; aviso nuevo. **Commit de fase**: «feat(046): acceso familiar de solo lectura y aviso de privacidad actualizado».

---

## Fase 7: E2E, documentación y cierre

- [ ] T038 [P] Ampliar `frontend/e2e/helpers.ts` con `vaccinationViaApi(request, token, childId, input)` y `vaccinePhotoViaApi(request, token, childId)` (la foto `PNG_BASE64` que ya existe) para sembrar sin pasar por la interfaz.
- [ ] T039 Escribir `frontend/e2e/cartilla.spec.ts` (a 390 y 1280 px con `designs`; **solo Chromium**, no agregar a `CROSS_BROWSER_SPECS`): (1) un Tutor agrega una vacuna del catálogo y otra «otra», las ve agrupadas, corrige una (ve «Corregida el … por Ana»), la borra tras la confirmación y ve el estado vacío; (2) la fecha futura y la anterior al nacimiento muestran el error y no guardan; (3) agregar la misma vacuna, dosis y fecha pide confirmar y guarda con «Guardar de todos modos»; (4) guarda una foto (archivo de prueba), la abre en grande, la borra; con 10 fotos sembradas la 11 explica el tope; (5) la ayuda de lectura con la imagen en blanco dice «No encontramos vacunas» y deja capturar a mano (las filas propuestas con texto se prueban en Vitest con el hook simulado, T031); (6) **Cuidador con dos sesiones** (`secondPerson`, `inviteViaApi`, `acceptViaApi`) ve la cartilla y las fotos sin botones de escribir, y el `POST` directo por la API responde 403; (7) una cuenta ajena recibe 403 por la API; (8) la tarjeta «Cartilla de vacunación» de la página del hijo lleva a la cartilla y no hay desborde horizontal.
- [ ] T040 [P] Documentar: `CLAUDE.md` raíz (spec 046 en «Current features»), `backend/CLAUDE.md` (paquete `internal/vaccination`, migración `0028` en la lista, `GET /catalog/vaccines` en `internal/catalog`, las rutas, `MaxPhotosPerChild`, la regla de solo `tx` dentro de la transacción), `frontend/CLAUDE.md` (carpeta `features/vaccinations/`, que la foto va sin `capture`, `parseVaccineText`, la prueba de redacción, `useVaccines`, el `label` de `PhotoViewer`, `cartilla.spec.ts`), `DEPLOY.md` (migración `0028` **antes** del backend y validar la lista de vacunas sembrada) y `BACKLOG.md` (confirmar la próxima dosis; agregar «diseño de la cartilla con Claude Design» si el dueño lo pide y «enmendar el Principio III de la constitución: ya no se usa `capture`»).
- [ ] T041 [P] Marcar en `specs/046-cartilla-vacunacion/tasks.md` las tareas hechas y en `spec.md` el estado «Implementada».
- [ ] T042 Verificación completa: `cd backend && go vet ./... && go test ./... -cover` (>90 % en `internal/vaccination`; repetir `internal/server` una vez si es inestable bajo carga) y con `pool_max_conns=4`; `go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd` **sin cambios**; `govulncheck ./...`; `cd ../frontend && npx vitest run --coverage --testTimeout=30000 --maxWorkers=4 && npm run build && npx eslint src e2e`; buscar en lo nuevo que no haya llaves ni datos reales.
- [ ] T043 Revisión de código (`/code-review`), un commit por fase y abrir el PR a `develop` con la nota de despliegue (migración `0028` primero). Si las E2E o el CI fallan, corregir antes de pedir fusionar.

### Tareas del dueño del producto

- [ ] T044 [DUEÑO] Aplicar la migración `0028` en la base de DEV (Railway) **antes** de desplegar el backend de esta rama (mismo método que la `0025` a `0027`). **Bloquea el despliegue.**
- [ ] T045 [DUEÑO] Validar la lista de vacunas sembrada con la Cartilla Nacional de Salud vigente de la Secretaría de Salud y corregirla con SQL si hace falta (`INSERT` con `sort_order` libre, `UPDATE … SET active = false` o `name`). No bloquea el despliegue.
- [ ] T046 [DUEÑO] Actualizar el **aviso de privacidad** (LFPDPPP) para mencionar vacunas y fotos de la cartilla. Bloquea el lanzamiento **real**, no la implementación.
- [ ] T047 [DUEÑO] Probar con un **iPhone real** (PWA instalada en DEV): tomar la foto de una cartilla física, ver la ayuda de lectura, abrir y borrar la foto. Decidir si se pide un diseño a Claude Design para las pantallas (hoy no hay mock).

---

## Dependencias y orden

- **Fase 1** bloquea todo (migración y catálogo). T002 → T003/T004; T005 es independiente.
- **Fase 2** (US1 backend) depende de la Fase 1. **Fase 3** (US2 backend) depende de la Fase 2 solo por `model.go`/`errors.go`/`router`; sus pruebas T014–T016 son paralelas.
- **Fase 4** (US1 frontend) depende de la Fase 2 (rutas) y de T005. **Fase 5** (US2 y US3 frontend) depende de la Fase 3 y de la Fase 4.
- **Fase 6** (US4) depende de las Fases 2 a 5. **Fase 7** al final.
- **Dentro de cada fase**: las pruebas (TDD) antes del código; `[P]` cuando tocan archivos distintos.

### Oportunidades de paralelización

- Fase 1: T003 y T005.
- Fase 2: T006, T007 y T008 (archivos de prueba distintos).
- Fase 3: T014, T015 y T016.
- Fase 4: T019, T020 y T021.
- Fase 5: T027, T028 y T030.
- Fase 6: T035 y T036.
- Fase 7: T038, T040 y T041.

## Estrategia de implementación

- **MVP**: Fases 1, 2 y 4: el padre registra, corrige y borra las vacunas de su hijo a mano, con el aviso del plan sin tocar. Se puede probar y mostrar antes de seguir.
- **Incremento 2**: Fases 3 y 5 (fotos y ayuda de lectura).
- **Incremento 3**: Fases 6 y 7 (acceso familiar completo, E2E, documentación y PR).
- **No se construye** (backlog): próxima dosis con aviso, esquema de referencia, enlace foto↔vacuna, historial de correcciones, papelera.
