# Especificación de Funcionalidad: Digest semanal de errores por correo

**Rama de la Funcionalidad**: `feature/039-digest-semanal-errores`

**Creado**: 2026-10-12

**Estado**: Borrador

**Entrada**: Descripción del usuario: «es el digest semanal por correo» (backlog: «Digest semanal de errores por correo», pendiente desde la spec 021). Las specs 002 y 018 **escriben** en `error_logs`; la 021 agregó **leerlos** (consulta, resumen y depuración). Esta spec cierra el ciclo: una vez por semana el servicio manda a quien lo opera **un correo de resumen** sin que tenga que ir a preguntar. Los destinatarios son el equipo de PediTrack, nunca los padres.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Recibir cada semana el resumen de errores (Prioridad: P1)

Quien opera el servicio recibe, **una vez por semana**, un correo con lo que falló en la app durante los últimos 7 días: cuántos errores hubo (y cómo se compara con la semana anterior), cuáles se repitieron más y, aparte, lo que falló en los procesos en segundo plano. Si la semana no tuvo ningún error, el correo llega igual y lo dice con claridad: así se sabe que el digest sigue vivo y que el silencio significa «todo bien», no «el digest se rompió».

**Por qué esta prioridad**: PediTrack no tiene reseñas de tienda donde enterarse de lo que falla en el campo; `error_logs` solo sirve si alguien lo mira, y nadie se acuerda de consultarlo cada semana. Es la razón de ser de las specs 002, 018 y 021.

**Prueba Independiente**: con errores registrados en los últimos 7 días (algunos de peticiones, algunos de un proceso en segundo plano) y otros más viejos, se dispara el digest y llega **un** correo al destinatario configurado con el total, los grupos más frecuentes y la sección de procesos; con la tabla vacía llega el correo de «sin errores esta semana».

**Escenarios de Aceptación**:

1. **Dado** errores registrados en los últimos 7 días, **Cuando** llega la hora del digest, **Entonces** se manda un solo correo al destinatario configurado con el **total** de errores de la semana y su **comparación con la semana anterior** (más o menos, y cuántos).
2. **Dado** ese correo, **Entonces** lista los grupos más frecuentes (los diez primeros) con su endpoint, estado HTTP, mensaje, conteo, primera y última vez de la semana, de más a menos frecuente, y dice cuántos grupos más quedaron fuera.
3. **Dado** errores de procesos en segundo plano (endpoint `job:…`), **Entonces** aparecen en una sección aparte, con el nombre del proceso (`job:reminders`, `job:supplements`, `job:error-logs-retention`…), y no se mezclan con los de peticiones.
4. **Dado** una semana sin ningún error, **Entonces** el correo se manda igual, con un aviso claro de que no hubo errores.
5. **Dado** que la semana anterior no tiene datos (el servicio es nuevo o la retención no la cubre), **Entonces** el correo dice que no hay comparación en lugar de inventar una.
6. **Dado** el asunto del correo, **Entonces** dice el entorno (DEV o producción), el periodo cubierto y el total de errores, para distinguirlo de un vistazo en la bandeja.
7. **Dado** cualquier correo del digest, **Entonces** es legible en cualquier cliente de correo (texto claro, sin depender de imágenes ni de abrir un enlace) y no lleva nada de lo que se menciona en la Historia 3.

---

### Historia de Usuario 2 - Un solo correo por semana, sin perderse (Prioridad: P1)

El correo de una misma semana **no se manda dos veces** aunque el servicio se reinicie justo a esa hora o corran varias copias a la vez, y **no se pierde** si el servicio estaba apagado a la hora programada: se manda cuando vuelve, dentro de la misma semana.

**Por qué esta prioridad**: un digest que llega duplicado se aprende a ignorar, y uno que se pierde en silencio es peor que no tenerlo. El servicio se reinicia cada vez que se despliega.

