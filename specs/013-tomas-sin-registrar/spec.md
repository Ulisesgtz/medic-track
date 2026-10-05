# Especificación de Funcionalidad: Tomas "sin registrar" automáticas

**Rama de la Funcionalidad**: `feature/013-tomas-sin-registrar`

**Creado**: 2026-09-29

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Tomas 'sin registrar' automáticas (B2 del backlog). Hoy cada toma es tomada o no tomada, y la app la pinta gris mientras su hora no llega, ámbar cuando su hora pasó sin marcarse y verde cuando se marcó. Se agrega un cuarto estado visible: 'Sin registrar'. Una toma pasa sola a 'Sin registrar' cuando llega la hora de la siguiente toma de ese mismo medicamento y nadie la marcó; la última toma del tratamiento pasa cuando llegaría la siguiente según la frecuencia. Automático, igual en todos los dispositivos. Principio I: el texto es 'Sin registrar', nunca 'No tomada' ni nada que sugiera darla tarde o reponerla; se puede seguir marcando como tomada. Estilo distinto por algo más que el color, sin rojo ni ámbar. Afecta el detalle de la consulta, 'Tomas de hoy' (móvil), el panel del día (web) y la tarjeta del hijo en el home. Un recordatorio nunca se manda para una toma 'Sin registrar'. Base de B3–B6, fuera de alcance, igual que B1 y cualquier aviso por tomas sin registrar."

## Aclaraciones

### Sesión 2026-09-29

- Q: ¿Cómo se tratan las tomas "sin registrar" en "Tomas de hoy", el panel del día y el home? → A: se cuentan aparte
  ("2 sin marcar · 1 sin registrar") y "Marcar tomas" marca solo las que no están sin registrar; las sin registrar se
  marcan una por una. El chip "N tomas hoy" del home cuenta solo las que no están sin registrar.
- Q: ¿Cuándo pasa una toma a "sin registrar"? → A: al llegar la siguiente toma de su medicamento (la última, a su hora
  más la frecuencia).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Ver qué tomas quedaron sin registrar (Prioridad: P1)

El padre abre la consulta de su hijo y, además de las tomas marcadas (verde), las que todavía están por marcar (ámbar)
y las que aún no llegan (gris), ve como "Sin registrar" las tomas cuyo turno ya pasó porque llegó la siguiente toma sin
que nadie las marcara. Así distingue lo que aún está a tiempo de marcar de lo que quedó atrás sin registro.

**Por qué esta prioridad**: es el cambio en sí; hoy una toma de hace tres días sin marcar se ve igual que la de hace diez
minutos, y B3–B6 necesitan este estado.

**Prueba Independiente**: con un medicamento cada 8 horas que empezó a las 08:00, a las 17:00 sin nada marcado: la de
08:00 se ve "Sin registrar", la de 16:00 "por marcar" (ámbar) y la de 00:00 pendiente (gris).

**Escenarios de Aceptación**:

1. **Dado** un medicamento cada 8 h con tomas a las 08:00, 16:00 y 00:00, **Cuando** a las 17:00 ninguna está marcada,
   **Entonces** la de 08:00 aparece como "Sin registrar", la de 16:00 como por marcar y la de 00:00 como pendiente.
2. **Dado** una toma por marcar (ámbar), **Cuando** llega la hora de la siguiente toma del mismo medicamento sin que
   nadie la marque, **Entonces** pasa sola a "Sin registrar", sin que el padre haga nada.
3. **Dado** la última toma del tratamiento, sin marcar, **Cuando** llega el momento en que tocaría la siguiente según
   la frecuencia (su hora más cada cuántas horas), **Entonces** pasa a "Sin registrar".
4. **Dado** una toma "Sin registrar", **Cuando** el padre la ve en el teléfono y en la computadora, **Entonces** ambos
   la muestran igual.
5. **Dado** una toma "Sin registrar", **Cuando** un lector de pantalla llega a ella, **Entonces** anuncia su hora y que
   está sin registrar.

---

### Historia de Usuario 2 - Marcar después una toma sin registrar (Prioridad: P1)

Si el padre sí dio la toma pero no la marcó a tiempo, puede tocarla y marcarla como tomada en cualquier momento. Si se
equivoca y la desmarca, vuelve a "Sin registrar".

