# Investigación: Cartilla de vacunación del hijo

Decisiones de diseño tomadas leyendo el código existente. Formato: Decisión, Justificación, Alternativas.

## R1 — Modelo de datos: tres tablas y una migración (`0028`)

**Decisión**: `vaccine_catalog` (catálogo público de nombres), `vaccine_records` (una fila por dosis aplicada) y `vaccine_card_photos` (una fila por foto). Los registros y las fotos llevan `child_id` **y** `account_id` con la llave compuesta `FOREIGN KEY (child_id, account_id) REFERENCES children (id, account_id)` (la restricción única `children_id_account_id_key` ya existe desde la migración `0012`): la base misma impide que una fila apunte a un hijo de otra cuenta, como `consultation_symptoms`.

**Justificación**: el patrón ya está probado en el proyecto; no hace falta tocar ninguna tabla existente. Un registro por dosis (no por vacuna) deja que «agrupar por vacuna» sea una presentación del cliente y que corregir una dosis no afecte otras.

**Alternativas**: una fila por vacuna con un arreglo de dosis (JSON): descartada, complica corregir/borrar una dosis y las consultas; guardar el nombre libre en el catálogo cuando el padre escribe «otra»: descartada, mezclaría texto libre de cada familia en un catálogo público (privacidad).

## R2 — Nombre de la vacuna: código del catálogo o texto libre, uno solo

**Decisión**: `vaccine_code` (referencia a `vaccine_catalog`, nulo) y `custom_name` (1–100, nulo) con `CHECK` de que **exactamente uno** esté presente. Un registro con código sigue mostrando su nombre aunque la vacuna se retire (`active = false`), igual que los síntomas.

**Justificación**: FR-002 (lista o «otra» escrita tal cual) y la regla de que un código nunca cambia ni se borra. El catálogo se mantiene con SQL sin publicar la app (como `symptoms`): agregar = `INSERT` con un `sort_order` libre, retirar = `active = false`, renombrar = `UPDATE name`.

**Alternativas**: solo texto libre: descartada, impide agrupar con fiabilidad y ayudar a la lectura de la foto.

## R3 — Catálogo: solo nombres, sin esquema

**Decisión**: `vaccine_catalog(code, name, sort_order, active)`; **ninguna** columna de edad, dosis objetivo ni calendario (Principio I). Semilla con unos 16 nombres del esquema mexicano (BCG, hepatitis B, hexavalente acelular, pentavalente acelular, rotavirus, neumocócica conjugada, influenza, SRP, SR, DPT, Td, Tdpa, VPH, hepatitis A, varicela, COVID-19, polio, meningococo…). **La lista exacta se valida con la Cartilla Nacional de Salud vigente antes de publicar** (paso del dueño); por ser SQL se corrige sin publicar. Se sirve público en `GET /catalog/vaccines`, como `GET /catalog/symptoms` (`internal/catalog`).

**Justificación**: reutiliza el molde del catálogo de síntomas (modelo, repositorio, handler, hook de frontend con `staleTime`).

**Alternativas**: incluir el esquema oficial con edades como referencia: descartada por la decisión de la spec (el esquema sugiere qué «toca» y abre riesgo legal).

## R4 — Fotos: tabla aparte con `bytea`, lista de metadatos, imagen bajo demanda

**Decisión**: `vaccine_card_photos(id, child_id, account_id, photo bytea, created_by_account_id, created_at)`. El `GET` de la lista devuelve solo metadatos (`id`, `createdAt`, `createdByName`); la imagen se pide por `GET …/vaccine-card-photos/{photoId}` como JSON `{ photoBase64 }`. La subida es `POST` con `photoBase64` (JPEG tras `shrinkPhoto`, o la original si falla), validada con la misma firma de imagen que la receta (`looksLikeImage`).

**Justificación**: las recetas ya guardan la foto como `bytea` y la sirven en base64 por JSON (así no hay que escribir respuestas binarias fuera del `Responder`, que es el único camino soportado para respuestas). Hasta 10 fotos de ~0.5 MB no deben viajar con cada lista: por eso se piden de una en una. El `<img>` usa un `data:` URL, que es lo que ya hace `PhotoViewer`.

**Alternativas**: almacenamiento de objetos externo: descartada (Principio V, dependencia y costo nuevos); devolver el binario con `Content-Type` de imagen: descartada (no pasa por el `Responder` y exigiría una excepción documentada).

