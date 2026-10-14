# Especificación de Funcionalidad: Citas sin consulta previa, con doctor y lugar

**Rama**: `bugfix/044-backlog-campos-proxima-cita` · **Creada**: 2026-10-13 · **Estado**: Implementada (el código se empezó **antes** de esta spec; ver «Nota de proceso»)
**Sigue a**: `specs/033-recordatorios-suplementos-citas/parte2/` (próxima cita de una consulta)

> **Nota de proceso.** Esta funcionalidad se empezó a construir sin spec, plan ni tareas. El dueño lo señaló el 2026-10-13 y se registró aquí
> con el estado real: `tasks.md` marca lo ya hecho y lo pendiente. A partir de aquí se sigue el SDD.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 — Agregar una cita desde la página del hijo, sin haber registrado una consulta (Prioridad: P1)

Hoy una cita solo se anota al registrar una consulta o desde el detalle de una consulta ya guardada. Un padre que **ya tiene una cita
con el pediatra y no ha tenido consulta** (o no quiere inventar una) no puede anotarla. Quiere un botón «Agregar cita» en la página
principal de su hijo.

**Por qué esta prioridad**: es lo que pidió el dueño; sin esto las citas dependen de una consulta que quizá no existe.

**Prueba independiente**: con un hijo sin consultas y plan de pago, tocar «Agregar cita» en su página, escribir con quién es, fecha y hora, guardar y ver la cita en «Próxima cita» del hijo.

**Escenarios de Aceptación**:

1. **Dado** un Tutor con plan de pago y un hijo **sin consultas**, **cuando** toca «Agregar cita» en la página del hijo, **entonces** se abre la pantalla «Agregar próxima cita» con ¿Con quién es la cita?, fecha, hora, lugar, liga, nota y avisos.
2. **Dado** ese formulario con doctor, fecha y hora, **cuando** guarda, **entonces** la cita aparece como «Próxima cita» del hijo con el doctor escrito, sin la liga «De la consulta del…», con sus avisos programados.
3. **Dado** un hijo que ya tiene una cita vigente, **cuando** agrega otra desde su página, **entonces** se guarda (no hay tope de una por hijo; el tope de una vigente es **por consulta**) y «Próxima cita» muestra la más cercana.
4. **Dado** un Cuidador (o quien solo ve), **cuando** abre la página del hijo, **entonces** no ve «Agregar cita» (solo un Tutor/dueña con plan de pago agrega, como hoy).
5. **Dado** una cuenta gratuita, **entonces** el botón «Agregar cita» no se ofrece; si llega a la pantalla por la dirección ve los campos bloqueados con «Disponible en el plan completo», y el servidor responde 422 `reason: "appointments"` a cualquier intento (la ventana del plan se abre si el servidor lo rechaza al guardar, sin perder lo escrito).

### Historia de Usuario 2 — Anotar doctor y lugar de la cita, y abrirlo en Google Maps (Prioridad: P1)

El padre quiere que la cita diga **con quién** es y **dónde** (consultorio, hospital, dirección) y poder abrir ese lugar en el mapa.

**Prueba independiente**: escribir un lugar, tocar «Buscar … en Google Maps» (abre Google Maps en otra pestaña con la búsqueda), pegar la liga que copió de Maps y guardar; la tarjeta de la cita muestra el lugar y «Abrir en Maps».

**Escenarios de Aceptación**:

1. **Dado** el formulario de una cita (con o sin consulta), **cuando** escribe un Lugar, **entonces** aparece «Buscar «<lugar>» en Google Maps», un enlace que abre `google.com/maps/search/?api=1&query=<lugar>` en otra pestaña (`noopener`); **solo al tocarlo** el texto del lugar llega a Google.
2. **Dado** una liga pegada en «Liga de Google Maps», **cuando** no empieza con `https://`, **entonces** el campo dice «La liga debe empezar con https://» y no se guarda (también el servidor la rechaza con 400 `locationUrl`).
3. **Dado** una cita guardada con lugar, **cuando** se ve su tarjeta, **entonces** muestra el lugar y «Abrir en Maps»: la liga guardada si la hay, si no la búsqueda del lugar; sin lugar ni liga no hay enlace.
4. **Dado** una cita **de una consulta**, **cuando** se agrega o se edita, **entonces** puede llevar lugar y liga; el doctor sigue siendo el de la consulta salvo que la cita tenga uno propio.

### Historia de Usuario 3 — Los avisos y los permisos son los de siempre (Prioridad: P2)

Una cita sin consulta se comporta como cualquiera: avisos por persona (`appointment_notice_reminders`), «Tus avisos», marcar realizada/cancelar (Tutor), historial, la familia la ve. Tocar su aviso lleva al inicio (no hay consulta a la cual ir).

**Escenarios de Aceptación**:

