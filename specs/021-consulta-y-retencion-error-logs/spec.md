# Especificación de Funcionalidad: Consultar y depurar los errores registrados

**Rama de la Funcionalidad**: `feature/021-consulta-y-retencion-error-logs`

**Creado**: 2026-09-30

**Estado**: Borrador

**Entrada**: Descripción del usuario: «el de los logs» (backlog: consulta/listado del log de errores, digest semanal por correo y política de retención de `error_logs`). Las specs 002 y 018 **escriben** en `error_logs`; esta spec agrega leerlos y evitar que la tabla crezca sin fin. El digest por correo queda fuera de esta spec (ver Supuestos).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Consultar los errores registrados (Prioridad: P1)

Quien opera el servicio (hoy, el equipo de PediTrack) puede **ver lo que falló** en la app: los errores que vieron los padres (spec 002) y los de los procesos en segundo plano (spec 018), más recientes primero, con un resumen de cuáles se repiten más. Hoy los datos existen pero solo se pueden leer entrando a la base de datos.

**Por qué esta prioridad**: sin poder leerlo, el registro de errores no sirve: es la razón de ser de las specs 002 y 018 («no hay reseñas de tienda donde enterarse»).

**Prueba Independiente**: con varios errores registrados (algunos HTTP y algunos de un proceso), quien opera pide los de los últimos 7 días y recibe la lista, más reciente primero, y el resumen con el conteo por tipo de error; sin la clave de operación no recibe nada.

**Escenarios de Aceptación**:

1. **Dado** la clave de operación configurada y enviada, **Cuando** se piden los errores, **Entonces** se devuelven los más recientes primero, cada uno con su mensaje, estado HTTP (vacío en los de procesos), endpoint (`/accounts`, `job:reminders`…), archivo y línea, cuenta (solo el identificador, nunca el correo) y hora.
2. **Dado** un filtro por periodo, por endpoint (completo o por prefijo como `job:`), por estado HTTP o por cuenta, **Entonces** solo se devuelven los que coinciden.
3. **Dado** muchos errores, **Entonces** la respuesta va en páginas (por omisión 100, máximo 500) y dice cómo pedir la siguiente.
4. **Dado** el resumen de un periodo, **Entonces** agrupa por endpoint, estado y mensaje con el conteo, la primera y la última vez, y el orden es de más a menos frecuente.
5. **Dado** que no se envía la clave, o es incorrecta, **Entonces** se responde sin revelar si la consulta existe ni por qué falló, y no se devuelve ningún dato.
6. **Dado** que la clave de operación no está configurada en el servidor, **Entonces** la consulta no existe (se comporta como una ruta desconocida): no hay puerta abierta por omisión.
7. **Dado** cualquier respuesta, **Entonces** nunca incluye el correo de nadie ni direcciones de dispositivos, claves o tokens (no se guardan en la tabla, spec 002/018).

---

### Historia de Usuario 2 - La tabla no crece sin fin (Prioridad: P1)

Las entradas de `error_logs` más viejas que un periodo de retención se **borran solas** cada día, de modo que la tabla no crezca indefinidamente con datos que ya nadie necesita. El periodo es configurable (por omisión 90 días).

**Por qué esta prioridad**: hoy la tabla solo crece, y con las specs 002 y 018 recibe más filas; sin una política se vuelve un costo y un riesgo de privacidad (datos de error de meses atrás con identificadores de cuenta).

**Prueba Independiente**: con entradas de hace 10, 100 y 200 días y una retención de 90, tras correr la depuración solo queda la de hace 10; la depuración avisa cuántas borró.

**Escenarios de Aceptación**:

1. **Dado** entradas más viejas que la retención, **Cuando** corre la depuración diaria, **Entonces** se borran solo esas, en lotes, sin bloquear las escrituras de errores nuevos.
2. **Dado** que no hay nada que borrar, **Entonces** no pasa nada y no se escribe ruido.
3. **Dado** que la depuración falla (p. ej. la base no responde), **Entonces** el servicio sigue funcionando, la falla queda en la consola y, si la base responde, en `error_logs` como la de cualquier proceso en segundo plano (spec 018: `job:error-logs-retention`).
4. **Dado** una retención configurada por debajo del mínimo de 7 días, **Entonces** se usa el mínimo: un error de configuración no puede borrar el registro reciente.
5. **Dado** que se reinicia el servidor, **Entonces** la depuración vuelve a correr en el siguiente turno sin repetir ni saltarse trabajo (borrar es idempotente).