**Prueba Independiente**: se dispara el digest dos veces seguidas, y desde dos procesos a la vez, para la misma semana: sale un solo correo. Se simula que el servicio estaba apagado a la hora programada: al arrancar, el mismo día o más tarde esa semana, sale el correo pendiente; al arrancar la semana siguiente sale el de la semana siguiente.

**Escenarios de Aceptación**:

1. **Dado** que el correo de esta semana ya se mandó, **Cuando** se reinicia el servicio o vuelve a correr el proceso, **Entonces** no se manda otro.
2. **Dado** dos copias del servicio corriendo a la vez, **Cuando** llega la hora, **Entonces** solo una manda el correo.
3. **Dado** que el servicio estaba apagado a la hora programada, **Cuando** arranca más tarde **dentro de la misma semana**, **Entonces** manda el correo pendiente una sola vez.
4. **Dado** que el envío de esta semana falló del todo (Historia 3), **Cuando** llega la semana siguiente, **Entonces** no se intenta recuperar la semana perdida: se manda el de la semana nueva, que ya cubre los últimos 7 días.
5. **Dado** que se registra una semana como enviada, **Entonces** ese registro sobrevive a un reinicio.

---

### Historia de Usuario 3 - Falla de envío y arranque seguro (Prioridad: P2)

Si el proveedor de correo no responde o rechaza el envío, el servicio **reintenta unas pocas veces** y, si no se logra, lo reporta como cualquier otro proceso en segundo plano (queda en `error_logs` como `job:error-digest`, y por lo tanto aparece en el digest siguiente). Si el servicio arranca sin la clave del proveedor, el digest simplemente **no corre** y lo dice en la consola, sin impedir que la app funcione, igual que los recordatorios sin sus claves.

**Por qué esta prioridad**: el digest es una ayuda de operación: nunca debe poner en riesgo la app de los padres ni filtrar secretos, pero una falla silenciosa del propio digest lo volvería inútil.

**Prueba Independiente**: con un proveedor que falla las dos primeras veces y acepta la tercera, sale el correo; con uno que falla siempre, el servicio sigue sano y queda un error `job:error-digest` sin ningún secreto; sin la clave configurada, el servicio arranca, avisa una vez en la consola y no intenta enviar.

**Escenarios de Aceptación**:

1. **Dado** un fallo temporal del proveedor, **Cuando** se intenta enviar, **Entonces** se reintenta hasta 3 veces en total con esperas crecientes, y si alguna funciona se considera enviado.
2. **Dado** que se agotan los reintentos, **Entonces** se reporta **una** falla de `job:error-digest` con un mensaje fijo (sin la dirección del destinatario, sin la clave ni la respuesta del proveedor) y el servicio sigue funcionando.
3. **Dado** que falta la clave del proveedor, **Cuando** arranca el servicio, **Entonces** el digest no corre, la consola lo dice una sola vez y nada más se afecta (no se escribe en `error_logs`: no es una falla, es una configuración ausente).
4. **Dado** cualquier falla, **Entonces** el servicio de los padres (rutas, recordatorios, depuración) no se detiene ni se retrasa.
5. **Dado** que un envío se está haciendo, **Cuando** se apaga el servicio, **Entonces** el apagado no queda esperando al proveedor más de unos segundos.

---

### Casos Límite