1. **Dado** una cita sin consulta con avisos, **cuando** llega su hora, **entonces** cada persona con acceso y dispositivo recibe un aviso (texto neutro, sin imperativos); con detalle dice hijo, doctor propio, hora y nota.
2. **Dado** una cita sin consulta marcada «realizada», **cuando** el Tutor toca «Deshacer», **entonces** vuelve a «programada» (sin la regla de una vigente por consulta).

### Casos Límite

- Doctor vacío en una cita sin consulta: el formulario lo pide («Escribe con quién es la cita.»); el servidor lo permite vacío (se muestra sin nombre).
- Liga con otro esquema (`http:`, `javascript:`, `data:`), con usuario o sin host, o de más de 500 caracteres: se rechaza.
- Doctor > 200 caracteres, lugar > 300: 400.
- La fecha de una cita sin consulta no se compara con ninguna fecha de consulta (no hay).
- Editar una cita de una consulta sin mandar doctor no borra nada: sigue leyendo el doctor de la consulta.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Una cita puede existir **sin consulta** (`consultation_id` nulo); pertenece al hijo y a la cuenta dueña.
- **FR-002**: `POST /children/{childId}/appointments` (nivel Full sobre el hijo, plan de pago bajo el bloqueo de la cuenta dueña) crea una cita sin consulta con las mismas reglas de avisos que la de una consulta; sin la regla de una vigente por consulta.
- **FR-003**: Toda cita guarda `doctor_name` propio (vacío = el de su consulta), `location` (≤ 300) y `location_url` (≤ 500, solo `https` con host y sin usuario). Se aceptan al crear y editar, de una consulta o no.
- **FR-004**: La respuesta de una cita trae `consultationId` (nulo si no tiene), `doctorName` (el propio o el de la consulta), `location` y `locationUrl`; `consultDate` vacío sin consulta.
- **FR-005**: «Agregar cita» está en la página del hijo (móvil y web) solo para quien puede agregar y con plan de pago; el formulario pide doctor, fecha, hora, lugar, liga, nota y avisos.
- **FR-006**: «Buscar en Google Maps» es un enlace que el padre toca; **ningún dato se manda a Google sin ese toque** (sin claves, sin Places API, sin cargar mapas incrustados).
- **FR-007**: En el móvil, «Fecha de la cita» y «Hora de la cita» van una bajo la otra (arregla el traslape visto en iPhone el 2026-10-13); en la web, lado a lado.
- **FR-008**: El aviso de una cita sin consulta no lleva `consultationId`; al tocarlo el dispositivo abre el inicio.
- **FR-009**: Sin migraciones destructivas: las citas existentes quedan igual (doctor vacío = el de su consulta, lugar y liga vacíos).
- **FR-010**: Nunca se sugiere ni se interpreta nada médico (Principio I); el lugar y el doctor son texto que el padre escribe tal cual (Principio II: no se mandan a terceros salvo el toque de FR-006).

### Entidades Clave

- **Cita** (`consultation_appointments`): ahora con `consultation_id` opcional, `doctor_name`, `location`, `location_url`.

## Criterios de Éxito *(obligatorio)*

- **SC-001**: Un Tutor agrega una cita a un hijo sin consultas en menos de un minuto, sin salir de la página del hijo.
- **SC-002**: Ninguna petición a Google ocurre sin un toque del padre (comprobable en E2E: no hay peticiones a `google.com` al escribir el lugar).
- **SC-003**: Ninguna cita existente cambia su doctor, su fecha ni sus avisos tras la migración.
- **SC-004**: Cobertura > 90 % en backend y frontend; E2E a 390 y 1280 px del flujo.

## Supuestos

- **Google Maps sin llave** (decisión del 2026-10-13, respondiendo «¿qué tan difícil es seleccionar la ubicación?»): elegir el lugar **dentro de la app** con autocompletado y mapa requeriría la API de Google Places/Maps (llave de Google Cloud, facturación por uso, cargar scripts de Google en la PWA y mandar a Google lo que el padre teclea mientras escribe: choca con el Principio II y con la CSP de `_headers`). **No se hace.** Lo que se hace es gratis y sin llave: texto + un enlace de búsqueda a Google Maps + pegar la liga de «Compartir». Si más adelante se quiere el selector integrado, es una spec aparte (Places API + CSP + aviso de privacidad) y queda en `BACKLOG.md`.
- La cita sin consulta no se compara con ninguna fecha anterior; se permite cualquier fecha futura (las pasadas ya se aceptan hoy).
- «Agregar cita» no existe para la cuenta gratuita (se ve el aviso del plan al intentarlo, como en el resto).
- Fuera de alcance: mapa incrustado, autocompletado de direcciones, abrir en Apple Maps/Waze, copiar la dirección, editar el doctor de una cita de consulta desde su formulario.
