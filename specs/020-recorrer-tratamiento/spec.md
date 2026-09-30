# Especificación de Funcionalidad: Recorrer el tratamiento y marcar inicio y fin en el calendario

**Rama de la Funcionalidad**: `feature/020-recorrer-tratamiento`

**Creado**: 2026-09-30

**Estado**: Borrador

**Entrada**: Descripción del usuario (B5 del backlog): «la opción b, en el calendario, marcar del color de la medicina el inicio y fin del tratamiento en los días que se deben de tomar». La opción (b) del backlog: un botón «Recorrer tratamiento» que el padre usa solo si su médico se lo indicó, que agrega las tomas al final y deja registrado quién lo decidió; nunca automático.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Recorrer el tratamiento cuando el médico lo indicó (Prioridad: P1)

Cuando un medicamento tiene tomas **sin registrar** (spec 013), el padre puede decidir —porque su médico se lo indicó— **agregar al final del tratamiento** tantas tomas como las que quedaron sin registrar. Lo hace con un botón «Recorrer tratamiento» en la tarjeta del medicamento, que pide una confirmación clara, y queda registrado **quién** lo decidió y **cuándo**. La app **nunca** lo hace sola ni lo sugiere: la decisión de reponer las tomas es del médico y del padre (Principio I).

**Por qué esta prioridad**: es el pedido del B5 («la fecha de fin se recorra»), pero con la regla acordada: solo con una decisión explícita del padre. Sin esto, una toma perdida deja la fecha de fin desactualizada para quien sí repone.

**Prueba Independiente**: un medicamento cada 8 h por 3 días con 2 tomas sin registrar; el padre toca «Recorrer tratamiento», confirma, y el medicamento termina 2 tomas (16 h) después; el detalle muestra cuántas tomas se agregaron y cuándo, y las 2 sin registrar siguen sin registrar.

**Escenarios de Aceptación**:

1. **Dado** un medicamento sin finalizar con al menos una toma «sin registrar» que aún no se ha recorrido, **Cuando** el padre ve su tarjeta, **Entonces** hay un botón «Recorrer tratamiento» de contorno, discreto, sin lenguaje que lo recomiende.
2. **Dado** el botón, **Cuando** lo toca, **Entonces** aparece un diálogo neutral que dice cuántas tomas se agregarán y hasta cuándo quedaría el tratamiento, pregunta si su médico se lo indicó, avisa que quedará registrado en su cuenta y que no se puede deshacer, con «Cancelar» (enfocado) y «Sí, recorrer».
3. **Dado** que confirma, **Entonces** se agregan al final del medicamento tantas tomas como tomas sin registrar había, con su misma frecuencia a partir de la última toma; las tomas sin registrar **no cambian** (siguen siendo historia) y el tratamiento ahora termina después.
4. **Dado** que confirma, **Entonces** queda registrado qué cuenta lo decidió, cuándo y cuántas tomas agregó; la tarjeta lo dice («Se recorrió el 30 sep · +2 tomas»).
5. **Dado** un medicamento ya recorrido, **Cuando** no hay tomas sin registrar nuevas, **Entonces** no vuelve a ofrecerse; si después llegan tomas sin registrar nuevas, se puede recorrer otra vez **solo por esas**.
6. **Dado** un medicamento finalizado (spec 016), **Entonces** no se ofrece recorrerlo.
7. **Dado** que el padre cancela o cierra el diálogo, **Entonces** no cambia nada.
8. **Dado** las tomas agregadas, **Entonces** se comportan como cualquier otra: estados (pendiente, por marcar, tomada, sin registrar), recordatorios, progreso («x / total» sube en el total), «Tomas de hoy», tratamiento activo y marcar/desmarcar.

---

### Historia de Usuario 2 - Inicio y fin del tratamiento marcados en el calendario (Prioridad: P1)

