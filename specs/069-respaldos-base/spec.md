# Especificación de Funcionalidad: Respaldos de la base de datos

**Rama**: `feature/069-respaldos-base`
**Creada**: 2026-11-12
**Estado**: Implementada
**Entrada**: idea «Respaldos de la base» de la revisión de la app (`BACKLOG.md`, «Antes del primer cobro real», 2026-11-10), elegida por el dueño el 2026-11-12. `DEPLOY.md` dice que no hay respaldos y lo lista como falta para producción. En la base viven los datos de salud de menores y las fotos (recetas, cartilla, botiquín). Hoy, si la base se pierde o se corrompe, se pierde todo.

## Escenarios de Usuario y Pruebas *(obligatorio)*

Los «usuarios» de esta funcionalidad son **quien opera el servicio** (el dueño) y, de forma indirecta, **las familias**, que no ven nada nuevo pero cuyos datos dejan de depender de una sola copia.

### Historia de Usuario 1 - Cada día queda una copia completa, cifrada y fuera del proveedor de la base (Prioridad: P1)

Cada noche, sin que nadie haga nada, se guarda una copia completa de la base en un almacenamiento aparte: otro proveedor, otra cuenta. La copia está cifrada antes de salir del servidor, y la llave para abrirla la tiene solo el dueño, fuera del sistema. Si alguien lograra entrar al almacenamiento, vería archivos que no puede leer.

**Por qué esta prioridad**: es el único riesgo del producto sin vuelta atrás. Un error en una migración, un borrado equivocado o una falla del proveedor hoy significan perder los datos de salud de todas las familias.

**Prueba Independiente**: dejar pasar un día y comprobar que en el almacenamiento hay una copia nueva, con su fecha en el nombre, que no se puede leer sin la llave, y que el nombre no dice nada de su contenido.

**Escenarios de Aceptación**:

1. **Dado** el servicio funcionando, **Cuando** llega la hora programada del respaldo, **Entonces** se guarda una copia completa de la base en el almacenamiento externo sin intervención de nadie.
2. **Dado** una copia guardada, **Cuando** alguien la abre sin la llave del dueño, **Entonces** no puede leer nada de su contenido.
3. **Dado** una copia guardada, **Cuando** se mira su nombre y sus datos visibles (tamaño, fecha), **Entonces** no revelan nada de las familias: solo el ambiente (DEV o producción) y la fecha y hora.
4. **Dado** el respaldo en curso, **Cuando** las familias usan la app, **Entonces** la app sigue funcionando igual, sin interrupciones visibles.
5. **Dado** un respaldo que falla (sin espacio, sin conexión, credencial inválida), **Cuando** termina, **Entonces** queda registrado como falla de proceso en segundo plano con un mensaje fijo y sin datos, y aparece en el resumen semanal de errores.

---

### Historia de Usuario 2 - Las copias viejas se van solas, pero siempre hay de dónde escoger (Prioridad: P1)

El almacenamiento conserva las copias recientes de cada día y algunas más viejas, una por semana y una por mes, y borra solo lo que ya no hace falta. Así se puede volver a ayer, a la semana pasada o al mes pasado, sin que el costo crezca sin límite.

**Por qué esta prioridad**: sin retención, el almacenamiento crece sin fin. Con una sola copia, un error que se nota tarde (por ejemplo, días después) ya quedó también en la copia.

**Prueba Independiente**: con copias de varias fechas simuladas, aplicar la retención y comprobar qué quedan exactamente las que dice la regla.

**Escenarios de Aceptación**:

1. **Dado** copias diarias de muchas fechas, **Cuando** se aplica la retención, **Entonces** quedan las **7 diarias más recientes, 4 semanales y 6 mensuales** (decisión del dueño, 2026-11-12) y se borran las demás.
2. **Dado** un día en que el respaldo falló, **Cuando** se aplica la retención, **Entonces** nunca se borra una copia si eso deja menos copias buenas de las que pide la regla: la última copia válida nunca se borra.

