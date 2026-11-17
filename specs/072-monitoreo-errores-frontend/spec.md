# Especificación de Funcionalidad: Monitoreo externo y errores del frontend

**Rama de la Funcionalidad**: `feature/072-monitoreo-errores-frontend`

**Creado**: 2026-11-17

**Estado**: Borrador

**Entrada**: Descripción del usuario: "072 Monitoreo externo y errores del frontend (BACKLOG, «Antes del primer cobro real», anotado 2026-11-10; elegido por el dueño el 2026-11-17). Problema: `error_logs` solo ve lo que falla en el servidor; una caída del API o una pantalla en blanco en un iPhone se notan hasta el digest semanal del lunes (spec 039). (a) Ruta `/healthz` propia del API que diga si el proceso está vivo y si la base responde, sin datos de nadie, pública y barata, sin escribir en `error_logs`; y un ping externo cada minuto con aviso al dueño cuando el API (y el frontend) no responden y cuando vuelven — el servicio externo lo da de alta el dueño, decidir en el plan cuál (gratuito, sin mandarle datos de familias). (b) `POST /client-errors` que registre en `error_logs` los errores de JavaScript del frontend: mensaje limpio, versión del build, ruta sin ids, navegador/plataforma a grandes rasgos; sin terceros, con límite de peticiones estricto, cuerpo pequeño, agrupado en el teléfono, y nunca datos de salud. Funciona desde el teléfono del hijo y sin sesión, y no hace nada sin conexión. Los errores del cliente aparecen en `/ops/error-logs` y en el digest semanal como su propio grupo. Sin pantallas nuevas para los padres. Respetar la retención de `error_logs`."

## Contexto

Hoy quien opera PediTrack (el dueño) solo se entera de un problema por dos caminos: `error_logs`, que guarda lo que
falla **dentro del servidor** (peticiones con 4xx/5xx, spec 002, y procesos en segundo plano, spec 018), y el correo
semanal de los lunes (spec 039). Quedan dos huecos:

1. **El servicio caído.** Si el API o la página dejan de responder (un despliegue roto, la base sin conexión, Railway o
   Cloudflare con problemas), nada se escribe en `error_logs` —el proceso que escribiría está caído— y el dueño lo sabe
   cuando un papá se queja o el lunes siguiente.
2. **La falla en el teléfono.** Si la app truena en el navegador de un papá (una pantalla en blanco en un iPhone, un
   error de JavaScript en una pantalla poco usada), el servidor nunca se entera: la petición pudo salir bien y lo que
   falló fue dibujarla.

Esta funcionalidad cierra los dos huecos **sin mandar datos de familias a terceros** y **sin pantallas nuevas para los
papás**: es solo para quien opera el servicio.

## Escenarios de Usuario y Pruebas *(obligatorio)*

El actor de todas las historias es **el dueño / quien opera el servicio**, no los papás. Los papás no ven ningún cambio.

### Historia de Usuario 1 - Saber en minutos que el servicio se cayó y cuándo volvió (Prioridad: P1)

Cuando el API o la página de PediTrack dejan de responder, el dueño recibe un aviso (correo, y si el servicio de
monitoreo lo ofrece, notificación en su teléfono) en pocos minutos, y otro aviso cuando vuelven a responder. El servicio
de monitoreo es externo (vive fuera de Railway y de Cloudflare, así sigue funcionando cuando ellos fallan) y solo
pregunta «¿respondes?» a dos direcciones públicas: no recibe ni ve ningún dato de nadie.

**Por qué esta prioridad**: una caída total afecta a todas las familias a la vez (no ven sus tomas, no les llegan los
recordatorios) y hoy puede pasar horas sin que nadie lo note. Es el riesgo más grande antes de cobrar.

**Prueba Independiente**: con la revisión de salud publicada y el monitor dado de alta, detener el API en DEV (o
apuntar el monitor a una dirección que falle) y comprobar que llega el aviso de caída y, al restablecerlo, el de
regreso.

**Escenarios de Aceptación**:

1. **Dado** el API funcionando y la base respondiendo, **Cuando** alguien (o el monitor) pide la revisión de salud del
   API, **Entonces** responde «bien» de inmediato, sin pedir sesión ni clave, y la respuesta no contiene ningún dato de
   cuentas, hijos ni salud.
2. **Dado** el API funcionando pero la base de datos sin responder, **Cuando** se pide la revisión de salud, **Entonces**
   responde «no está bien» (la falla de la base se nota, no solo la del proceso), sin revelar detalles internos (ni el
   texto del error de la base ni direcciones).