En el calendario del tratamiento (spec 019), cada medicamento marca con **su color** los días en que **se deben tomar** sus tomas, y el **primer** y el **último** día de su tratamiento se distinguen de los demás: el padre ve de un vistazo cuándo empieza y cuándo termina cada medicamento. Al recorrer el tratamiento (historia 1), el último día se mueve solo y el calendario lo refleja.

**Por qué esta prioridad**: el padre pidió ver el inicio y el fin de cada tratamiento en el calendario; además es lo que muestra el efecto de recorrer.

**Prueba Independiente**: un medicamento de 3 días muestra su número de color en cada uno de los 3 días; el primero y el tercero se ven distintos (marca rellena del color) con «inicio» y «fin» en su nombre accesible; tras recorrer 1 toma, el «fin» pasa al día que corresponde.

**Escenarios de Aceptación**:

1. **Dado** un medicamento, **Entonces** cada día que tiene al menos una toma lleva su marca de color (un día dentro del rango **sin** tomas, como con frecuencia de 48 h, ya no se marca).
2. **Dado** el primer día con tomas del medicamento, **Entonces** se distingue como **inicio** y el último como **fin**, con una marca rellena de su color (número en blanco); un tratamiento de un solo día es inicio y fin a la vez.
3. **Dado** el nombre accesible del día, **Entonces** dice «inicio de», «fin de» o ambos junto al medicamento («30 de septiembre · inicio de 1 Amoxicilina, 2 Paracetamol»).
4. **Dado** un tratamiento finalizado antes de tiempo (spec 016), **Entonces** su **fin** es el último día en que tuvo tomas que no se cancelaron.
5. **Dado** que se recorrió el tratamiento, **Entonces** el **fin** es el último día con tomas, que ahora incluye las agregadas, y puede cruzar de mes (las flechas de mes lo siguen).
6. **Dado** que se marca un día, **Entonces** la lista de tomas del día y las marcas de los demás medicamentos no cambian de comportamiento (spec 019).

---

### Casos Límite

- Varias tomas sin registrar: se agregan tantas como sin registrar haya, no una por día.
- Tomas sin registrar que el padre marca como tomadas **después** de recorrer: no se quitan las tomas agregadas (la decisión ya se tomó); solo las sin registrar que queden cuentan para un siguiente recorrido.
- El tratamiento ya terminó por su fecha pero quedaron tomas sin registrar: se puede recorrer (se agregan después de la última toma).
- Dos dispositivos recorren a la vez: solo se aplica una vez por las mismas tomas (sin duplicar).
- Un tratamiento con frecuencia de 48 h o más: las tomas agregadas siguen esa frecuencia y sus días llevan marca.
- Medicamento sin hora de inicio (sin tomas): no hay nada que recorrer ni que marcar.
- El padre está en otra zona horaria: los días del calendario y el «hasta cuándo» del diálogo se calculan en su hora local (specs 013/015/019).
- Un solo clic dos veces: se recorre una sola vez.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: La app NUNCA DEBE recorrer un tratamiento por sí sola ni sugerirlo; solo lo hace tras la confirmación explícita del padre (Principio I).
- **FR-002**: Un medicamento sin finalizar con tomas «sin registrar» aún no recorridas DEBE mostrar un botón «Recorrer tratamiento» de contorno; sin esas tomas, o finalizado, NO DEBE mostrarse.
- **FR-003**: Al tocarlo DEBE abrirse un diálogo neutral con: cuántas tomas se agregan, hasta qué día quedaría el tratamiento, la pregunta de si su médico se lo indicó, el aviso de que queda registrado en su cuenta y que no se puede deshacer; «Cancelar» con el foco inicial, Escape y fondo cancelan.
- **FR-004**: Al confirmar, el sistema DEBE agregar al final del medicamento tantas tomas como tomas sin registrar aún no recorridas tenía, con su frecuencia, a partir de la hora de su última toma; las tomas existentes NO DEBEN cambiar.
- **FR-005**: Cada recorrido DEBE quedar registrado de forma permanente: la cuenta que lo decidió, cuándo, el medicamento y cuántas tomas agregó; las mismas tomas sin registrar NO DEBEN poder recorrerse dos veces, tampoco desde dos dispositivos a la vez.
- **FR-006**: La tarjeta del medicamento DEBE decir que se recorrió y cuándo («Se recorrió el 30 sep · +2 tomas»).
- **FR-007**: Las tomas agregadas DEBEN ser tomas normales en todo: estados, marcar/desmarcar, recordatorios (spec 011), progreso (spec 014), «Tomas de hoy» y tratamiento activo.
- **FR-008**: Solo el dueño de la consulta DEBE poder recorrer un medicamento; un medicamento finalizado NO DEBE poder recorrerse.
- **FR-009**: El calendario (spec 019) DEBE marcar con el color del medicamento los días que tienen al menos una toma de él, y distinguir con una marca rellena el primer día (**inicio**) y el último (**fin**); el nombre accesible del día DEBE decir «inicio de» / «fin de».
- **FR-010**: El fin DEBE seguir al tratamiento: con un tratamiento finalizado, el último día con tomas no canceladas; con uno recorrido, el último día con tomas incluyendo las agregadas.
- **FR-011**: Los textos DEBEN ser neutros y en español; nada de «debes», «te conviene» ni consejo médico.
- **FR-012**: Móvil y web DEBEN diseñarse por separado con los tokens de diseño y mostrarse al usuario para aprobarlos antes de darse por terminados.