**Tamaño**: máximo **5 MiB** decodificados (un JPEG reducido a 2000 px pesa ~0.3–0.8 MB; el margen cubre una original HEIC que el navegador no pudo reducir) y **8 MiB** de cuerpo de petición (el base64 pesa 4/3). Mayor tamaño = 400 `validation_error` en `photoBase64`.

## R5 — Tope de 10 fotos por hijo, dentro de una transacción con el hijo bloqueado

**Decisión**: `Repository.AddPhoto` abre una transacción, bloquea la fila del hijo (`SELECT … FROM children WHERE id = $1 FOR UPDATE`), cuenta sus fotos y, si hay 10 o más, devuelve `ErrPhotoLimit` (422 `photo_limit_exceeded`, `reason: "vaccine_card"`, `limit: "10"`); si no, inserta. Es independiente de `consultation.MaxPhotosPerAccount` (recetas): constante propia `MaxPhotosPerChild = 10`. Igual en ambos planes.

**Justificación**: el bloqueo del hijo (no de la cuenta) hace que dos subidas a la vez del mismo hijo no tomen el último lugar y no estorba a otros hijos. **Lección de la spec 045**: dentro de la transacción solo se usa `tx` (no otra conexión del pool), y todo dato necesario (p. ej. el nombre del usuario) se lee antes o con la misma `tx`, para no agotar el pool con transacciones que esperan otra conexión.

**Alternativas**: contar sin bloquear: descartada (carrera); restricción en la base: no expresable con un tope numérico simple.

## R6 — API y permisos: rutas anidadas bajo el hijo

**Decisión** (contrato en `contracts/api.md`): todo bajo `/children/{childId}/…`; lectura con `seesChild` (`access.Mark`: el Cuidador ve) y escritura con `fullChild` (`access.Full`). Los ids de un registro o de una foto **se verifican contra el hijo de la ruta** (`WHERE id = $1 AND child_id = $2`): un id de otro hijo es 404, sin necesidad de una consulta de acceso nueva por tipo de recurso. Todas las respuestas por `*httpx.Responder`; cada ruta lleva su fila en `router_test.go` (matriz de dueña, Tutor, Cuidador, rol Hijo, persona quitada, Tutor de una familia sin plan y ajena).

**Justificación**: más simple que `access.OnVaccination`/`OnVaccinePhoto` (que habría que escribir con su SQL y pruebas) y el nivel de acceso ya depende solo del hijo. Un Tutor de una familia cuyo plan terminó baja a `Mark` (regla de la spec 032): solo ve, coherente con el resto de los datos del hijo (spec FR-020 y escenario 3 de la historia 4).

**Alternativas**: rutas planas `/vaccinations/{id}` con una función de acceso nueva: descartada por el costo sin beneficio.

## R7 — Duplicados, fechas y corrección

**Decisión**:
- **Duplicado**: la misma vacuna (mismo `vaccine_code`, o mismo `custom_name` sin distinguir mayúsculas ni acentos), `dose_number` y `applied_on` en el mismo hijo → 409 `duplicate_vaccination`; el cliente reenvía con `allowDuplicate: true` si el padre confirma. No es una restricción única de la base (se permite con confirmación).
- **Fecha**: `applied_on` no puede ser posterior a «hoy» ni anterior a `children.birth_date` (400 `validation_error`, campo `appliedOn`, mensajes en español para la pantalla). Como el servidor no conoce la zona horaria del padre, acepta hasta **un día después** de la fecha UTC del servidor; el formulario del cliente ya bloquea con la fecha local del dispositivo.
- **Corrección**: `PATCH` reemplaza los campos enviados y llena `corrected_by_account_id` y `corrected_at` con la sesión; la respuesta trae `correctedByName` (nombre de pila, **nunca el correo**) y `correctedAt`. No se guarda historial (decisión de la spec).
- **Borrado**: real (`DELETE`), 204.
- **Dosis**: `dose_number` entero 1–20 nullable; `lot` ≤ 60, `place` ≤ 120, `notes` ≤ 500 (CHECK en la base y validación en el servicio, mismos números).

**Justificación**: FR-001 a FR-005, FR-023. Los textos libres (nombre «otra», lote, lugar, nota) solo viajan en cuerpos JSON; los mensajes de error son fijos y no repiten el texto del usuario (FR-022, y el patrón de `TestErrorLogsNever…` de la spec 032).

## R8 — Frontend: carpeta `features/vaccinations/`, página con diálogos