**Por qué esta prioridad**: "Sin registrar" solo refleja que nadie la marcó (Principio I); el padre siempre tiene la
última palabra sobre lo que pasó.

**Prueba Independiente**: tocar una toma "Sin registrar" y verla verde; tocarla otra vez y verla "Sin registrar".

**Escenarios de Aceptación**:

1. **Dado** una toma "Sin registrar", **Cuando** el padre la toca, **Entonces** queda marcada como tomada.
2. **Dado** una toma marcada cuya siguiente toma ya llegó, **Cuando** el padre la desmarca, **Entonces** vuelve a
   "Sin registrar" (no a por marcar).
3. **Dado** una toma marcada cuya siguiente toma aún no llega, **Cuando** el padre la desmarca, **Entonces** vuelve a
   por marcar (ámbar), como hoy.

---

### Historia de Usuario 3 - "Tomas de hoy" y el home con el estado nuevo (Prioridad: P2)

Los resúmenes del día — el bloque "Tomas de hoy" del detalle del hijo (móvil), el panel del día (web) y los chips de la
tarjeta del hijo en el home — reflejan el estado nuevo de forma coherente con el detalle de la consulta.

**Por qué esta prioridad**: sin esto, el detalle diría "Sin registrar" y el resumen seguiría llamándola "sin marcar".

**Prueba Independiente**: con una toma "Sin registrar" y otra por marcar hoy, revisar el bloque, el panel y la
tarjeta del home.

**Escenarios de Aceptación**:

1. **Dado** tomas de hoy por marcar y sin registrar, **Cuando** el padre ve el bloque "Tomas de hoy" o el panel del día,
   **Entonces** las "sin registrar" se cuentan aparte: "2 sin marcar · 1 sin registrar".
2. **Dado** tomas de hoy por marcar y sin registrar, **Cuando** el padre toca "Marcar tomas", **Entonces** se marcan
   solo las que no están sin registrar; las sin registrar siguen igual y se marcan una por una en la consulta.
3. **Dado** que hoy solo quedan tomas sin registrar, **Cuando** el padre ve el bloque, **Entonces** no hay nada por
   marcar ("Sin tomas pendientes", sin botón "Marcar tomas") y el bloque dice cuántas quedaron sin registrar.
4. **Dado** tomas de hoy sin registrar, **Cuando** el padre ve la tarjeta del hijo en el home, **Entonces** el chip
   "N tomas hoy" no las cuenta.
5. **Dado** una toma "Sin registrar" en el panel del día (web), **Cuando** el padre la ve, **Entonces** tiene el mismo
   estilo y texto que en el detalle de la consulta.

---

### Casos Límite

- Un medicamento con una sola toma: pasa a "Sin registrar" cuando llegaría la siguiente según su frecuencia.
- Dos medicamentos con horarios distintos: cada toma depende solo de la siguiente toma **de su mismo medicamento**.
- Medicamentos de consultas anteriores sin hora de inicio (sin tomas): no cambia nada.
- El teléfono o la computadora tienen la hora mal: el estado se decide con la hora real, no la del dispositivo.
- La app abierta sin tocarla cuando llega la siguiente toma: el estado cambia sin recargar (a más tardar en un minuto o
  al volver a la app).
- Una toma "Sin registrar" que se marca como tomada después: no se manda ningún recordatorio ni aviso por ella, antes ni
  después.
- Una toma por marcar cuyo recordatorio aún no salió (backend detenido) y ya llegó la siguiente: pasa a "Sin registrar"
  y ya no se avisa.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Cada toma DEBE mostrarse en uno de cuatro estados: **pendiente** (su hora aún no llega), **por marcar**
  (su hora llegó, no está marcada y aún no llega la siguiente toma de su medicamento), **tomada** (marcada) y
  **sin registrar** (no está marcada y ya llegó la hora de la siguiente toma de su medicamento).
- **FR-002**: Para la última toma de un tratamiento, "la siguiente toma" DEBE ser el momento en que tocaría según la
  frecuencia: su hora más la frecuencia del medicamento.
