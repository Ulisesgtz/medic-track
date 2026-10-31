# Tareas: Exportar el historial a PDF (spec 050)

**Entrada**: `plan.md`, `spec.md`, `research.md` (R1–R7), `data-model.md`, `contracts/api.md`, `quickstart.md`, `referencia/`
**Rama**: `feature/050-exportar-historial-pdf` (ya trae el commit del CI en cinco jobs, la spec y el plan). **Un commit por fase.**
**Pruebas**: obligatorias (Principio VI, > 90 %) y E2E del flujo a 390 y 1280 px (Chromium).
**Reglas del repo**: archivos CRLF (editar con scripts de Python o la herramienta Write; los heredocs de bash se rompen con apóstrofes); `npm run build` compila también las pruebas; vitest con `--testTimeout=30000 --maxWorkers=4`; `DATABASE_URL=postgres://root:abcd1234@localhost:5432/pediTrack?sslmode=disable`; todo endpoint por `*httpx.Responder`; dentro de una transacción solo `tx`; los textos libres nunca en direcciones ni `error_logs`; dos diseños con `useIsDesktop`, nunca mezclados.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración — spike de la biblioteca de PDF

**Propósito**: comprobar antes de construir que `@react-pdf/renderer` hace lo que el mock pide (R1, R2).

- [X] T001 Instalar versiones exactas `@react-pdf/renderer@4.9.0` y `@fontsource/figtree@5.3.0` en `frontend/package.json` (`npm install --save-exact`) y confirmar que `npm run build` sigue pasando.
- [X] T002 Crear `frontend/src/features/pdfExport/document/fonts.ts`: `registerFonts()` que registra Figtree (400, 600, 700, 800, 900) con `Font.register` desde los WOFF de `@fontsource/figtree` importados como URL de recurso (`?url`), y cae a Helvetica si falla; desactivar la partición de palabras (`Font.registerHyphenationCallback(w => [w])`).
- [X] T003 Crear `frontend/src/features/pdfExport/document/loadRenderer.ts`: `loadRenderer()` hace `import('@react-pdf/renderer')` (chunk aparte) y `registerFonts()` una sola vez; nada de la biblioteca se importa de forma estática fuera de `document/`.
- [X] T004 Spike en `frontend/src/features/pdfExport/document/spike.test.tsx`: armar un documento Carta con encabezado y pie `fixed` («Generado con PediTrack el … · Página X de Y» con `render`), una consulta con notas largas que cruza de página y, **dentro de su `View`**, elementos `fixed` con `render={({ subPageNumber, subPageTotalPages, pageNumber })}` que digan «(continuación)» cuando `subPageNumber > 1` y «Continúa en la página N →» cuando la consulta sigue; una imagen JPEG. Generar el blob en jsdom/node y extraer el texto (p. ej. con `pdfjs-dist` en la prueba o buscando las cadenas) para comprobar las tres frases y las páginas.
- [X] T005 Medir el tamaño del chunk de la biblioteca (`npm run build`, tamaño del archivo del chunk y gzip) y anotarlo en `specs/050-exportar-historial-pdf/research.md` (R1); si «Continúa en la página N» o alguna otra cosa no se pudo, anotarlo en research y en `referencia/desviaciones.md` antes de seguir. Borrar o convertir el spike en prueba útil.

**Punto de control**: la biblioteca sirve para el mock. **Commit**: «feat(050): biblioteca de PDF y spike del documento».

---

## Fase 2: Fundamental — el endpoint de datos (bloquea las historias)

