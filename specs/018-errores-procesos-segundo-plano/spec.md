# Especificación de Funcionalidad: Errores de procesos en segundo plano en `error_logs`

**Rama de la Funcionalidad**: `feature/018-errores-procesos-segundo-plano`

**Creado**: 2026-09-30

**Estado**: Borrador

**Entrada**: Descripción del usuario: "sí, arranca con el punto 3" (backlog: «Errores de procesos en segundo plano en `error_logs`», anotado 2026-09-29).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Ver en `error_logs` lo que falla en el proceso de recordatorios (Prioridad: P1)

Quien opera el servicio (hoy, el equipo de PediTrack) necesita enterarse cuando el proceso de recordatorios (spec 011)
falla, igual que se entera de los errores 4xx/5xx que ve un padre (spec 002). Hoy esas fallas solo se imprimen en la
consola del servidor y se pierden: si la base de datos no responde, o los avisos no se pueden preparar o entregar, los
padres dejan de recibir recordatorios y nadie queda enterado. Cada falla debe quedar como una fila de `error_logs`,
identificable como del proceso de recordatorios y sin datos sensibles.

**Por qué esta prioridad**: los recordatorios son la función de la app cuyo fallo es silencioso — no hay pantalla que
muestre un error —; un aviso que no llega es justo lo que el padre no puede reportar.

**Prueba Independiente**: con una consulta del proceso que falla o con un servicio de avisos que rechaza los envíos,
tras un ciclo del proceso hay una fila nueva en `error_logs` cuyo `endpoint` dice `job:reminders`, con un mensaje que explica qué
falló, sin claves, sin tokens y sin la dirección del dispositivo.

**Escenarios de Aceptación**:

1. **Dado** que el ciclo no puede leer las tomas vencidas (p. ej. la consulta falla), **Cuando** termina el ciclo,
   **Entonces** hay una fila en `error_logs` con `endpoint = job:reminders`, `http_status` vacío, el archivo y la línea
   de donde salió y un mensaje que dice que el ciclo falló.
2. **Dado** que N recordatorios no se pudieron preparar en un ciclo, **Entonces** hay una fila que dice cuántos y por
   qué tipo de falla, no una fila por cada toma.
3. **Dado** que M de N avisos no se pudieron entregar (el servicio de avisos respondió con error o no respondió),
   **Entonces** hay una fila que dice cuántos de cuántos.
4. **Dado** que el servicio de avisos responde 404 o 410 (el dispositivo se dio de baja), **Entonces** NO se registra
   nada: es algo normal y el dispositivo ya se apaga solo (spec 011).
5. **Dado** que un ciclo termina bien, **Entonces** no se escribe nada en `error_logs`.
6. **Dado** que la falla se conoce a una cuenta concreta, **Entonces** la fila lleva su `account_id`; si afecta a varias
   o a ninguna, va vacío. Nunca el correo.

---

### Historia de Usuario 2 - Una falla que dura no inunda la tabla (Prioridad: P1)

El proceso corre cada 30 segundos. Si una falla dura una hora, no debe generar 120 filas idénticas: la misma
falla se registra una vez y luego se vuelve a registrar, con cuántas veces ocurrió, pasado un rato.

**Por qué esta prioridad**: sin esto, la historia 1 convierte una falla larga en miles de filas que tapan cualquier otro
error y hacen crecer la tabla (que hoy no tiene purga).

**Prueba Independiente**: con una falla que se repite en 20 ciclos seguidos, `error_logs` recibe una sola fila; al pasar
el intervalo de agrupación y volver a fallar, recibe otra que indica cuántas veces se repitió mientras tanto.

**Escenarios de Aceptación**:

1. **Dado** la misma falla en ciclos consecutivos, **Cuando** ocurre otra vez dentro de 15 minutos de la última fila
   escrita, **Entonces** no se escribe otra fila, solo se cuenta.
2. **Dado** que pasaron 15 minutos y la falla sigue, **Entonces** se escribe una fila nueva que dice cuántas veces se
   repitió desde la anterior.
3. **Dado** dos fallas distintas (p. ej. el ciclo y la entrega), **Entonces** cada una se agrupa por separado.
4. **Dado** que la falla desaparece y luego vuelve, **Entonces** la nueva aparición se registra de inmediato (no espera
   el intervalo).

---

### Casos Límite