### Entidades Clave

- **Recorrido del tratamiento**: decisión del padre de agregar N tomas al final de un medicamento; guarda la cuenta, el medicamento, cuántas tomas y cuándo. Es de solo agregar (no se edita ni se borra).
- **Toma agregada**: una toma más del medicamento creada por un recorrido; se distingue de las originales solo en que su recorrido la trajo.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El padre recorre un tratamiento en 2 toques (botón y confirmación) y ve la nueva fecha de fin en el calendario y en la tarjeta.
- **SC-002**: El 100 % de los recorridos queda registrado con su cuenta y su hora, y ninguna toma sin registrar se cuenta dos veces.
- **SC-003**: La app nunca agrega tomas sin una confirmación (0 recorridos automáticos).
- **SC-004**: Un padre identifica en el calendario, sin abrir nada más, el primer y el último día de cada medicamento.
- **SC-005**: Los flujos pasan sus pruebas de extremo a extremo a 390 y 1280 px, y las unitarias mantienen >90 % de cobertura.

## Supuestos

- **Decisión del usuario (2026-09-30)**: se sigue la opción (b) del backlog y se descarta la (a); el calendario marca inicio y fin con el color del medicamento.
- Se agregan **tantas tomas como tomas sin registrar** (propuesta a revisar con el usuario): el padre repone exactamente lo que dejó de registrar. No hay opción de elegir otro número.
- «Quién lo decidió» es la **cuenta del padre** que confirmó (no hay más de un usuario por cuenta); se guarda con la hora y el número de tomas.
- Esto requiere cambios de servidor: es la **segunda excepción** a la inmutabilidad de las consultas (spec 004, FR-014), después de finalizar (spec 016): ahora también se **agregan tomas**; nada se edita ni se borra. Toca el Principio I, por lo que requiere la confirmación del usuario, que la dio al elegir la opción (b).
- Las tomas sin registrar no se vuelven a marcar ni se quitan: siguen siendo historia.
- Fuera de alcance: recorrer automáticamente, elegir cuántas tomas agregar, deshacer un recorrido, recorrer por otro motivo (cambiar la frecuencia o las horas), avisar al médico, y mostrar el historial de recorridos como lista (solo la línea de la tarjeta).
- Depende de: specs 013 (sin registrar), 016 (finalizar), 019 (calendario), 011 (recordatorios), 014 (progreso).
- Sin mock: se diseña con `design-tokens.md` y se muestran capturas.