- [X] T006 [P] En `backend/internal/consultation/`: agregar `PlanLimitPDFExport = "pdf_export"` a las razones de `PlanLimitError`, exponer `RequirePaid(ctx, childID)` (el mismo `accountPlanOf` que usa `requirePaid`) y un `GetByIDWithoutPhoto` (o una opción de `GetByID`) que no lea la columna `photo`.
- [X] T007 [P] `backend/internal/consultation/`: `Repository.Photo(ctx, consultationID)` y el handler `GET /consultations/{consultationId}/photo` → `{ "photoBase64": "…" }` (vacío si no hay foto), por `*httpx.Responder`, con Swagger.
- [X] T008 Crear `backend/internal/historyexport/model.go` y `request.go`: el pedido de `contracts/api.md` (`period.kind` = `all` | `range` | `filters`; `range` exige `from` y `to` días con `from ≤ to`; `filters` se valida con `consultation.validateHistorySearch` —exponerla si hace falta—; `sections.consultations`/`vaccinations` al menos una en `true` → si no, `validation_error` campo `sections`; `photos` opcional `false`); traducir el periodo a un `consultation.HistorySearch`.
- [X] T009 `backend/internal/historyexport/service.go`: `Service.Build(ctx, childID, req, now)` — primero `RequirePaid` (422 `pdf_export` **aunque solo se pida la cartilla**, sin leer nada más); hijo (nombre, apellido, nacimiento, talla, peso); consultas con `Search` (orden más reciente primero) y su detalle sin foto; por medicamento los conteos `taken`, `unregistered`, `pending`, `total` **sin las canceladas** (spec 013/016, `StatusAt` con el reloj del servidor), primera y última toma, `lastMark` (hora y nombre de pila de quien marcó, cuenta o teléfono del hijo), `endedAt`, `extensions`; próxima cita `scheduled` por consulta y la general del hijo; tratamiento en curso (el de `GetOverview` con el doctor de su consulta); **todas** las vacunas (`vaccination.List`, con quien corrigió); `photos` solo si se pidieron (consultas del periodo con foto y `vaccination.ListPhotos`).
- [X] T010 `backend/internal/historyexport/handler.go`: `POST /children/{childId}/export` por `*httpx.Responder` (400 con campos, 404 `child_not_found` id mal formado, 422 `freemium_consultation_limit_exceeded` `reason: "pdf_export"` sin datos), cuerpo máx. 16 KiB, con Swagger. Ningún campo del pedido en el mensaje de error.
- [X] T011 Registrar en `backend/internal/server/router.go`: `POST /children/{childId}/export` con `seesChild` y `GET /consultations/{consultationId}/photo` con `seesConsultation`; cablear en `backend/cmd/api/main.go` (`Deps.HistoryExport`); **no** agregarlas a `/child-device`. Filas nuevas en `backend/internal/server/router_test.go` (`routes()` y la prueba de que la credencial del hijo no las abre).
- [X] T012 [P] Pruebas en `backend/internal/historyexport/service_test.go` y `handler_test.go` contra la base real: familia gratuita → 422 sin datos (también con solo la cartilla); familia de pago → dueña, Tutor y Cuidador obtienen los datos; extraño → 403; `all`/`range`/`filters` (solo las consultas del periodo; la cartilla siempre completa); conteos con un tratamiento finalizado (canceladas fuera) y uno recorrido; consulta «solo registro»; `lastMark` de una cuenta y del teléfono del hijo; sin vacunas; `sections` vacías → 400; nada del pedido (doctor, texto) en `error_logs`. Prueba de `GET /consultations/{id}/photo` (con y sin foto, ajena → 403). Cobertura > 90 %.
- [X] T013 Regenerar Swagger (`go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go -o internal/docs --pd`) y correr `go vet ./...` y `go test ./internal/historyexport/... ./internal/consultation/... ./internal/server/... -cover`.

**Punto de control**: el endpoint responde según el contrato. **Commit**: «feat(050): datos del historial para el PDF (backend)».

---

## Fase 3: Historia de Usuario 1 — generar y compartir el PDF (P1) 🎯 MVP

**Objetivo**: desde el Historial, generar el PDF completo (portada, consultas, cartilla) y compartirlo o descargarlo.
**Prueba independiente**: con un hijo de varias consultas y vacunas, generar desde el Historial y comprobar el archivo (portada, consultas en orden, cartilla, encabezado y pie, nombre).

