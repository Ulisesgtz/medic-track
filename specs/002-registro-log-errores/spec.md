# Especificación de Funcionalidad: Registro de Log de Errores del Backend

**Rama de la Funcionalidad**: `002-registro-log-errores`

**Creado**: 2026-09-16

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Crear un sistema de registro (logging) de errores del backend, ya que la app no tiene tienda de aplicaciones donde los usuarios puedan reportar bugs y no tenemos forma de saber qué errores les están sucediendo en producción. Alcance: solo el registro (Create/insert) de errores — la consulta/lectura de estos registros y el envío del digest semanal por correo son tareas futuras separadas, NO están en este alcance. Cuando ocurra un error en el backend (por ejemplo cualquier respuesta 4xx o 5xx que ya manejamos en internal/httpx, o un error inesperado no capturado), el sistema DEBE registrar una entrada con: mensaje de error, código HTTP (cuando exista), endpoint/ruta donde ocurrió, archivo y línea de código donde se originó el error, el account_id del usuario afectado (NO el email, para evitar guardar datos personales identificables en el log de errores), y la fecha/hora del evento. El account_id debe ser opcional/nulo para errores que ocurren antes de que exista una cuenta. El punto de enganche natural es internal/httpx, que ya centraliza todas las respuestas de error. No incluye en este alcance: consulta/listado de errores, el job de digest semanal por email, ni la elección del proveedor de email."

## Aclaraciones

### Sesión 2026-09-16

- Q: ¿Por cuánto tiempo deben conservarse las entradas del log de errores antes de poder eliminarse? → A: Sin política de purga por ahora — se acumula indefinidamente; la retención se decide en una tarea futura.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - El sistema registra automáticamente cada error del API (Prioridad: P1)

Como responsable técnico de PediTrack, cuando un usuario real experimenta un error en el backend (por ejemplo, un dato inválido rechazado, un correo duplicado, o una falla inesperada del servidor), quiero que ese error quede registrado en una tabla de la base de datos automáticamente, sin que ningún endpoint tenga que acordarse de hacerlo explícitamente — porque hoy no tenemos ninguna visibilidad de qué le está fallando a los usuarios en producción (no hay tienda de aplicaciones con reseñas ni sistema de reportes).

**Por qué esta prioridad**: Es el valor central de la funcionalidad — sin la captura automática, no existe ningún registro que consultar más adelante. Es la base sobre la que se construirán la consulta y el digest semanal (fuera de alcance aquí).

**Prueba Independiente**: Se puede probar por completo provocando distintos tipos de error contra el API (p. ej., un campo inválido, un correo duplicado, un límite freemium excedido) y verificando que cada uno crea una fila nueva en la tabla de log de errores con los datos correctos, sin necesidad de que exista aún ninguna interfaz de consulta.

**Escenarios de Aceptación**:

1. **Dado** que un cliente envía una solicitud que el servidor rechaza con un código de error (4xx o 5xx), **Cuando** el servidor responde con ese error, **Entonces** el sistema registra una entrada de log con el mensaje de error, el código HTTP, el endpoint/ruta, y la fecha/hora del evento.
2. **Dado** que el error ocurre durante la creación de una cuenta (antes de que la cuenta exista), **Cuando** se registra el error, **Entonces** el campo de identificador de cuenta queda vacío/nulo, sin que esto impida guardar el resto de la información del error.
3. **Dado** que el error ocurre en una solicitud asociada a una cuenta ya existente, **Cuando** se registra el error, **Entonces** el identificador de esa cuenta queda asociado a la entrada de log (nunca el correo electrónico del usuario).
4. **Dado** que el registro del error en sí mismo fallara (p. ej. problema de conexión a la base de datos), **Cuando** eso ocurre, **Entonces** el sistema NO DEBE impedir que la respuesta de error original llegue al cliente — registrar el error nunca debe romper la respuesta al usuario.

---

### Historia de Usuario 2 - Cada entrada de log señala dónde ocurrió el error en el código (Prioridad: P2)

Como responsable técnico, cuando reviso el log de errores, quiero saber en qué archivo y línea de código se originó cada error, para poder ir directo a esa parte del código sin tener que reproducir el problema manualmente.

**Por qué esta prioridad**: Aporta valor de diagnóstico significativo, pero el sistema ya es útil con la Historia 1 sola (saber que algo falló y con qué frecuencia). Esta historia hace cada entrada más accionable.

**Prueba Independiente**: Se puede probar provocando errores desde distintos puntos del código (p. ej., un error de validación en el registro de cuenta vs. un error del catálogo de países) y verificando que cada entrada de log señala un archivo y línea distintos, correspondientes al punto real donde se generó el error.

**Escenarios de Aceptación**:

1. **Dado** que ocurre un error en un punto específico del código del backend, **Cuando** se registra la entrada de log, **Entonces** esa entrada incluye el archivo y el número de línea de origen del error.

---

### Casos Límite

