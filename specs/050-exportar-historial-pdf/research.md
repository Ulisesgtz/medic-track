# Investigación: Exportar el historial a PDF (spec 050)

## R1. Dónde se arma el PDF

- **Decisión**: en el **navegador del padre**, con `@react-pdf/renderer` **4.9.0** (versión exacta; publicada el 27 ago 2026), cargado con `import()` **solo al tocar «Generar PDF»**.
- **Justificación**: los datos ya llegan al navegador; armarlo ahí evita guardar o procesar el documento en el servidor (Principio II: ningún tercero ni copia), no añade CPU ni fuentes al API en Railway y el documento se escribe como componentes de React (`Document`/`Page`/`View`/`Text`/`Image`) con el mismo sistema visual. Da paginación automática, elementos `fixed` (encabezado y pie en cada página) y `render={({ pageNumber, totalPages, subPageNumber, subPageTotalPages })}`, con lo que se escribe «Página X de Y» y, **dentro de la vista de cada consulta**, un elemento fijo que dice «(continuación)» cuando `subPageNumber > 1` y «Continúa en la página N →» cuando la consulta sigue en la página siguiente (FR-015). Se comprueba en la primera tarea (spike) con el caso A del mock.
- **Alternativas**: *pdfmake* (JSON declarativo, encabezado/pie y `pageBreakBefore` buenos, pero sin componentes, pastillas y bordes punteados difíciles, fuentes en un `vfs` en base64); *jsPDF* (bajo nivel: paginación, cortes y envoltura de texto a mano); *servidor Go* (gofpdf/maroto: fuentes y dibujo a mano, CPU en el API y un archivo con datos de salud generado en el servidor; descartado).
- **Avance «Página N de M»**: `@react-pdf` arma el documento de una vez, sin aviso por página. El avance se informa por **etapas reales**: datos (1), fotos («Preparando fotos 3 de 7»), armado del documento, y al final el número real de páginas. La barra avanza por esas etapas; el texto «Página N de M» del mock se muestra cuando ya se sabe el total. Desviación anotada.
- **Cancelar**: se cancela la petición de datos y las de fotos (`AbortController`); el armado en curso se descarta al terminar (no hay forma de interrumpirlo). No queda archivo.
- **Rendimiento**: el paquete se descarga solo al generar (chunk aparte de Vite); se mide en la tarea del spike y se anota. Meta SC-001: < 15 s con 20 consultas sin fotos.

## R2. Fuentes e imágenes en el PDF

- **Decisión**: Figtree registrada con `Font.register` desde los archivos **WOFF** de `@fontsource/figtree` 5.3.0 (pesos 400, 600, 700, 800, 900, latín y latín extendido), servidos como recursos de la app (sin red externa). Si un archivo no carga, Helvetica.
- **Imágenes**: `@react-pdf` solo incrusta JPEG y PNG. Cada foto se pasa por `createImageBitmap` + canvas a JPEG (como `shrinkPhoto`, lado largo 1600 px, calidad 0.8); la que el navegador no puede decodificar (p. ej. HEIC en Chrome) se sustituye por un recuadro «Foto que no se pudo incluir en el PDF» y la generación sigue.

## R3. API

- **Decisión**: **un endpoint de solo lectura** `POST /children/{childId}/export` con el pedido en el **cuerpo** (como la búsqueda del historial, spec 031: los filtros pueden ser datos de salud y las direcciones quedan en los registros). Devuelve en una respuesta todo el texto del documento; **las fotos se piden aparte por id** (`GET /children/{childId}/vaccine-card-photos/{photoId}`, ya existe, y un nuevo `GET /consultations/{consultationId}/photo`), una por una, con su avance.
- **Justificación**: una respuesta con todas las fotos en base64 podría pasar de 20 MB y llegar de un golpe al teléfono; pedirlas una por una baja la memoria y da avance real. El texto del historial es chico (decenas de KB).
- **Reutiliza**: `consultation.Repository.Search` (filtros y orden; ya exige plan de pago), el detalle por consulta sin la foto, `vaccination.List` y `ListPhotos`, las citas del hijo y el tratamiento en curso de `GetOverview`.
- **Plan**: lo decide el servidor sobre la **cuenta dueña del hijo** (como la búsqueda): si no es `paid`, 422 `freemium_consultation_limit_exceeded` con `reason: "pdf_export"` y ningún dato, **también si solo se pidió la cartilla**.
- **Alternativas**: armar el PDF con las llamadas existentes (lista + un detalle por consulta + vacunas + citas): muchas peticiones y la regla del plan quedaría solo en la pantalla (se descarta: el servidor decide el plan).

## R4. Quién exporta

- **Decisión**: nivel **Mark** (`seesChild`): dueña, Tutor y Cuidador de una familia con plan completo. El teléfono del hijo (spec 047) no tiene la ruta.
- **Justificación**: el PDF no muestra nada que esas personas no vean ya en la app; un Cuidador (abuela que lleva al niño al médico) es justo quien lo necesita.

## R5. Periodo y filtros

- **Decisión**: `period.kind` = `all` | `range` (`from`, `to`, días) | `filters` (los mismos campos que la búsqueda: `q`, `from`, `to`, `doctor`, `medication`, `symptomCodes`, `kind`). El servidor valida con `validateHistorySearch`. **El periodo solo filtra las consultas**; la cartilla va siempre completa (decisión del dueño).

## R6. Compartir y descargar

- **Decisión**: `navigator.canShare({ files: [file] })` → `navigator.share({ files, title })`; si no existe, «Compartir» no se muestra y queda «Descargar» (enlace a un `Blob` con `download`, liberado con `URL.revokeObjectURL`). Un `share` cancelado por la persona no es error.

## R7. Pruebas

- **Unitarias (frontend)**: los textos en `exportText.ts` con prueba de redacción (Principio I); funciones puras del documento (conteos de tomas, etiquetas de estado, agrupar vacunas, nombre de archivo, resumen del periodo); el panel en sus seis estados y los dos diseños; el documento se arma en jsdom con los tres casos del mock y se comprueba el texto de las páginas (`@react-pdf` produce un PDF que se puede leer con su texto).
- **Backend**: el endpoint contra la base real (plan, acceso, periodo, cartilla completa, nada de texto libre en `error_logs`), con su fila en `router_test.go`.
- **E2E** (`exportar-pdf.spec.ts`, Chromium, 390 y 1280 px): generar desde el Historial y desde la Cartilla, descargar el archivo y comprobar que empieza con `%PDF` y tiene páginas; el plan gratuito ve el aviso.