- **FR-003**: El paso a "sin registrar" DEBE ser automático, sin acción del padre, y el estado de cada toma DEBE ser el
  mismo en todos sus dispositivos en el mismo momento.
- **FR-004**: El estado DEBE decidirse con la hora real, no con el reloj del dispositivo del padre.
- **FR-005**: El texto visible y el anunciado a tecnologías de asistencia DEBE ser "Sin registrar"; ningún texto DEBE
  decir "no tomada", "olvidada", "atrasada" ni sugerir darla tarde, reponerla o avisar al médico (Principio I).
- **FR-006**: Una toma "sin registrar" DEBE poder marcarse como tomada en cualquier momento; al desmarcar una toma
  cuya siguiente ya llegó, DEBE volver a "sin registrar".
- **FR-007**: El estilo de "sin registrar" DEBE distinguirse de los otros tres estados por algo más que el color (p. ej.
  borde punteado o un ícono), sin rojo y sin el ámbar de "por marcar", con contraste de texto de al menos 4.5:1, y con
  la misma área táctil y comportamiento que los demás chips.
- **FR-008**: El detalle de la consulta (móvil y web) DEBE mostrar el estado nuevo en los chips de cada toma.
- **FR-009**: El bloque "Tomas de hoy" (móvil) y el panel del día (web) DEBEN contar las tomas "sin registrar" aparte
  de las "sin marcar" ("2 sin marcar · 1 sin registrar"); "Marcar tomas" DEBE marcar solo las que no están sin
  registrar; si solo quedan sin registrar, el bloque DEBE decir que no hay nada por marcar y cuántas quedaron sin
  registrar. El chip "N tomas hoy" de la tarjeta del hijo en el home NO DEBE contarlas.
- **FR-010**: Nunca DEBE enviarse un recordatorio (spec 011) de una toma que ya está "sin registrar".
- **FR-011**: Una pantalla abierta DEBE reflejar el cambio a "sin registrar" sin recargar, a más tardar en un minuto o
  al volver a la app.
- **FR-012**: No DEBE haber ningún aviso, notificación ni resumen nuevo por tomas sin registrar.

### Entidades Clave

- **Toma** (existente, spec 004): gana un estado visible derivado de su hora, de si está marcada y de la hora de la
  siguiente toma de su medicamento (o su hora más la frecuencia, si es la última). Lo único que el padre cambia sigue
  siendo si está marcada.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El 100 % de las tomas sin marcar cuya siguiente toma ya llegó se ven "Sin registrar" en el detalle de la
  consulta, en móvil y en web.
- **SC-002**: Una pantalla abierta refleja el cambio de estado en menos de un minuto, sin recargar.
- **SC-003**: Ninguna toma "Sin registrar" recibe un recordatorio.
- **SC-004**: Ningún texto de la funcionalidad dice "no tomada", "olvidada" ni sugiere una acción médica (revisión
  contra el Principio I).
- **SC-005**: Un padre distingue los cuatro estados sin depender del color (revisado en escala de grises).
- **SC-006**: Los flujos de ver, marcar y desmarcar una toma "Sin registrar" pasan sus pruebas de extremo a extremo a
  390 y 1280 px.

## Supuestos

- "La siguiente toma" es la siguiente **del mismo medicamento** según su horario, esté marcada o no.
- La última toma de un tratamiento usa su hora más la frecuencia, que es cuando habría tocado la siguiente.
- El estado se deriva del horario, de la marca y de la hora real; no se guarda un campo nuevo que el padre edite.
- Los recordatorios ya se mandan como máximo una vez por toma y solo cerca de su hora (spec 011); este cambio solo
  garantiza que una toma "sin registrar" nunca se avise.
- Fuera de alcance: agrupar por mañana/tarde/noche (B1), barra de progreso (B3), calendario (B4), fecha de fin (B5),
  finalizar tratamiento (B6) y cualquier aviso por tomas sin registrar.
- Sin mock: el chip nuevo se diseña con `design-tokens.md` en móvil y web y se muestra al usuario para aprobarlo.
- Depende de: spec 004 (tomas y su marca), spec 006 (tomas de hoy en la hora local del padre), spec 007 (diseños de los
  chips), spec 011 (recordatorios).