- ¿Qué pasa si dos errores ocurren casi al mismo tiempo para la misma solicitud (p. ej., un error de validación con varios campos inválidos)? El sistema registra una sola entrada de log por respuesta de error enviada al cliente, no una por cada campo inválido individual.
- ¿Qué pasa con errores que no llegan a generar una respuesta HTTP (p. ej., el proceso del servidor se cae por completo)? Quedan fuera de alcance de esta funcionalidad — solo se registran errores que sí producen una respuesta HTTP hacia el cliente.
- ¿Qué pasa si el mensaje de error contiene datos sensibles del usuario (p. ej., un fragmento de un nombre inválido)? Se acepta que el mensaje de error pueda contener el valor del campo rechazado cuando eso ya es parte del comportamiento actual de validación (igual que ya se le muestra al propio usuario en la respuesta); lo que NUNCA se guarda es el correo electrónico como identificador de la cuenta.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El sistema DEBE registrar una entrada de log por cada respuesta de error (4xx o 5xx) que el backend envíe a un cliente, sin requerir que cada handler lo invoque manualmente.
- **FR-002**: Cada entrada de log DEBE incluir: el mensaje de error, el código de estado HTTP, el endpoint/ruta donde ocurrió, el archivo y línea de código de origen, el identificador de cuenta asociado (si existe), y la fecha/hora del evento.
- **FR-003**: El identificador de cuenta DEBE ser opcional — el sistema DEBE permitir registrar errores sin ninguna cuenta asociada (p. ej., errores durante el registro de una cuenta nueva que aún no se ha creado).
- **FR-004**: El sistema NUNCA DEBE almacenar el correo electrónico del usuario en la tabla de log de errores; solo el identificador interno de cuenta (UUID).
- **FR-005**: Una falla al registrar una entrada de log NUNCA DEBE impedir ni alterar la respuesta de error que el servidor ya iba a enviar al cliente original.
- **FR-006**: El sistema DEBE aplicar el registro de errores en el mecanismo compartido que el backend ya usa para construir todas sus respuestas de error, de forma que cubra automáticamente todos los endpoints existentes sin duplicar lógica de registro en cada uno por separado.
- **FR-007**: Esta funcionalidad NO DEBE incluir ningún endpoint ni interfaz para consultar, listar o exportar las entradas de log — eso es una tarea futura separada.
- **FR-008**: Esta funcionalidad NO DEBE incluir el envío de correos ni ningún job programado (digest semanal) — eso es una tarea futura separada.

### Entidades Clave

- **ErrorLog**: Representa una entrada individual de error ocurrido en el backend. Atributos clave: mensaje de error, código de estado HTTP (opcional — no todo error tiene uno claro), endpoint/ruta de la solicitud, archivo y línea de código de origen, identificador de cuenta asociado (opcional), fecha/hora del evento. No tiene relación de edición ni eliminación en este alcance — es un registro de solo-append.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El 100% de las respuestas de error (4xx/5xx) que el backend envía a través de los endpoints existentes genera una entrada de log correspondiente, verificable directamente en la base de datos.
- **SC-002**: Ninguna entrada de log contiene el correo electrónico del usuario en ningún campo.
- **SC-003**: Un responsable técnico puede identificar el archivo y línea de origen de cualquier error registrado sin tener que reproducir el error manualmente.
- **SC-004**: La introducción del registro de errores no agrega un retraso perceptible (menos de 50ms) a las respuestas de error existentes, y nunca causa que una solicitud falle por una razón distinta a la que ya iba a fallar.

## Supuestos

- Los "errores" en alcance son únicamente respuestas HTTP 4xx/5xx que el backend ya construye y envía a través del punto centralizado `internal/httpx`; no incluye advertencias internas, logs de acceso normales (2xx/3xx), ni fallas catastróficas del proceso que impiden responder al cliente.
- El identificador de cuenta se obtiene únicamente cuando ya está disponible en el contexto de la solicitud (p. ej., un error ocurrido al crear/consultar una cuenta ya identificada); no se agrega autenticación ni sesión nueva para obtenerlo en solicitudes que hoy no la tienen.
- El almacenamiento de estas entradas es en la misma base de datos PostgreSQL del proyecto (ver Principio III de la constitución: stack tecnológico fijo), no un servicio externo de logging.
- La consulta/lectura de este log (por un humano o por el futuro digest semanal) es una tarea futura separada y no se diseña aquí más allá de que los datos queden estructurados de forma consultable.
- Por el Principio II de la constitución (Privacidad y Protección de Datos), esta funcionalidad no introduce ningún nuevo dato personal identificable más allá del identificador interno de cuenta ya existente.
- No se define ninguna política de retención ni purga automática de entradas de log en este alcance (Sesión de aclaración 2026-09-16) — las entradas se acumulan indefinidamente; una política de retención/limpieza queda como tarea futura separada, a decidir cuando haya visibilidad real de volumen.