---

### Historia de Usuario 3 - Restaurar está probado, no supuesto (Prioridad: P1)

Hay un procedimiento escrito, paso a paso, para restaurar la base desde una copia: dónde está la copia, cómo se descifra con la llave del dueño, cómo se carga en una base nueva y cómo se comprueba antes de apuntar el servicio a ella. Además, cada semana el sistema restaura solo la copia más reciente en una base temporal, comprueba que esté completa y la borra. Si algo no cuadra, lo registra como falla.

**Por qué esta prioridad**: un respaldo que nunca se ha restaurado es una suposición. La falla típica es descubrir el día del desastre que las copias no sirven.

**Prueba Independiente**: correr la comprobación automática y ver que restaura, cuenta y borra la base temporal. Seguir el procedimiento escrito una vez a mano, en una base de prueba, y llegar a una base usable.

**Escenarios de Aceptación**:

1. **Dado** la copia más reciente, **Cuando** corre la comprobación semanal, **Entonces** la copia se restaura en una base temporal, se revisa que existan todas las tablas esperadas y que cada una tenga filas en una cantidad parecida a la de la base viva, y la base temporal se borra al terminar.
2. **Dado** una copia incompleta, dañada o que no se puede descifrar, **Cuando** corre la comprobación, **Entonces** queda registrada como falla con un mensaje fijo, sin datos, y aparece en el resumen semanal.
3. **Dado** la comprobación, **Cuando** revisa la copia, **Entonces** solo mira nombres de tablas y conteos: nunca lee, muestra ni registra el contenido de ninguna fila.
4. **Dado** el procedimiento escrito, **Cuando** el dueño lo sigue en una base de prueba, **Entonces** llega a una base restaurada y comprobada sin pasos que falten.

---

### Historia de Usuario 4 - Lo mismo en DEV y en producción (Prioridad: P2)

El respaldo se activa hoy en DEV y, el día que exista producción, se activa ahí con la misma configuración: solo cambian el lugar, el ambiente y las llaves. Las copias de cada ambiente no se mezclan.

**Por qué esta prioridad**: DEV ya tiene datos de personas que prueban, y producción debe nacer con respaldos. Pero producción todavía no existe.

**Prueba Independiente**: comprobar que el nombre de cada copia dice su ambiente y que la configuración de DEV sirve para producción cambiando solo variables.

**Escenarios de Aceptación**:

1. **Dado** dos ambientes, **Cuando** cada uno respalda, **Entonces** sus copias quedan separadas y se distinguen por el nombre.
2. **Dado** un ambiente sin la configuración del respaldo, **Cuando** arranca el servicio, **Entonces** el servicio funciona igual y una sola línea dice que los respaldos no están activos.

### Casos Límite

- **La base crece** (sobre todo por las fotos): el respaldo sigue completo. Si tarda más que el margen que tiene, queda como falla; nunca se guarda una copia a medias como si fuera buena.
- **Dos respaldos a la vez** (un reinicio a media corrida, o dos copias del servicio): solo uno respalda; el otro no hace nada.
- **Sin conexión con el almacenamiento**: el respaldo reintenta unas veces y, si no puede, registra la falla. La copia local temporal se borra igual.
- **La llave del dueño se pierde**: las copias no se pueden abrir. El procedimiento indica dónde guardarla y que tenga una segunda copia segura; la app no tiene forma de recuperarla.
- **Cambio de llave**: las copias nuevas se cifran con la llave nueva y las viejas siguen necesitando la vieja, hasta que la retención las borre. El procedimiento lo explica.
- **Una migración a medias** al momento del respaldo: la copia es una foto coherente de la base en un instante.
- **Restaurar sobre la base viva por error**: el procedimiento restaura siempre en una base **nueva** y solo después se cambia a cuál apunta el servicio.
- **El almacenamiento externo cobra o se llena**: la retención mantiene el tamaño acotado. El procedimiento dice cuánto se espera que ocupe y cómo ver el uso.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

