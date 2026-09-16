# Investigación: Registro de Log de Errores del Backend

## Decisión: Captura de archivo/línea de origen

**Decisión**: Usar `runtime.Caller(1)` (librería estándar de Go) dentro del método `WriteJSONError` del nuevo `httpx.Responder`, para capturar automáticamente el archivo y línea del código que lo invocó (es decir, la línea exacta del handler donde se decidió responder con ese error).

**Justificación**: Cumple FR-001 ("sin requerir que cada handler lo invoque manualmente [el registro]") y FR-002 (archivo/línea de origen) sin que cada punto de error tenga que pasar esos datos explícitamente — el handler solo llama `responder.WriteJSONError(...)` como ya hace hoy con las funciones de `httpx`, y la captura es automática y siempre exacta al call site real.

**Alternativas consideradas**:
- Pasar `file`/`line` manualmente en cada call site (vía macro-like helper) — rechazado: requiere disciplina manual en cada uno de los ~10 call sites existentes y en cada uno nuevo futuro; se puede olvidar, y `runtime.Caller` lo hace gratis y consistente.
- Usar un stack trace completo (`runtime.Stack`) — rechazado: excede lo pedido en la spec (solo archivo+línea de origen, no todo el stack) y agrega ruido/costo innecesario por entrada.

## Decisión: Cómo identificar el endpoint/ruta

**Decisión**: Usar el patrón de ruta templada de `chi` (`chi.RouteContext(r.Context()).RoutePattern()`, p. ej. `/catalog/countries/{countryCode}/states`) en vez de la URL literal de la solicitud, con fallback a `r.URL.Path` si el patrón no está disponible (p. ej. en pruebas unitarias que no pasan por el router).

**Justificación**: El patrón de ruta agrupa correctamente errores del mismo endpoint aunque varíen los parámetros (p. ej. distintos `countryCode`), lo cual es más útil para cualquier análisis futuro del log que la URL literal completa.

**Alternativas consideradas**:
- URL literal completa (`r.URL.Path`) — rechazada como opción principal porque fragmenta el mismo endpoint en múltiples "rutas" distintas según el parámetro recibido; se mantiene solo como fallback.

## Decisión: Cómo evitar que el registro del error rompa o retrase la respuesta original (FR-005, SC-004)

**Decisión**: `Responder.WriteJSONError` escribe la respuesta HTTP de error al cliente primero (comportamiento actual, sin cambios), y dispara el registro de la entrada en una goroutine en segundo plano con un `context.Background()` acotado por un timeout corto (p. ej. 2s), usando el `errorlog.Recorder` inyectado. Cualquier error al insertar en la base de datos se descarta silenciosamente hacia el log de proceso estándar (`log.Printf`), nunca se propaga hacia la respuesta HTTP ya enviada.

**Justificación**: Cumple FR-005 literalmente (una falla al registrar NUNCA debe alterar la respuesta original, que ya se escribió antes de intentar el registro) y SC-004 (sin retraso perceptible, ya que el cliente no espera a que termine el insert).

**Alternativas consideradas**:
- Registrar de forma síncrona antes de responder — rechazada: una base de datos lenta o caída agregaría latencia directa a cada respuesta de error, violando SC-004, y un fallo del insert podría complicar el flujo de respuesta si no se maneja con cuidado extremo.
- Cola/mensajería externa (p. ej. un message broker) — rechazada por Principio III (stack tecnológico fijo: Go + React + PostgreSQL, sin servicios externos nuevos) y por ser una sobreingeniería para el volumen de errores esperado en esta etapa (Principio V, YAGNI).

## Decisión: Forma de inyección del registrador de errores en los handlers existentes

**Decisión**: Convertir las funciones sueltas de `internal/httpx` (`WriteJSON`, `WriteJSONError`) en métodos de un nuevo tipo `httpx.Responder`, construido explícitamente en `cmd/api/main.go` (`httpx.NewResponder(errorlogRepo)`) e inyectado en `account.NewHandler(...)` y `catalog.NewHandler(...)` como un parámetro más de su constructor — reemplazando las llamadas directas a las funciones de paquete que usan hoy.

**Justificación**: Sigue la convención ya establecida en la constitución del proyecto para Go ("Inyección de dependencias: explícita vía constructores... evitar estado global y variables de paquete mutables"); evita agregar una variable global mutable en `httpx` para sostener la conexión a la base de datos.

**Alternativas consideradas**:
- Variable de paquete global en `httpx` seteada una vez al arrancar (`httpx.SetRecorder(...)`) — rechazada: es el patrón de estado global mutable que la constitución pide evitar explícitamente, aunque solo se escriba una vez al inicio.
- Que cada handler reciba su propio `errorlog.Repository` directamente (sin pasar por `httpx`) y lo invoque junto a cada llamada de error — rechazada: duplicaría la lógica de captura de archivo/línea/endpoint en cada handler en vez de centralizarla una sola vez en `httpx`, que es justo el punto de enganche que pide FR-006.

## Decisión: Esquema de la tabla `error_logs`

**Decisión**: Nueva tabla `error_logs` (columnas en inglés, snake_case, por la convención "Idioma del Código" de la constitución): `id UUID PK`, `message TEXT NOT NULL`, `http_status INTEGER` (nullable — no todo error tiene uno claro, ver Entidades Clave en spec.md), `endpoint TEXT NOT NULL`, `file TEXT NOT NULL`, `line INTEGER NOT NULL`, `account_id UUID REFERENCES accounts(id)` (nullable, sin `ON DELETE CASCADE` — se conserva el log aunque la cuenta se elimine en el futuro), `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Sin restricción de longitud/formato adicional (a diferencia de `accounts.first_name`, este campo no es input de usuario final sino un mensaje técnico interno).

**Justificación**: Refleja 1:1 los campos pedidos en FR-002, sigue el mismo estilo de migración ya usado (`0001`-`0004`), y el FK nullable a `accounts.id` sigue el mismo patrón ya usado para `country_code`/`state_code` en la tabla `accounts` (FK opcional, sin bloquear el registro cuando no aplica).

**Alternativas consideradas**:
- Índice en `account_id` o `created_at` desde ya — diferido: no hay caso de uso de consulta en este alcance (FR-007 lo excluye explícitamente); se puede agregar en la tarea futura de consulta/digest cuando se sepa el patrón de acceso real.
