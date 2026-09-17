# Investigación: Detalle de Hijo — Consultas y Recetas

## Decisión: OCR corre del lado del cliente con `tesseract.js`, no en el backend

**Decisión**: La extracción de texto de la foto de la receta (FR-006) se ejecuta en el navegador con `tesseract.js`, antes de que la foto se suba al backend. El backend nunca ve ni procesa la imagen para OCR — solo la recibe y la persiste.

**Justificación**: (1) Principio II (Privacidad) — la foto de una receta médica es el dato más sensible que este proyecto ha capturado hasta ahora; procesarla en el navegador evita enviarla a cualquier servicio de OCR de terceros (Google Vision, AWS Textract, etc.), reduciendo la superficie de exposición de datos de salud de menores a cero servicios externos nuevos. (2) Principio III (Stack Fijo) — no agrega ninguna dependencia backend ni credencial de proveedor cloud que gestionar. (3) Principio V (Simplicidad) — sin esto habría que operar/pagar un servicio de OCR y manejar sus fallos de red; `tesseract.js` corre 100% offline en el cliente.

**Alternativas consideradas**: Un servicio de OCR cloud (Google Cloud Vision, AWS Textract) — más preciso, pero requiere credenciales, cuota/costo por imagen, y envía la foto de la receta a un tercero — rechazado por Principio II dado que existe una alternativa client-side viable para el nivel de precisión que este MVP necesita (ayuda de autollenado, no un OCR de precisión clínica). Un OCR en el backend con Tesseract nativo (`gosseract`, binding cgo) — rechazado por complejidad de build (dependencia del binario `tesseract` del sistema operativo) sin ninguna ventaja de privacidad sobre la opción client-side.

## Decisión: la foto de la receta se guarda como `bytea` en la tabla `consultations`

**Decisión**: La foto se transmite del cliente al backend codificada en la petición (base64 dentro del JSON, o `multipart/form-data`, a definir en el contrato) y se persiste como columna `bytea` en Postgres, no en un sistema de archivos ni en un bucket de object storage.

**Justificación**: No existe todavía ninguna decisión ni infraestructura de almacenamiento de objetos (S3-compatible o similar) en el proyecto — introducirla ahora sería una dependencia de infraestructura nueva sin necesidad probada (Principio V, YAGNI). Postgres ya es la única pieza de almacenamiento del stack (Principio III) y el volumen esperado es bajo (una familia, consultas episódicas, ver Contexto Técnico de plan.md).

**Alternativas consideradas**: Sistema de archivos local del servidor — rechazado porque no sobrevive de forma confiable a un redespliegue/contenedor efímero, y el proyecto no tiene todavía ninguna estrategia de almacenamiento persistente de archivos fuera de la base de datos. Object storage (S3/GCS) — rechazado por ahora como sobre-ingeniería para el volumen actual; queda como candidato natural en `BACKLOG.md` si el volumen de fotos crece.

## Decisión: límite de tamaño de foto de 8 MB

**Decisión**: El endpoint de registro de consulta rechaza fotos mayores a 8 MB, mismo mecanismo que `maxRequestBodyBytes` ya usa `internal/account/handler.go` (`http.MaxBytesReader`), con un límite mayor propio de este endpoint.

**Justificación**: Es un límite técnico de protección (payload-size, ya mencionado como convención de seguridad en backend/CLAUDE.md/handler.go), no una decisión de negocio — 8 MB cubre cómodamente una foto de celular moderna comprimida sin ser excesivo para un `bytea` en Postgres.

**Alternativas consideradas**: Comprimir la imagen del lado del cliente antes de subir — buena mejora futura (reduce el tamaño de la fila en Postgres y el tiempo de subida en redes lentas), pero no es necesaria para que la funcionalidad cumpla sus criterios de éxito; se deja fuera de alcance explícito de este plan (no se agrega a BACKLOG.md por ser un detalle de implementación menor, no una decisión de producto diferida).

## Decisión: las tomas (`doses`) se generan de una sola vez, en la misma transacción que crea la consulta

**Decisión**: Al guardar una consulta con un medicamento que tiene horario de inicio, el backend calcula inmediatamente todas las tomas esperadas (horario de inicio + frecuencia + duración) y las inserta como filas en `doses`, dentro de la misma transacción que inserta la consulta y sus medicamentos.

**Justificación**: Confirmado con el usuario (spec.md, Aclaraciones) — evita cualquier job recurrente o cálculo bajo demanda; una consulta con, por ejemplo, un tratamiento de 10 días cada 8 horas genera 30 filas de una vez, un volumen trivial para Postgres.

**Alternativas consideradas**: Generar las tomas bajo demanda (al abrir el detalle) — más complejo sin ningún beneficio, ya que las tomas no cambian una vez calculadas (la consulta es inmutable, FR-014). Generarlas progresivamente con un job diario — rechazado explícitamente por el usuario, agregaría infraestructura de scheduling sin necesidad.

## Decisión: nuevo paquete `internal/consultation`, no extensión de `internal/account`

**Decisión**: Ver "Decisión de Estructura" en plan.md — Consultation/Medication/Dose son entidades y reglas de negocio nuevas sin relación con las reglas de cuenta/freemium de `account`.

**Justificación**: Mismo criterio de separación por dominio que ya distingue `internal/account` de `internal/catalog`.

## Decisión: `doses.taken` es un booleano actualizable en cualquier momento, sin estado "tratamiento activo"

**Decisión**: La tabla `doses` no tiene ningún campo ni lógica de "tratamiento vigente/expirado" — el endpoint `PATCH .../doses/{doseId}` simplemente actualiza `taken` sin validar fechas.

**Justificación**: Confirmado con el usuario (spec.md, Aclaraciones, FR-016) — cualquier toma se puede marcar/desmarcar sin importar si su fecha ya pasó. Es también la opción más simple: no requiere calcular ni verificar "¿este tratamiento sigue en curso?" en cada petición.

**Alternativas consideradas**: Bloquear el marcado fuera del rango de duración del tratamiento — rechazado explícitamente por el usuario y por Principio V (lógica adicional sin necesidad de negocio).