**Respaldo**

- **FR-001**: El sistema DEBE hacer una copia completa de la base **una vez al día**, a una hora fija de poco uso (por omisión 03:00 de Ciudad de México), sin intervención de nadie.
- **FR-002**: La copia DEBE ser coherente: una foto de la base en un solo instante, que incluya todas las tablas, sus datos (también las fotos) y su estructura.
- **FR-003**: La copia DEBE cifrarse **antes de salir** del lugar donde se hace, con una llave pública cuya llave privada guarda **solo el dueño, fuera del sistema**. Ni el servicio, ni el almacenamiento, ni el código pueden descifrarla.
- **FR-004**: La copia DEBE guardarse en un almacenamiento de objetos **fuera del proveedor que aloja la base**: **Cloudflare R2** (decisión del dueño, 2026-11-12; ya se usa Cloudflare para el DNS y la app), con credenciales que **solo pueden escribir y leer en su propio espacio**.
- **FR-005**: El nombre de cada copia DEBE llevar solo el ambiente y la fecha y hora (por ejemplo `dev/2026-11-12T090003Z.dump.age`, hora UTC), nunca nada de las familias.
- **FR-006**: El respaldo DEBE hacerse **dentro del mismo proveedor que aloja la base, por su red interna**, como un proceso aparte del servicio de la app (decisión del dueño, 2026-11-12): la base no se expone más de lo que ya está y sus credenciales no salen de ese proveedor. Solo una corrida a la vez.
- **FR-007**: Lo que el respaldo deje temporalmente en disco DEBE borrarse al terminar, salga bien o mal.

**Retención**

- **FR-008**: El sistema DEBE conservar copias diarias, semanales y mensuales según la regla de retención (ver Historia 2) y borrar las demás después de cada respaldo exitoso.
- **FR-009**: La retención NUNCA DEBE borrar la copia válida más reciente, ni dejar menos copias buenas de las que pide la regla porque fallaron respaldos.

**Restauración probada**

- **FR-010**: DEBE existir un procedimiento escrito, paso a paso, en la documentación de despliegue, para restaurar desde una copia: encontrarla, descifrarla con la llave del dueño, cargarla en una base **nueva**, comprobarla y apuntar el servicio a ella.
- **FR-011**: Una vez por semana, el sistema DEBE restaurar automáticamente la copia más reciente en una base temporal, comprobar que estén todas las tablas esperadas y que sus conteos de filas sean coherentes con la base viva (ninguna tabla esperada vacía si en la viva tiene filas), y borrar la base temporal al terminar.
- **FR-012**: La comprobación DEBE mirar solo estructura y conteos; NUNCA DEBE leer, mostrar ni registrar el contenido de las filas.
- **FR-013**: Para restaurar en la comprobación automática, la llave privada del dueño NO DEBE guardarse en el sistema. Cada copia se cifra también para una segunda llave **solo de comprobación**, que vive únicamente en el proceso que respalda y comprueba (riesgo aceptado por el dueño, 2026-11-12; ver Supuestos).

**Avisos de falla**

- **FR-014**: Toda falla del respaldo, de la retención o de la comprobación DEBE quedar en el registro de errores como proceso en segundo plano (`job:backup`, el mismo mecanismo que los demás procesos de la spec 018), con un **mensaje fijo** y sin datos de las familias, nombres de archivo con datos, credenciales ni llaves, y DEBE aparecer en el resumen semanal de errores (spec 039).
- **FR-015**: Un respaldo exitoso NO DEBE escribir en el registro de errores. El resumen semanal DEBE poder decir cuándo fue el último respaldo exitoso y la última comprobación exitosa. [Supuesto: una línea en el digest; ver Supuestos.]

**Ambientes**