3. **Dado** el monitor externo configurado para el API y para la página, **Cuando** uno de los dos deja de responder
   durante más de unos minutos, **Entonces** el dueño recibe un aviso de caída, y **Cuando** vuelve a responder, un
   aviso de regreso.
4. **Dado** cualquier número de revisiones de salud (el monitor pregunta cada minuto, Railway en cada despliegue),
   **Cuando** pasan los días, **Entonces** ninguna revisión de salud deja una fila en `error_logs` ni cuenta para el
   límite de peticiones de los papás.

---

### Historia de Usuario 2 - Ver los errores que pasan en el teléfono de los papás (Prioridad: P2)

Cuando la app falla en el navegador de un papá (un error no atrapado, una promesa rechazada sin manejar o la pantalla
de error de la app), el teléfono manda un reporte corto y limpio al API, que lo guarda en `error_logs` como su propio
grupo (aparte de las peticiones y de los procesos en segundo plano). El dueño lo ve con la consulta de operación
(spec 021) y en el correo semanal (spec 039), con cuántas veces pasó, en qué pantalla (sin ids), en qué versión de la
app y en qué tipo de navegador.

**Por qué esta prioridad**: no es una caída total, pero una pantalla rota en iPhone puede afectar a muchas familias por
días sin que nadie lo reporte. Depende de que el API esté vivo (por eso va después de la historia 1).

**Prueba Independiente**: provocar un error de JavaScript en una pantalla de la app (en una prueba), y comprobar que
aparece una fila nueva en `error_logs` con el grupo de errores del cliente, la pantalla sin ids, la versión del build y
el mensaje limpio, y que sale en la consulta de operación filtrando por ese grupo.

**Escenarios de Aceptación**:

1. **Dado** un papá con sesión en una pantalla de la app, **Cuando** ocurre un error de JavaScript no atrapado,
   **Entonces** se guarda un reporte en `error_logs` con: el grupo de errores del cliente y la pantalla **como patrón sin
   ids** (p. ej. «la consulta de un hijo», nunca el id real), la versión de la app, el tipo de navegador y sistema a
   grandes rasgos, y el mensaje del error **limpio**.
2. **Dado** el mismo error repitiéndose muchas veces seguidas en el mismo teléfono (p. ej. en cada segundo), **Cuando**
   pasa un rato, **Entonces** el teléfono manda **un** reporte con el número de veces, no uno por cada vez.
3. **Dado** un error cuyo mensaje contiene un correo, un identificador, un token, un número largo o texto que el papá
   escribió, **Cuando** se guarda, **Entonces** en `error_logs` no aparece nada de eso (queda reemplazado o recortado).
4. **Dado** el teléfono del hijo (spec 047), una pantalla sin sesión (inicio de sesión, invitación, canje de la liga del
   hijo) o un papá con sesión, **Cuando** ocurre un error, **Entonces** el reporte se manda igual, y en `error_logs` no
   queda ningún identificador de la cuenta, del hijo ni del dispositivo.
5. **Dado** el teléfono sin conexión (spec 067), **Cuando** ocurre un error, **Entonces** no se intenta mandar nada ni se
   muestra ningún aviso al papá; el error no se guarda para después.
6. **Dado** que mandar el reporte falla (el API caído, sin red, límite de peticiones), **Cuando** pasa, **Entonces** el
   papá no ve nada distinto: reportar nunca rompe la app, nunca muestra un mensaje y nunca se reintenta en bucle.
7. **Dado** errores de cliente guardados en la semana, **Cuando** llega el correo semanal (spec 039), **Entonces** los
   errores de cliente salen en su propia sección (como los procesos en segundo plano), con sus grupos más frecuentes.

---

### Historia de Usuario 3 - Que nadie pueda inundar ni ensuciar el registro de errores (Prioridad: P3)

La dirección que recibe los reportes es pública (debe funcionar sin sesión), así que cualquiera podría mandarle basura.
El servicio limita cuánto acepta y qué guarda, para que un script no llene `error_logs`, no gaste la base ni esconda los
errores reales.

**Por qué esta prioridad**: protege a las historias 1 y 2 (si la tabla se inunda, el dueño deja de ver lo importante y
el correo semanal se vuelve inútil), pero no aporta valor por sí sola.

**Prueba Independiente**: mandar muchos reportes seguidos desde la misma dirección y comprobar que, pasado el límite,
se rechazan sin escribir nada; mandar un reporte con cuerpo enorme o con campos inventados y comprobar que se rechaza
o se recorta.

**Escenarios de Aceptación**:

1. **Dado** una misma dirección mandando muchos reportes seguidos, **Cuando** supera el límite estricto, **Entonces** el
   resto se rechaza sin escribir en `error_logs` (ni siquiera el rechazo se registra).