**Decisión**: ruta `/children/:childId/cartilla` (`VaccinationCardPage`, dentro de `RequireSession` y `AppShell`, dos diseños con `useIsDesktop`, **sin mock entregado**: se construye con el sistema visual y `design-tokens.md`; la ausencia de mock se anota en la spec y se avisa al dueño). Entrada desde la página del hijo en ambos diseños: una tarjeta «Cartilla de vacunación» con el conteo de dosis y la foto, **sin juicio** (como `ChildAppointmentSection`). Agregar/corregir vacuna y confirmar borrado son **diálogos** (portal, Escape, foco que vuelve al botón), no páginas: se agregan varias vacunas seguidas y el patrón de `AddChildModal`/`ConfirmDialog` ya existe. El borrado usa el `ConfirmDialog` de `features/family` en tono `ink`, con palabras neutrales y «no se puede deshacer». La lista se agrupa por vacuna en el cliente (`groupByVaccine`, función pura). `useChildAccess(account, childId).canAdd` decide si se dibujan los botones de escribir (el Cuidador no los ve; el servidor igual rechaza).

**Justificación**: Principio V; reutiliza tres piezas completas. Las ediciones frecuentes en un diálogo no pierden el lugar en la lista.

**Alternativas**: páginas de formulario como las citas: descartadas, el flujo de varias dosis seguidas se interrumpe.

## R9 — Foto y ayuda de lectura: reutilizar lo de la receta

**Decisión**: input de archivo oculto **sin `capture`** (el teléfono ofrece Fototeca / Tomar foto / Elegir archivo; `getUserMedia` nunca), `shrinkPhoto` reutilizado tal cual, y `PhotoViewer` generalizado con una propiedad opcional `label` (hoy dice «Foto de la receta» fijo). La ayuda de lectura **reutiliza `useOcrSuggestion`** (tesseract.js en el teléfono, idioma `spa`, nunca un servicio en la nube) para obtener el texto y le agrega una función **pura** `parseVaccineText(text, catalog)` que propone filas: busca fechas (`dd/mm/aa`, `dd-mm-aaaa`, `dd mmm aaaa`) y nombres del catálogo por coincidencia sin acentos ni mayúsculas, y deja todo como **propuesta editable** que el padre confirma fila por fila (`ProposedRows`); nada se guarda sin confirmar. Si no encuentra nada o falla, el flujo sigue a mano (FR-011 a FR-013).

**Justificación**: Principio II (sin nube), no duplica el hook; lo nuevo es solo el análisis del texto, que se prueba sin navegador.

**Alternativas**: un hook `useVaccineOcr` aparte: descartada (duplicaría la carga de tesseract y el control de progreso); IA de visión en la nube: ya rechazada para siempre por el proyecto.

## R10 — Privacidad y aviso

**Decisión**: subir `account.CurrentDisclaimerVersion` con la frase nueva en `WelcomeDisclaimer` («Las vacunas y las fotos de la cartilla son datos de salud de tu hijo y se guardan solo en tu cuenta; las personas que invites podrán verlas según su rol»). Es una consecuencia obligatoria: cada cuenta vuelve a ver el aviso una vez. Actualizar el **aviso de privacidad** (LFPDPPP) es un paso del dueño, fuera del código.

**Justificación**: Principio II y FR-021.

## R11 — Pruebas

**Decisión**: backend contra la base real (llaves compuestas: un hijo de otra cuenta se rechaza por la base; el tope de 10 con dos subidas simultáneas y un pool de 4 conexiones; duplicado y `allowDuplicate`; fechas; la corrección y que nunca sale el correo; niveles de acceso por el router) y pruebas de que ningún error registrado trae los textos libres; frontend unit (>90 %: `groupByVaccine`, `parseVaccineText`, formularios, estados, prueba de redacción de **todos** los textos de la función) y E2E a 390 y 1280 px (`cartilla.spec.ts`, solo Chromium: Tutor completo, Cuidador de solo lectura con dos sesiones, ajena rechazada, subir y borrar foto con una imagen de prueba, la ayuda de lectura con un texto de prueba inyectado, el 409 de duplicado con confirmación).

## R12 — Fuera de alcance confirmado

Sin recordatorios ni próxima dosis (backlog), sin esquema de referencia, sin calendario, sin importación oficial, sin certificados, sin enlace entre foto y vacuna, sin historial de correcciones, sin papelera.