- **Retención menor a 14 días**: la comparación con la semana anterior necesita 14 días de datos; si la retención configurada (mínimo 7, spec 021) no los cubre, el correo dice «sin comparación» en lugar de un número engañoso.
- **Una semana muy ruidosa** (miles de grupos): el correo muestra los diez primeros y cuántos quedaron fuera; nunca crece sin límite.
- **La hora programada cae justo en un reinicio o un despliegue**: se cumple lo de la Historia 2 (ni doble ni perdido).
- **Cambio de hora o de zona**: la hora de envío es siempre hora de Ciudad de México (UTC−6, sin horario de verano); no depende de la zona del servidor.
- **El propio digest falla**: su falla aparece en el digest siguiente, en la sección de procesos, como cualquier otra.
- **Errores muy largos o con caracteres raros** en el mensaje: se muestran recortados y sin que rompan el formato del correo.
- **Destinatario mal escrito o rechazado por el proveedor**: cuenta como falla de envío (Historia 3), sin escribir la dirección en ningún registro.
- **Cuentas afectadas**: si una misma cuenta causó muchos errores, cuenta una vez en «cuentas afectadas».

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El servicio DEBE mandar **un correo de resumen por semana** a un destinatario configurable, a un día y hora configurables (por omisión lunes 08:00, hora de Ciudad de México).
- **FR-002**: El correo DEBE incluir el **total de errores** de los últimos 7 días y su **comparación con la semana anterior** (o decir que no hay comparación si esos datos no existen).
- **FR-003**: El correo DEBE listar los **diez grupos más frecuentes** (mismo agrupamiento de la spec 021: endpoint, estado y mensaje) con conteo, primera y última vez, de más a menos frecuente, e indicar cuántos grupos más hubo.
- **FR-004**: Los errores de **procesos en segundo plano** (endpoint con prefijo `job:`) DEBEN ir en una sección aparte, con su propio total y sus grupos.
- **FR-005**: Una semana sin errores DEBE producir el correo igualmente, con un aviso explícito de que no hubo errores.
- **FR-006**: El asunto DEBE incluir el entorno, el periodo y el total; el cuerpo DEBE ser legible sin imágenes ni enlaces.
- **FR-007**: El correo NUNCA DEBE contener correos electrónicos de personas, tokens, claves, direcciones de dispositivos, texto de notas, doctores, medicamentos ni nada que no sea un mensaje fijo de `error_logs`; las cuentas solo DEBEN aparecer como **un conteo de cuentas afectadas**, nunca como lista ni identificadores.
- **FR-008**: El correo de una semana NO DEBE mandarse dos veces aunque se reinicie el servicio o corran varias copias; para eso DEBE quedar registrada de forma **duradera** cuál fue la última semana enviada.
- **FR-009**: Si el servicio estuvo apagado a la hora programada, DEBE mandar el correo pendiente al volver, **solo dentro de la misma semana**; una semana ya pasada NO DEBE recuperarse.
- **FR-010**: Si el envío falla, DEBE reintentarse hasta 3 veces en total con esperas crecientes; agotados, DEBE reportarse **una** falla con el nombre `job:error-digest`, con un mensaje fijo, mediante el mecanismo de la spec 018.
- **FR-011**: Ninguna falla del digest DEBE detener ni retrasar el resto del servicio; el envío DEBE tener un tiempo máximo y no DEBE bloquear el apagado.
- **FR-012**: Sin la clave del proveedor configurada, el digest NO DEBE correr y la consola DEBE decirlo una sola vez al arrancar; el servicio DEBE seguir funcionando.
- **FR-013**: La clave del proveedor, el destinatario y el remitente NO DEBEN aparecer en `error_logs`, en la consola ni en el correo; los registros usan mensajes fijos.
- **FR-014**: La configuración (clave, destinatario, remitente, día y hora, etiqueta de entorno) DEBE venir de variables de entorno, con valores por omisión razonables para lo que no sea secreto.
- **FR-015**: La funcionalidad NO DEBE agregar rutas, pantallas ni cambios que vean los padres.
- **FR-016**: Toda la lógica nueva DEBE tener pruebas que mantengan la cobertura del backend por encima del 90 % (Principio VI), incluyendo la unicidad por semana y los reintentos.

### Entidades Clave