- Si escribir en `error_logs` también falla (p. ej. la base entera está caída: `error_logs` vive en ella y ese caso
  solo puede quedar en la consola), el proceso de recordatorios NO se detiene ni se retrasa: se imprime en la consola
  como hoy y sigue (igual que el registro de errores HTTP, spec 002 FR-005), y el intento fallido no cuenta como fila
  escrita: la siguiente falla se vuelve a intentar sin esperar el intervalo.
- El mensaje nunca incluye la dirección del dispositivo (`endpoint` del servicio de avisos), las claves VAPID, el secreto
  ni el token de «Tomada» (spec 011): solo conteos y el tipo de falla.
- Los mensajes de error del servicio de avisos o de la base pueden traer datos sensibles: se guarda una descripción
  propia de la falla, no el texto del error tal cual.
- Al apagar el servidor, el ciclo en curso cancelado por el cierre no cuenta como falla.
- El proceso no se registra si los recordatorios están «no disponibles» (faltan las claves): no corre.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Toda falla del proceso de recordatorios que hoy solo se imprime en la consola (el ciclo que no pudo leer
  las tomas, recordatorios que no se pudieron preparar, avisos que no se pudieron entregar) DEBE quedar también como una
  fila de `error_logs`, además de seguir imprimiéndose.
- **FR-002**: Cada fila DEBE llevar `endpoint` con el nombre del proceso (`job:reminders`), `http_status` vacío, el
  archivo y la línea del punto donde se detectó la falla, y un mensaje descriptivo en inglés (como los demás).
- **FR-003**: Un 404 o 410 del servicio de avisos NO DEBE registrarse como error.
- **FR-004**: Un ciclo exitoso NO DEBE escribir nada.
- **FR-005**: Las fallas de un mismo tipo DEBEN agruparse: como máximo una fila por tipo cada 15 minutos, y la fila
  posterior DEBE decir cuántas veces se repitió desde la anterior; una falla nueva tras un periodo sin fallas se
  registra de inmediato.
- **FR-006**: El mensaje NUNCA DEBE contener la dirección del dispositivo, las claves, el secreto, el token de «Tomada»
  ni el texto crudo del error de un tercero; solo el tipo de falla y conteos.
- **FR-007**: `account_id` DEBE llenarse solo cuando la falla se conoce a una cuenta; NUNCA el correo (spec 002).
- **FR-008**: Que falle el registro en `error_logs` NO DEBE detener ni retrasar el proceso de recordatorios.
- **FR-009**: El mecanismo DEBE poder reutilizarlo cualquier proceso en segundo plano futuro con su propio nombre
  (`job:<nombre>`), sin que cada uno reimplemente el agrupamiento.
- **FR-010**: Sin cambios de API ni de pantallas; sin cambios de esquema (la tabla ya admite estas filas).

### Entidades Clave

- **Entrada de `error_logs` de un proceso**: la misma entidad de la spec 002, con `endpoint` = `job:<nombre>`,
  `http_status` vacío y un mensaje con el tipo de falla y su conteo.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El 100 % de las fallas de tipo ciclo, preparación y entrega dejan una fila en `error_logs` en el ciclo en
  que ocurren (o se cuentan en la siguiente fila de su tipo).
- **SC-002**: Una falla que dura una hora deja, como máximo, 4 filas por tipo (una cada 15 minutos), no cientos.
- **SC-003**: Ninguna fila contiene direcciones de dispositivo, claves ni tokens (prueba con valores centinela).
- **SC-004**: Con `error_logs` inaccesible, el proceso de recordatorios sigue entregando avisos sin retraso medible.
- **SC-005**: Las pruebas del backend mantienen la cobertura por encima del 90 %.

## Supuestos

- Se sigue la propuesta del backlog: `endpoint = job:reminders`, cuenta cuando se conoce, sin datos sensibles.
- El intervalo de agrupación de 15 minutos es una constante en un solo lugar y se ajusta si hace falta.
- 404/410 no cuentan como error: decisión propuesta en el backlog y ya normal en la spec 011 (el dispositivo se apaga).
- Fuera de alcance: leer o consultar `error_logs` desde la app, el digest semanal por correo, la política de retención y
  purga (siguen en el backlog), alertas en tiempo real, y registrar errores de arranque (`log.Fatal`) del servidor.
- Depende de: spec 002 (`error_logs`, `errorlog.Entry`), spec 011 (`internal/reminder`).
- Sin pantallas ni mock.