- **FR-016**: Lo mismo DEBE servir para DEV y producción cambiando solo la configuración (ambiente, almacenamiento, llaves). Sin la configuración, el servicio funciona igual y dice una sola vez que los respaldos no están activos.
- **FR-017**: Nada de esto DEBE cambiar la app, sus pantallas ni su API para las familias.

### Entidades Clave

- **Copia de respaldo**: un archivo cifrado con la base completa de un ambiente en un instante. Atributos visibles: ambiente, fecha y hora, tamaño. Contenido: ilegible sin la llave del dueño.
- **Regla de retención**: cuántas copias diarias, semanales y mensuales se conservan.
- **Corrida**: un intento de respaldo o de comprobación: cuándo empezó, cómo terminó (bien o falla de qué tipo). No guarda datos de las familias.
- **Llave de respaldo**: el par de llaves del dueño. La pública vive en la configuración; la privada, fuera del sistema.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Durante 30 días seguidos hay una copia nueva cada día, salvo los días con una falla registrada.
- **SC-002**: Una copia tomada al azar no se puede leer sin la llave del dueño, y ninguna copia ni su nombre revelan datos de una familia.
- **SC-003**: El dueño puede restaurar la base desde una copia, siguiendo solo el procedimiento escrito, en menos de 1 hora y sin ayuda.
- **SC-004**: La comprobación automática corre cada semana y, durante 4 semanas, confirma que la copia más reciente se restaura completa.
- **SC-005**: Una falla del respaldo o de la comprobación aparece en el siguiente resumen semanal, como máximo 7 días después.
- **SC-006**: Se puede volver a un estado de hace 1 día, de hace 1 semana y de hace 1 mes.
- **SC-007**: Las familias no notan nada: ninguna pantalla ni petición cambia, y la app responde igual durante el respaldo.

## Supuestos

- **Cifrado con llave pública**: la copia se cifra con la llave **pública** del dueño. La privada la guarda el dueño en un gestor de contraseñas y en una segunda ubicación segura; nunca va al repositorio, a la configuración del servicio ni al almacenamiento.
- **La comprobación automática necesita poder descifrar** (aceptado por el dueño el 2026-11-12): como la llave del dueño no puede vivir en el sistema, cada copia se cifra **para dos destinatarios**: la llave del dueño y una llave **solo de comprobación**. Esta llave vive en la configuración del proceso que comprueba, que corre aparte del servicio de la app y sin acceso a internet salvo al almacenamiento. Es un riesgo aceptado: quien tenga esa llave **y** las credenciales del almacenamiento podría leer las copias. Si el dueño no lo acepta, la comprobación automática se limita a verificar que cada copia existe, tiene un tamaño razonable y se puede leer como archivo cifrado, y la restauración completa queda como prueba manual mensual.
- **Frecuencia**: diaria es suficiente para esta etapa. Se puede perder hasta un día de cambios. Una recuperación al minuto (respaldo continuo) queda fuera y se anota en el backlog si hace falta.
- **El proveedor de la base** puede ofrecer sus propios respaldos. No se cuenta con ellos, porque quedan en el mismo proveedor y bajo la misma cuenta. Si existen, son un extra.
- **Resumen semanal**: el digest de la spec 039 agrega una línea neutral con la fecha del último respaldo y de la última comprobación exitosa. Si no hay ninguno en los últimos 2 días, lo dice.
- **Costo**: con la base actual (DEV, decenas de MB, crece con las fotos) y la retención propuesta, el almacenamiento queda dentro de capas gratuitas o de centavos de dólar al mes.
- **Fuera de alcance**: respaldar los archivos del frontend, que ya están en el repositorio y en Cloudflare; respaldar la configuración del proveedor; y una recuperación automática que cambie la base sola, que siempre la decide el dueño.
- **Pasos del dueño**: crear la cuenta y el espacio del almacenamiento, generar sus llaves y guardar la privada, y poner las credenciales en la configuración del ambiente. La spec da los pasos exactos en la documentación de despliegue.