- **Digest semanal**: el resumen derivado de `error_logs` para un periodo de 7 días: totales, grupos más frecuentes, sección de procesos y comparación; no se guarda su contenido, solo se arma y se manda.
- **Semana enviada (registro)**: el dato duradero que dice qué semana ya se mandó (y cuándo), para no repetir ni perder; es lo único nuevo que se guarda.
- **Entrada de error** (existente, specs 002/018/021): no se modifica.
- **Proveedor de correo saliente**: servicio externo al que se le entrega el correo para mandarlo; recibe únicamente el contenido del digest, que no lleva datos personales.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Con el servicio corriendo y la configuración completa, el 100 % de las semanas produce **exactamente un** correo al destinatario, también las semanas sin errores.
- **SC-002**: En condiciones normales, el correo llega dentro de los **15 minutos** siguientes a la hora programada.
- **SC-003**: En pruebas de reinicio y de dos procesos simultáneos, **0** correos duplicados para una misma semana, y **0** semanas perdidas cuando el servicio vuelve dentro de ella.
- **SC-004**: En pruebas, **0** correos electrónicos, tokens, claves o identificadores de cuenta aparecen en el contenido del correo ni en los registros que genera el digest.
- **SC-005**: Una falla total del proveedor produce **una** entrada `job:error-digest` y **0** efectos sobre las rutas, los recordatorios o la depuración.
- **SC-006**: Quien opera sabe en menos de **un minuto de lectura** cuál fue el error más frecuente de la semana y si empeoró respecto a la anterior.
- **SC-007**: Las pruebas del backend mantienen la cobertura por encima del **90 %**.

## Supuestos

- **Quién recibe**: el equipo de PediTrack, en `soporte@pedi-track.com`, que ya reenvía a un Gmail (Cloudflare Email Routing, 2026-10-11). El remitente es una dirección del propio dominio (p. ej. `alertas@pedi-track.com`); ambos son configurables.
- **Proveedor de envío**: por API, gratuito. Se recomienda **Resend** (plan gratis: 3,000 correos al mes y 100 al día, un dominio verificado), de sobra para un correo por semana. El dominio de envío se verifica con registros propios del proveedor (normalmente en un subdominio), **sin tocar** el SPF ni el MX de la raíz, que administra Email Routing y están bloqueados. Crear la cuenta y verificar el dominio lo hace una persona en los paneles; no es parte del código. Elegir otro proveedor solo cambia la configuración y un adaptador.
- **Periodo**: «semana» = los **7 días anteriores** al momento del envío; la «semana anterior» son los 7 días de antes. La unicidad se lleva por semana ISO de la hora programada, en hora de Ciudad de México (zona fija, no configurable: YAGNI).
- **Qué se manda**: el digest agrupa con la **misma lógica de resumen de la spec 021** (por endpoint, estado y mensaje), para no tener dos definiciones de «el mismo error». Los diez primeros grupos es un valor de partida razonable (propuesta mía, un solo lugar para cambiarlo).
- **Reintentos**: 3 intentos en total con esperas crecientes cortas (propuesta mía); si todos fallan, esa semana se da por no enviada y no se recupera, porque el digest siguiente ya cubre los últimos 7 días y los errores siguen en la tabla (retención de 90 días por omisión).
- **Cómo corre**: dentro del propio proceso del API, como la depuración de `error_logs` (spec 021) y el ticker de recordatorios (spec 011); no hay servicio aparte. No se necesita una clave de operación nueva: el digest lee la tabla directamente.
- **Privacidad (Principio II)**: el proveedor es un tercero, pero solo recibe mensajes fijos de error, conteos y nombres de endpoints: nada de salud ni identificadores de personas. No es venta ni compartición de datos de usuarios.
- **Principio V**: se justifica porque es la única forma de enterarse de lo que falla en el campo sin reseñas de tienda; es una pieza pequeña y no agrega pantallas ni dependencia de datos de los padres.
- **Fuera de alcance**: pantallas en la app; que los padres reciban algo; correos por cada error en tiempo real o alertas (otra spec); un panel de errores; SMS o WhatsApp; y que la app mande **invitaciones por correo** a la familia (otra tarea pendiente que reutilizará el mismo proveedor y su adaptador).
- **Depende de**: specs 002 (`error_logs`), 018 (`jobreport`), 021 (resumen y retención) y de que el proveedor de correo esté dado de alta y verificado antes de activarlo en un entorno.
- Sin pantalla ni mock.