- [X] T014 [P] [US1] `frontend/src/features/pdfExport/exportText.ts`: **todas** las frases del panel y del documento del mock (títulos, periodo, interruptores, aviso de privacidad, estados, portada, etiquetas de medicamento, registro de tomas, cartilla, anexo, pie) como funciones/constantes; `exportText.test.ts` recorre todas y falla con palabras de evaluación (`toca`, `atraso`, `falta`, `completa` como juicio, `debe`, `alerta`, `recomend`, `pendiente`, porcentajes) como `vaccineText.test.ts`.
- [X] T015 [P] [US1] `frontend/src/features/pdfExport/types.ts` y `api.ts`: tipos del contrato; `fetchExportData(childId, request, token, signal)` (POST, criterio en el cuerpo; `ExportApiError` kinds `plan_required`, `validation_error`, `forbidden`, `unknown`); `fetchConsultationPhoto` y `fetchCardPhoto` con `signal`.
- [X] T016 [P] [US1] Funciones puras en `frontend/src/features/pdfExport/document/model.ts` (+ `model.test.ts`): nombre del archivo (`<Nombre>-<Apellido>-historial-<d>-<mes>-<aaaa>.pdf`, día local, sin acentos ni espacios), edad («5 años 7 meses»), resumen del periodo y de los filtros, conteo de la portada, línea de indicación del medicamento («cada 8 h · 7 días · primera toma 08:00 del 18 oct»), etiqueta de estado («En curso», «Terminado el 20 oct», «Se recorrió el 15 sep · +2 tomas»), registro de tomas («16 de 18 tomas marcadas · 2 sin registrar · 3 por venir · Última marca: 24 oct, 08:05, por Ana»; «sin registro de tomas en la app»), agrupar vacunas por nombre con sus dosis en orden. Probar con los tres casos del mock (A, B, C) como datos de ejemplo en `document/fixtures.ts`.
- [X] T017 [US1] Componentes del documento en `frontend/src/features/pdfExport/document/` (`HistoryDocument.tsx`, `Cover.tsx`, `Consultations.tsx`, `VaccinationCard.tsx`, `PageFrame.tsx`, `styles.ts`) con las medidas del mock (Carta 816×1056 a 96 ppp → puntos; contenido de 680 px; márgenes 68/44/36; texto 15/14/12.5 px; tinta sobre blanco; chips de toma por forma: relleno ✓, punteado, contorno), encabezado y pie fijos, «Continúa en la página N →»/«(continuación)», índice de la portada (segunda pasada con los números de página de cada sección). Prueba en `HistoryDocument.test.tsx` que arma los casos A, B y C y comprueba el texto de las páginas.
- [X] T018 [P] [US1] `frontend/src/features/pdfExport/share.ts` (+ prueba): `canShareFile(file)`, `shareFile(file)` (`navigator.share({ files, title })`; un `AbortError` de la persona no es error) y `downloadFile(blob, name)` (enlace temporal + `URL.revokeObjectURL`).
- [X] T019 [US1] `frontend/src/features/pdfExport/useExport.ts` (+ prueba): máquina de estados `options → generating → ready | error | empty | plan`, etapas de avance (datos, armado; páginas al final), `cancel()` con `AbortController` (sin archivo al cancelar), y el resultado (`blob`, nombre, páginas, tamaño).
- [X] T020 [US1] `frontend/src/features/pdfExport/ExportPanel.tsx` (+ prueba): con `useIsDesktop` una **hoja inferior** (móvil: radio 22, relleno 24/20, asa, botones 52 px) o un **diálogo centrado de 560 px** (web: radio 22, relleno 32); `createPortal`, `useBodyScrollLock`, `role=dialog`, foco atrapado y devuelto al botón, Escape; estados opciones (periodo «Todo el historial» y secciones Consultas/Cartilla en esta historia), generando, listo (móvil: «Compartir» sólido + «Descargar»; web: «Descargar» sólido + «Compartir»; «Compartir» solo si `canShareFile`), error («No se pudo generar el PDF.» + «Intentar de nuevo» + «Cerrar», sin rojo). El aviso de privacidad antes de generar.
- [X] T021 [US1] `frontend/src/features/pdfExport/ExportEntry.tsx` y montarlo en `frontend/src/features/consultations/HistoryPage.tsx` en ambos diseños (móvil: a la derecha del título «Historial»; web: en la fila del título), solo cuando la cuenta ya cargó.

**Punto de control**: el MVP genera y comparte el PDF. **Commit**: «feat(050): generar y compartir el PDF del historial».

---

## Fase 4: Historia de Usuario 2 — periodo, secciones y fotos (P2)

**Objetivo**: elegir el periodo (todo, rango, filtros del historial), qué incluir y las fotos; abrir desde la Cartilla.
**Prueba independiente**: rango y filtros traen solo esas consultas, la cartilla sale completa, el anexo aparece con fotos, «sin datos» se muestra.

- [X] T022 [US2] `ExportPanel.tsx`: periodo «Un rango de fechas» (Desde/Hasta con las fechas nativas del formulario, `from ≤ to`) y «Usar los filtros del historial» (solo si hay filtros; el resumen «Dra. Laura Cázares · Fiebre» de `historyCriteria.ts`); interruptores Consultas, Cartilla y «Fotos de recetas y de la cartilla» con «Con fotos, el archivo pesa más.» (apagado por omisión); «Generar PDF» inactivo sin ninguna sección.
- [X] T023 [US2] `frontend/src/features/pdfExport/photos.ts` (+ prueba): pedir las fotos una por una con avance («Preparando fotos 3 de 7»), convertir cada una a JPEG (lado largo 1600 px, calidad 0.8, como `shrinkPhoto`) y, si el navegador no la decodifica (HEIC), devolver «no incluida» para dibujar el recuadro «Foto que no se pudo incluir en el PDF».
- [X] T024 [US2] Documento: `document/Annex.tsx` («Anexo: fotos» con leyendas del mock), «Receta · Foto en p. N» en cada consulta con foto, el índice incluye el anexo; la portada dice periodo, filtros, secciones, «Fotos: No incluidas» y «Todas las vacunas registradas, sin filtro de periodo». Pruebas con el caso C (filtros) y con fotos.
- [X] T025 [US2] Estado «sin datos» en `useExport`/`ExportPanel` («No hay registros en este periodo» con el rango y el nombre + «Cambiar periodo» que vuelve a las opciones).
- [X] T026 [US2] Montar `ExportEntry` en `frontend/src/features/vaccinations/VaccinationCardPage.tsx` en ambos diseños (junto a «Registrar vacuna»/«+ Agregar vacuna»), abriendo el panel con la cartilla encendida y las consultas apagadas; pasar los filtros actuales desde `HistoryPage`.