2. **Dado** un reporte con un cuerpo más grande que el tope, o con campos de más, o con valores fuera de lo esperado,
   **Cuando** llega, **Entonces** se rechaza o se recorta a lo permitido, y lo guardado sigue limpio.
3. **Dado** un reporte mal formado, **Cuando** llega, **Entonces** el rechazo no deja una fila en `error_logs` (si no,
   la basura generaría su propio registro).

### Casos Límite

- **La base de datos lenta pero viva**: la revisión de salud tiene un tiempo máximo corto; si la base no contesta a
  tiempo, cuenta como «no está bien» (no se queda colgada y no acumula peticiones).
- **Despliegue en curso**: mientras Railway arranca la versión nueva, la revisión de salud puede fallar unos segundos;
  el monitor no debe avisar por una falla de un solo minuto (espera a una caída sostenida, configurable en el servicio
  externo).
- **Error dentro del propio reporte**: si armar o mandar el reporte falla, se ignora en silencio (nunca genera otro
  reporte: no hay bucles).
- **Errores de extensiones o scripts ajenos** (traductores del navegador, extensiones): se descartan los que no vienen
  del código de la app cuando se puede distinguir, para no ensuciar el registro.
- **Una versión vieja de la app** abierta en un teléfono: el reporte lleva su versión, así se distingue un error ya
  arreglado de uno nuevo.
- **Pantalla desconocida** (una dirección que no corresponde a ninguna pantalla): se guarda como «otra», nunca la
  dirección tal cual (podría llevar ids o texto).
- **Muchos errores distintos en una sesión** (la app entera rota): el teléfono manda como máximo unos pocos reportes por
  carga de página; el resto se cuenta y se descarta.
- **Cambia la sesión o se cierra**: el reporte nunca lleva quién era la persona; cerrar sesión no cambia nada.
- **El monitor externo deja de existir o cambia su plan gratuito**: la revisión de salud sigue siendo útil para Railway;
  se cambia de servicio sin tocar código.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Revisión de salud y monitor externo**

- **FR-001**: El API DEBE ofrecer una revisión de salud pública (sin sesión ni clave) que responda «bien» solo si el
  proceso atiende **y** la base de datos responde dentro de un tiempo máximo corto (del orden de un par de segundos), y
  «no está bien» en cualquier otro caso.
- **FR-002**: La respuesta de la revisión de salud NO DEBE contener datos de cuentas, hijos, salud, ni detalles internos
  (textos de error de la base, direcciones, versiones de dependencias). A lo mucho, un estado y la versión desplegada.
- **FR-003**: La revisión de salud NO DEBE escribir en `error_logs` (ni cuando dice «no está bien») ni contar para el
  límite de peticiones general de los papás; DEBE ser barata (una consulta mínima a la base, sin leer tablas de datos).
- **FR-004**: El despliegue del API (Railway) DEBE usar esta revisión de salud en lugar de la petición al catálogo de
  países que usa hoy.
- **FR-005**: DEBE quedar documentado (en `DEPLOY.md`) cómo el dueño da de alta un monitor externo gratuito que pregunte
  cada minuto (o lo más cercano que permita el plan gratuito) por la revisión de salud del API y por la página principal
  del frontend, y le avise por correo (y notificación si la ofrece) al caer y al volver. El monitor solo conoce esas dos
  direcciones públicas: no recibe credenciales, claves ni datos de nadie.
- **FR-006**: El servicio externo concreto se elige en el plan con estas condiciones: gratuito para dos monitores con
  intervalo de 1 a 5 minutos, avisos de caída y de regreso por correo, sin instalar nada dentro de PediTrack (ni scripts
  en la página ni agentes en el servidor).

**Reportes de errores del frontend**

- **FR-007**: La app DEBE capturar, en todas sus pantallas (papás con sesión, pantallas públicas sin sesión y el
  teléfono del hijo), los errores de JavaScript no atrapados, las promesas rechazadas sin manejar y los errores al
  dibujar una pantalla. **Hoy la app no tiene pantalla de error**: un error al dibujar deja la página **en blanco**.
