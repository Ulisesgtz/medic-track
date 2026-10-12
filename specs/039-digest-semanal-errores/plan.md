# Plan de Implementación: Digest semanal de errores por correo

**Rama**: `feature/039-digest-semanal-errores` | **Fecha**: 2026-10-12 | **Especificación**: [spec.md](./spec.md)

## Resumen

Solo backend, sin rutas ni pantallas nuevas. Un paquete nuevo, `internal/errordigest`, que corre dentro del proceso del API (como `internal/retention` y el planificador de suplementos) y, una vez por semana, arma y manda **un correo de texto plano** con lo que registró `error_logs` en los últimos 7 días. Cinco piezas pequeñas (research R1–R9):

1. **Contenido** (`content.go`): reutiliza el resumen de la spec 021 y le agrega a `errorlog` tres cosas chicas —`Stats` (total, grupos y cuentas distintas), `OldestEntry` y un filtro `ExcludeEndpointPrefix`— para separar peticiones de procesos (`job:`) y contar cuentas **sin listarlas** (R4).
2. **Unicidad por semana** (`repository.go`, migración `0024`, tabla `error_digest_runs`): la semana ISO es la llave; se **reclama** con un *lease* (`INSERT … ON CONFLICT … WHERE lease vencido`) y solo se marca `sent` o `failed` al terminar. Una copia que muere a medio envío la retoma otra al vencer el lease, y la **llave de idempotencia** del proveedor evita que ese reintento mande dos correos (R2).
3. **Envío** (`sender.go`): interfaz `Sender` mínima + implementación por HTTP para **Resend** (sin SDK, timeout, sin seguir redirecciones, 3 intentos con esperas crecientes solo para fallas reintentables) y un doble para pruebas (R1, R7).
4. **Programador** (`schedule.go`, `service.go`): hora de Ciudad de México con `time/tzdata` embebido; un ticker de un minuto decide si «ya es hora» de la semana en curso; recupera dentro de la misma semana y nunca una semana pasada (R3).
5. **Configuración** (`config.go`): variables de entorno; sin `RESEND_API_KEY` el proceso no arranca y lo dice **una vez** (R6). Las fallas se reportan con `jobreport` como `job:error-digest`, con mensajes fijos (R7).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.2. **Dependencias**: ninguna nueva (`net/http`, `encoding/json`, `time/tzdata`, `regexp`, `strings`).

**Almacenamiento**: PostgreSQL; migración `0024_create_error_digest_runs.sql` con una tabla pequeña (una fila por semana enviada). `error_logs` no cambia.

**Pruebas**: `go test` con base real para la unicidad (dos procesos a la vez, lease vencido, filas `sent`/`failed` que no se reclaman), reloj inyectable para el programador, un `Sender` falso para reintentos, un servidor `httptest` para el adaptador de Resend (cuerpo, cabeceras, clasificación de errores, sin redirecciones) y una prueba que busca correos, UUID y tokens en el cuerpo generado; cobertura >90 % (Principio VI). Sin frontend ni Playwright.

**Plataforma Objetivo**: el mismo servicio del API en Railway (`backend/Dockerfile`, distroless). **Tipo de Proyecto**: web-service (solo backend).

**Objetivos de Rendimiento**: una consulta de unas pocas decenas de ms por semana; el ticker de un minuto no toca la base salvo cuando ya es hora.

**Restricciones**: nada de datos de personas, tokens, claves ni ids de cuenta en el correo ni en los registros (FR-007, FR-013); ni la clave, ni el destinatario, ni el remitente se escriben en logs ni en `error_logs`; una falla del digest no frena nada más; apagado sin esperar al proveedor más de unos segundos; sin rutas nuevas, así que no se toca `server/router.go`.

**Escala/Alcance**: un correo por semana a una dirección (muy por debajo de los 3,000 al mes y 100 al día del plan gratis de Resend).

## Verificación de la Constitución

- **I**: nada médico; el correo habla de errores técnicos. ✅
- **II**: el proveedor es un tercero, pero solo recibe mensajes fijos de error, nombres de rutas, estados y conteos; nunca correos, ids de cuenta (solo «N cuentas afectadas»), notas, doctores ni medicamentos. Hay además una **limpieza defensiva** de correos y UUID en el texto (R5). No hay venta ni compartición de datos de usuarios. ✅
- **III**: Go + PostgreSQL, sin tecnología nueva; el proveedor se usa por HTTP. ✅
- **IV**: sin relación con planes ni cuentas. ✅
- **V**: un paquete, una tabla de una fila por semana y siete variables de entorno; sin dependencias nuevas, sin pantallas. Justificado: es la única forma de enterarse de lo que falla en el campo sin reseñas de tienda. ✅
- **VI**: cobertura >90 % con pruebas de unicidad, reintentos y privacidad (FR-016). ✅
- **Reglas del repo**: sin endpoints nuevos (la regla del `Responder` y del router no aplica); los fallos del proceso se reportan por `jobreport` (spec 018); código y esquema en inglés, docs en español. ✅

*Re-verificación tras el diseño de la Fase 1*: sin cambios; el diseño no agregó dependencias ni superficie nueva. ✅

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/039-digest-semanal-errores/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones R1–R9 y alternativas
├── data-model.md        # Fase 1: tabla error_digest_runs, Stats, estados
├── quickstart.md        # Fase 1: cómo probarlo de punta a punta
├── contracts/
│   ├── email.md         # asunto y cuerpo del correo, con ejemplo
│   ├── configuration.md # variables de entorno y valores por omisión
│   └── resend-request.md# petición a Resend, respuestas y clasificación de errores
├── checklists/requirements.md
└── tasks.md             # lo crea /speckit-tasks
```

### Código Fuente

```text
backend/
├── migrations/0024_create_error_digest_runs.sql
├── cmd/api/main.go                      # errordigest.ConfigFromEnv → arranca el proceso solo si hay clave
└── internal/
    ├── errorlog/                        # Stats, OldestEntry, Filter.ExcludeEndpointPrefix (+ pruebas)
    └── errordigest/                     # NUEVO
        ├── config.go                    # Config, ConfigFromEnv, Available
        ├── schedule.go                  # semana ISO en hora de CDMX, instante programado, ¿toca ya?
        ├── content.go                   # Digest, Build, Render (asunto + cuerpo), limpieza defensiva
        ├── repository.go                # Claim (lease), MarkSent, MarkFailed
        ├── sender.go                    # Sender, ResendSender, errores reintentables
        ├── service.go                   # Run/RunEvery, Tick, reintentos con esperas inyectables
        └── *_test.go
CLAUDE.md, backend/CLAUDE.md, DEPLOY.md, BACKLOG.md
```

**Decisión de Estructura**: un paquete aparte (`errordigest`) en lugar de meterlo en `errorlog` o `retention`: `errorlog` es solo acceso a la tabla y `retention` solo borra; el digest tiene su propia tabla, proveedor y reglas de programación. Es el mismo reparto de las specs 018 y 021.

## Seguimiento de Complejidad

Sin violaciones de la constitución que justificar.
