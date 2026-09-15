# Investigación: Registro de Cuenta de Usuario y Perfiles de Hijos

## Router HTTP en Go

**Decisión**: `net/http` estándar + router `chi`.

**Justificación**: `chi` es idiomático, ligero (no impone estructura tipo framework), compatible con middleware estándar de `net/http`, y ampliamente usado en la comunidad Go para APIs REST sencillas — coherente con el Principio V (Simplicidad) de la constitución. No se justifica un framework más pesado (Gin, Echo) para un único endpoint de creación en esta fase.

**Alternativas consideradas**:
- `net/http` puro sin router: viable pero requeriría más código repetitivo para parámetros de ruta; se prefiere `chi` por ergonomía sin sacrificar simplicidad.
- Gin/Echo: más funcionalidades de las necesarias para este alcance; se revisarán si el backend crece en complejidad en fases futuras.

## Driver de PostgreSQL

**Decisión**: `pgx` (jackc/pgx).

**Justificación**: Es el driver de PostgreSQL más usado y mantenido en el ecosistema Go, con buen soporte de tipos nativos de Postgres y mejor rendimiento que `database/sql` + `lib/pq`.

**Alternativas consideradas**: `database/sql` + `lib/pq` (más antiguo, menos activamente mantenido); un ORM completo (GORM) — se descarta por ahora dado el Principio V y porque el esquema de esta feature es simple (2-4 tablas).

## Manejo de formulario dinámico en React

**Decisión**: React Hook Form con `useFieldArray` para el arreglo dinámico de hijos.

**Justificación**: `useFieldArray` está diseñado exactamente para este caso (agregar/quitar bloques de campos repetibles con validación individual), minimiza re-renders, y se integra bien con TypeScript para tipar el arreglo de hijos.

**Alternativas consideradas**: Formik (más pesado, menos performante con arreglos dinámicos grandes); estado manual con `useState` (reinventa validación y manejo de arreglo que React Hook Form ya resuelve).

## Catálogo de País/Estado

**Decisión**: Tabla estática en PostgreSQL (`countries`, `states`) poblada por migración/seed, consultada vía un endpoint de solo lectura (`GET /catalog/countries`, `GET /catalog/countries/{code}/states`).

**Justificación**: Evita dependencia de un servicio externo (menos puntos de falla, sin límites de tarifa de terceros) y es consistente con el Principio V. El listado de países/estados cambia con poca frecuencia, por lo que una tabla propia con seed inicial es suficiente para el MVP.

**Alternativas consideradas**: Servicio externo de geolocalización/catálogo (introduce dependencia de red y posible costo, innecesario para una lista relativamente estática); catálogo embebido como JSON estático en el frontend (se descarta porque el catálogo también es útil para validación del lado del servidor).

## Regla freemium — dónde se aplica

**Decisión**: La validación del límite de 1 hijo gratuito se aplica tanto en frontend (para mostrar el banner de inmediato, FR-007) como en backend (para no confiar solo en el cliente — el backend rechaza con un error específico si detecta más de un hijo sin plan de pago activo).

**Justificación**: Doble validación es el patrón estándar de seguridad (nunca confiar solo en validación de cliente) y cumple la skill `backend-security-coder` recomendada en la constitución para endpoints que aplican reglas de negocio.

**Alternativas consideradas**: Validar solo en frontend — rechazado por ser trivialmente evadible (llamar al endpoint directamente).