- **FR-007a** *(decidido por el dueño, 2026-11-17)*: en lugar de la página en blanco, la app DEBE mostrar una
  **pantalla de error neutral** con el sistema visual de PediTrack: un título calmado («Algo no cargó bien»), que lo
  guardado sigue en su cuenta, un botón sólido «Volver a cargar» y una salida a la pantalla principal que corresponda
  (inicio de los papás, «Hoy» del teléfono del hijo, o iniciar sesión sin sesión). Sin rojo ni íconos de alarma, sin
  texto técnico, sin culpar a la persona y sin pedirle que reporte nada (el reporte sale solo). Diseñada por Claude
  Design (entregada el 2026-11-17, `referencia/Pantalla de error PediTrack.dc.html`, estados A–F: dentro de la app,
  app completa, teléfono del hijo, sin sesión, volvió a fallar y sin conexión) y se construye tal cual el mock.
- **FR-008**: Cada reporte DEBE llevar solo: un tipo (error no atrapado / promesa rechazada / pantalla de error), el
  mensaje limpio, la pantalla como patrón sin ids, la versión de la app, el navegador y el sistema a grandes rasgos
  (p. ej. «Safari · iOS», «Chrome · Android»), si la app corre instalada o en el navegador, y cuántas veces se repitió.
- **FR-009**: Los reportes NUNCA DEBEN llevar: identificadores de cuenta, hijo, consulta, dispositivo o sesión;
  correos; nombres; tokens o credenciales; texto escrito por el papá; datos de salud; la dirección completa de la
  página ni sus parámetros. La limpieza DEBE hacerse **en el teléfono antes de mandar y otra vez en el servidor antes de
  guardar** (no se confía en el cliente).
- **FR-010**: El mensaje guardado DEBE recortarse a un largo máximo y limpiarse de correos, identificadores, tokens y
  números largos; la pila de llamadas, si se guarda, DEBE reducirse a los nombres de archivo y líneas del código de la
  app (sin direcciones con parámetros).
- **FR-011**: El teléfono DEBE agrupar los errores iguales (mismo tipo, mensaje y pantalla) y mandar un solo reporte con
  el número de repeticiones, y DEBE tener un tope de reportes por carga de página; lo que pase el tope se descarta.
- **FR-012**: Sin conexión (spec 067) el teléfono NO DEBE intentar mandar reportes ni guardarlos para después.
- **FR-013**: Mandar un reporte NUNCA DEBE afectar a la persona: sin mensajes, sin reintentos en bucle, sin esperar la
  respuesta para seguir, y un error al reportar no genera otro reporte.
- **FR-014**: El API DEBE aceptar los reportes sin sesión, con un **límite de peticiones estricto** por dirección (más
  estricto que el general), un **tamaño de cuerpo pequeño** y una lista cerrada de campos; lo que no cumpla se rechaza
  **sin escribir en `error_logs`** (ni el rechazo ni el exceso de límite se registran).
- **FR-015**: Cada reporte aceptado DEBE guardarse en `error_logs` como una fila del grupo de errores del cliente
  (p. ej. `endpoint = client:<patrón de pantalla>`), **sin cuenta asociada**, sin estado HTTP, con el mensaje limpio y
  los datos de FR-008, de modo que la consulta de operación (spec 021) pueda filtrarlos por ese prefijo como hoy filtra
  `job:`.
- **FR-016**: El correo semanal (spec 039) DEBE mostrar los errores del cliente en su **propia sección**, separada de
  las peticiones y de los procesos en segundo plano, con sus grupos más frecuentes y su total; sin ningún dato de
  cuentas.
- **FR-017**: Los reportes del cliente DEBEN respetar la retención de `error_logs` (spec 021): se borran con el resto al
  cumplir el plazo.
- **FR-018**: No DEBE usarse ningún servicio de terceros para los errores del cliente (nada de Sentry, Bugsnag,
  LogRocket ni similares): los reportes van solo al API de PediTrack.
- **FR-019**: La política de seguridad de contenido de la página DEBE seguir permitiendo solo los orígenes que ya
  permite; mandar reportes no DEBE requerir abrirla a otros.

**Lo que no cambia**

- **FR-020**: Fuera de la pantalla de error de FR-007a (que solo aparece cuando algo falla), los papás NO DEBEN ver
  ninguna pantalla, aviso ni texto nuevo por esta funcionalidad; no cambia ninguna pantalla existente ni el aviso
  «Antes de empezar».

### Entidades Clave

- **Revisión de salud**: la respuesta pública del API a «¿estás bien?»; solo un estado (y a lo mucho la versión
  desplegada). No se guarda.
- **Reporte de error del cliente**: lo que manda el teléfono; tipo, mensaje limpio, pantalla como patrón, versión de la
  app, navegador y sistema a grandes rasgos, instalada o no, número de repeticiones. Se guarda como una fila de
  `error_logs` del grupo de errores del cliente, sin cuenta.