---

### Casos Límite

- Un error que llegue mientras se depura se escribe con normalidad.
- La primera depuración de una tabla grande borra por lotes y puede tardar varios ciclos; no debe frenar el servicio.
- Los filtros con valores inválidos (fecha mal formada, límite fuera de rango) responden con error de validación, sin consultar.
- Quien opera pide un periodo sin errores: lista vacía y resumen vacío, no un error.
- La clave de operación nunca se registra en `error_logs` ni en la consola.
- Muchas consultas seguidas con clave incorrecta no deben revelar nada ni saturar el servicio (se responde igual de rápido que con una clave correcta sin datos).

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: DEBE existir una consulta de las entradas de `error_logs`, más recientes primero, con filtros por periodo, endpoint (completo o prefijo), estado HTTP y cuenta, y paginación (100 por omisión, máximo 500).
- **FR-002**: DEBE existir un resumen de un periodo que agrupe por endpoint, estado y mensaje con el conteo, la primera y la última vez, ordenado de más a menos frecuente.
- **FR-003**: Ambas consultas DEBEN exigir una **clave de operación** (configurada en el servidor) y responder sin datos ni pistas cuando falta o es incorrecta; la comparación DEBE ser resistente a ataques de tiempo.
- **FR-004**: Sin clave de operación configurada, las consultas NO DEBEN existir (ruta desconocida).
- **FR-005**: Las respuestas NUNCA DEBEN incluir el correo de una persona ni datos que no estén ya en la tabla; la cuenta aparece solo como identificador.
- **FR-006**: DEBE haber una depuración diaria que borre las entradas más viejas que la retención (90 días por omisión, configurable, mínimo 7), por lotes.
- **FR-007**: Una falla de la depuración NO DEBE detener el servicio y DEBE quedar registrada como la de cualquier proceso en segundo plano (spec 018).
- **FR-008**: La clave de operación NO DEBE aparecer en `error_logs`, en la consola ni en las respuestas.
- **FR-009**: Las consultas DEBEN escribir sus respuestas por el mecanismo común (`*httpx.Responder`), de modo que también sus propios errores queden registrados.
- **FR-010**: Esta funcionalidad NO DEBE cambiar nada de lo que los padres ven: sin pantallas, sin cambios en las rutas existentes.

### Entidades Clave

- **Entrada de error** (existente, spec 002/018): mensaje, estado HTTP opcional, endpoint, archivo, línea, cuenta opcional, hora. No se modifica.
- **Resumen de errores**: agrupación derivada por endpoint, estado y mensaje; no se guarda.
- **Clave de operación**: secreto del servidor que identifica a quien opera; no es una cuenta de padre ni una sesión.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Quien opera obtiene los errores de los últimos 7 días, o su resumen, con una sola petición y sin entrar a la base de datos.
- **SC-002**: Sin la clave correcta, el 100 % de las peticiones a las consultas recibe la misma respuesta vacía, sin datos.
- **SC-003**: Ninguna entrada de más de la retención permanece más de un día después de vencer.
- **SC-004**: La depuración no retrasa ni bloquea la escritura de errores nuevos (medible: los errores escritos durante una depuración grande se guardan sin espera visible).
- **SC-005**: Las pruebas del backend mantienen la cobertura por encima del 90 %.

## Supuestos

- «Quien opera» es el equipo de PediTrack: hoy no existe un rol de administrador en la app, así que se usa una **clave de operación** en el servidor (variable de entorno) en vez de una cuenta; si algún día hay un panel con roles, sustituye a esta clave.
- La interfaz es una API de solo lectura pensada para `curl` o una herramienta del equipo; **no hay pantalla** en la app (la app es de los padres).
- Retención por omisión de **90 días** y mínimo de **7** (propuesta mía, configurable en un solo lugar); se depura una vez al día en el proceso del API, como el ticker de recordatorios.
- **Fuera de alcance** (sigue en el backlog): el **digest semanal por correo** —necesita elegir un proveedor de correo y decidir quién lo recibe—, exportar a archivo, alertas en tiempo real, y agrupar errores «parecidos» con lógica propia más allá de endpoint, estado y mensaje. Las consultas de esta spec son la base del digest.
- Depende de: specs 002 (`error_logs`, `Responder`) y 018 (`jobreport`, procesos en segundo plano).
- Sin pantalla ni mock.