**Punto de control**: periodo, secciones y fotos funcionan. **Commit**: «feat(050): periodo, secciones y fotos del PDF».

---

## Fase 5: Historia de Usuario 3 — plan gratuito (P3)

- [X] T027 [US3] `ExportEntry.tsx`: con el plan gratuito de la familia del hijo (`useChildAccess(...).isFree`), el botón «Exportar a PDF» con la marca «Plan completo» (móvil a todo el ancho); al tocarlo, el estado «plan» del panel con `PlanAvisoCompacto` («Exportar a PDF es parte del plan completo» / «Genera un PDF con las consultas, tomas y cartilla de vacunación de <nombre> para llevarlo al pediatra.») y «Ahora no»; si el servidor responde 422 `pdf_export` al generar, el mismo estado. Agregar el motivo a `frontend/src/features/plans/planCopy.ts` solo si se usa `FreemiumLimitModal`. Pruebas en ambos diseños, también para una persona invitada a una familia de pago (puede exportar).

**Commit**: «feat(050): exportar a PDF en el plan gratuito».

---

## Fase Final: Pulido y aspectos transversales

- [X] T028 [P] E2E `frontend/e2e/exportar-pdf.spec.ts` (Chromium, `designs` a 390 y 1280 px): desde el Historial generar y descargar (`page.waitForEvent('download')`; el archivo empieza con `%PDF` y tiene páginas); desde la Cartilla el panel abre con solo la cartilla; rango sin datos; plan gratuito ve la marca y el aviso; Cuidador de una familia de pago puede exportar. Durante la generación ninguna petición sale a otro dominio que el API y la app.
- [ ] T029 Medir la app contra el mock al ancho del mock (390 y 1280; páginas del PDF a tamaño real) sección por sección y completar `specs/050-exportar-historial-pdf/referencia/desviaciones.md`. **Documento medido (2026-10-30/31, casos A, B, C, consulta que cruza y fotos); el panel se vuelve a medir cuando llegue su rediseño de Claude Design.**
- [X] T030 [P] Documentar: `CLAUDE.md` raíz (spec 050 en «Current features»), `backend/CLAUDE.md` (`internal/historyexport`, las dos rutas), `frontend/CLAUDE.md` (`features/pdfExport/`, la biblioteca cargada aparte, el documento y sus pruebas), `BACKLOG.md` (el extra «exportar el historial a PDF» hecho; queda la liga de solo lectura para el médico).
- [X] T031 Verificación completa: `go vet ./...`; `go test ./... -cover` con y sin `pool_max_conns=4`; Swagger sin cambios; `govulncheck ./...`; `npx vitest run --coverage --testTimeout=30000 --maxWorkers=4`; `npm run build` (anotar el tamaño del chunk del PDF); `npx eslint src e2e`; `npx playwright test --list e2e/exportar-pdf.spec.ts`.
- [X] T032 `/code-review` y corregir; marcar las tareas hechas y la spec «Implementada».
- [X] T034 [P] (de la revisión del 2026-10-26) `historyexport`: leer las consultas en lote en vez de una por una (`GetByIDWithoutPhoto` hace síntomas, medicamentos y, por medicamento, tomas y extensiones: ~9 consultas por consulta de 3 medicamentos); una consulta por tabla para todos los ids encontrados y el estado de cada toma con `StatusAt` en Go. Medir con 60 consultas y `pool_max_conns=4`.
- [X] T035 [P] (de la revisión del 2026-10-26) Fuentes: registrar también los archivos `latin-ext` de Figtree (o Helvetica como respaldo) para que un nombre o una nota con «ł», «ő», «ş»… no salga en blanco en el PDF; prueba con esos caracteres en `library.test.tsx`.
- [ ] T033 Push y PR a `develop` (primera corrida del CI en cinco jobs: revisar tiempos y 429 de Clerk; si aparecen, bajar los workers por job a 3).

---

## Dependencias y orden

- Fase 1 (spike) → decide si el documento se construye como está planeado.
- Fase 2 (backend) bloquea US1–US3 (el panel necesita los datos).
- US1 → US2 (amplía el panel y el documento) → US3 (usa el panel).
- Fase final al terminar las historias.

## Ejecución en paralelo

- Fase 2: T006 y T007 a la vez; T012 en cuanto exista el servicio.
- US1: T014, T015, T016 y T018 a la vez; luego T017, T019, T020, T021.
- Final: T028 y T030 a la vez.

## Estrategia

MVP = Fases 1–3 (generar el PDF completo desde el Historial). US2 y US3 se suman en la misma rama y el mismo PR.