- **Monitor externo**: configuración que el dueño hace en un servicio de terceros, fuera del código; conoce solo dos
  direcciones públicas y el correo del dueño.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Si el API o la página dejan de responder de forma sostenida, el dueño recibe el aviso en **10 minutos o
  menos** (hoy: hasta 7 días, con el correo semanal), y otro aviso al volver.
- **SC-002**: Una caída de la base de datos con el proceso vivo se detecta igual que una caída del proceso (la revisión
  de salud dice «no está bien» en la siguiente pregunta).
- **SC-003**: El 100 % de los errores de JavaScript provocados en las pruebas (error no atrapado, promesa rechazada y
  pantalla de error; en una pantalla con sesión, una pública y el teléfono del hijo) aparecen en `error_logs` en el
  grupo de errores del cliente en menos de un minuto.
- **SC-004**: En una revisión de todos los reportes guardados en las pruebas, **cero** contienen un correo, un
  identificador, un token, un nombre o texto escrito por el papá.
- **SC-005**: Un mismo error repetido 100 veces en una carga de página produce **un** reporte con el conteo (no 100
  filas).
- **SC-006**: Un script que manda reportes sin parar desde una dirección deja como máximo el número de filas que permite
  el límite estricto por minuto, y ninguna fila por los rechazos.
- **SC-007**: Las revisiones de salud de un día entero (monitor cada minuto + Railway) no dejan **ninguna** fila en
  `error_logs`.
- **SC-008**: Ningún papá nota la funcionalidad mientras todo funciona: cero pantallas, avisos o textos nuevos fuera de
  la pantalla de error, y ningún flujo existente cambia (los E2E existentes siguen pasando).
- **SC-009**: Cuando una pantalla truena al dibujarse, en el 100 % de los casos probados (papás, pantalla pública,
  teléfono del hijo; 390 y 1280 px) se ve la pantalla de error neutral, nunca una página en blanco, y «Volver a
  cargar» y la salida a la pantalla principal funcionan.

## Supuestos

- El monitor externo lo da de alta el dueño con su propio correo en un servicio gratuito (p. ej. UptimeRobot o Better
  Stack; se decide en el plan). Ese servicio es un tercero que solo conoce dos direcciones públicas: no recibe datos de
  familias. Como toca el Principio II (terceros), el dueño **lo aprobó explícitamente el 2026-11-17**.
- El aviso del monitor llega al correo del dueño; no se construye un canal propio de avisos (ni push al dueño ni SMS).
- Railway ya reinicia el servicio si su revisión de salud falla en un despliegue; esta spec solo le da una revisión más
  fiel (la que también nota la base caída).
- El frontend lo sirve Cloudflare Pages; se monitorea su página principal tal cual (sin revisión propia: es contenido
  estático).
- La «versión de la app» es la del build que ya existe para el aviso de versión nueva (spec 017).
- «Navegador y sistema a grandes rasgos» se deriva en el teléfono de la información que el navegador ya da, reducida a
  familias (Safari, Chrome, Firefox, Edge, otro; iOS, Android, Windows, macOS, otro); nunca se guarda la cadena
  completa del navegador.
- La retención de `error_logs` (90 días por omisión, spec 021) aplica igual a los reportes del cliente. **No hace falta
  migración**: la tabla ya admite filas sin estado HTTP ni cuenta (así se guardan las `job:` de la spec 018).
- El límite estricto que existe hoy (20 por minuto) es **uno solo compartido** por varias rutas públicas (invitaciones,
  «Tomada», canje de la liga del hijo, exportaciones); los reportes del cliente llevan su **propio** límite para que una
  inundación de reportes nunca bloquee esas acciones. Se fija en el plan.
- La revisión de salud que usa hoy Railway (el catálogo de países) pasa por el límite general; la nueva queda fuera de
  él.
- No se guardan errores sin conexión para mandarlos después (sería guardar en el teléfono información que no hace falta;
  se pierde un error ocurrido sin red, aceptado).
- El aviso de privacidad ya dice que se registran errores técnicos sin datos personales; si el dueño quiere nombrar los
  del navegador, es un pendiente suyo (no bloquea).

## Fuera de alcance

- Pantallas o paneles para ver los errores (se usan la consulta de operación de la spec 021 y el correo de la spec 039).
- Avisos inmediatos al dueño por **errores del cliente** (solo la caída del servicio avisa al momento; los errores del
  cliente se ven en el correo semanal y en la consulta). Si hace falta, va al BACKLOG.
- Métricas de rendimiento del frontend (tiempos de carga, Web Vitals) y grabación de sesiones.
- Errores de la página de Cloudflare Pages misma (el monitor solo ve si responde).
- Una página pública de estado («status page») para los papás.
