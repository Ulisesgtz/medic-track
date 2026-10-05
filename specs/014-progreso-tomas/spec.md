# Especificación de Funcionalidad: Barra de progreso de tomas por medicamento

**Rama de la Funcionalidad**: `feature/014-progreso-tomas`

**Creado**: 2026-09-29

**Estado**: Borrador

**Entrada**: Descripción del usuario: "B3 del backlog: arriba de cada medicamento del detalle de la consulta, "N / total tomas" con una barra que muestra el avance; cuenta solo las marcadas como tomadas y muestra aparte cuántas quedaron sin registrar."

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Ver cuánto va del tratamiento (Prioridad: P1)

En el detalle de la consulta, cada medicamento muestra arriba, antes de sus tomas, "3 / 9 tomas" y una barra llena en
esa proporción. El padre ve de un vistazo cuántas tomas marcó del total que el médico indicó.

**Por qué esta prioridad**: hoy hay que contar chips en varios días para saber cómo va el tratamiento.

**Prueba Independiente**: un medicamento cada 8 h por 3 días (9 tomas) con 3 marcadas muestra "3 / 9 tomas" y la barra
a un tercio.

**Escenarios de Aceptación**:

1. **Dado** un medicamento cada 8 h por 3 días con 3 tomas marcadas, **Cuando** el padre abre el detalle, **Entonces**
   ve "3 / 9 tomas" y una barra llena a un tercio.
2. **Dado** ese medicamento, **Cuando** marca otra toma, **Entonces** el texto y la barra se actualizan sin recargar.
3. **Dado** que desmarca una toma, **Entonces** el avance baja.
4. **Dado** un lector de pantalla, **Cuando** llega a la barra, **Entonces** anuncia "3 de 9 tomas registradas".

---

### Historia de Usuario 2 - Ver cuántas quedaron sin registrar (Prioridad: P2)

Si hay tomas "sin registrar" (spec 013), la barra lo dice aparte: "3 / 9 tomas · 2 sin registrar". Esas tomas no
cuentan como avance.

**Por qué esta prioridad**: distingue lo que se marcó de lo que quedó sin marca, sin afirmar que no se dio.

**Prueba Independiente**: con 2 tomas sin registrar, el texto las menciona y la barra no las cuenta.

**Escenarios de Aceptación**:

1. **Dado** 3 marcadas y 2 sin registrar de 9, **Cuando** el padre ve el medicamento, **Entonces** lee "3 / 9 tomas · 2
   sin registrar" y la barra sigue a un tercio.
2. **Dado** que no hay ninguna sin registrar, **Entonces** el texto no menciona ese conteo.

---

### Casos Límite

- Un medicamento sin tomas (consultas anteriores sin hora de inicio): no se muestra barra.
- Todas las tomas marcadas: la barra queda llena y el texto "9 / 9 tomas"; sin felicitaciones ni mensajes de evaluación.
- Un tratamiento de una sola toma: "0 / 1 toma" / "1 / 1 toma".
- Tratamiento terminado antes (spec 016): el total es el de las tomas que sí correspondían hasta terminarlo.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Cada medicamento con tomas DEBE mostrar, antes de sus tomas, el número de tomas marcadas y el total
  programado ("N / total tomas") y una barra proporcional.
- **FR-002**: Solo las tomas marcadas DEBEN contar como avance; las pendientes, por marcar y sin registrar no.
- **FR-003**: Si hay tomas "sin registrar", el texto DEBE indicar cuántas, aparte del avance.
- **FR-004**: El avance DEBE actualizarse sin recargar al marcar o desmarcar una toma.
- **FR-005**: La barra DEBE tener nombre y valor accesibles (barra de progreso con "N de total tomas registradas").
- **FR-006**: Ningún texto DEBE evaluar la adherencia ("bien", "atrasado", "te faltan") ni sugerir acciones (Principio I).
- **FR-007**: Un medicamento sin tomas NO DEBE mostrar barra.
- **FR-008**: Móvil y web DEBEN diseñarse por separado con los tokens de diseño y mostrarse al usuario para aprobarlos.

### Entidades Clave

- **Progreso de un medicamento**: derivado de sus tomas: cuántas marcadas, cuántas en total y cuántas sin registrar; no se guarda.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El padre lee cuántas tomas lleva de cada medicamento sin contar chips.
- **SC-002**: El avance refleja un cambio de marca en menos de 1 segundo, sin recargar.
- **SC-003**: Ningún texto evalúa ni aconseja (revisión contra el Principio I).
- **SC-004**: Los flujos pasan sus pruebas de extremo a extremo a 390 y 1280 px.

## Supuestos

- El total son todas las tomas generadas del medicamento; el avance, las marcadas.
- Se calcula en la pantalla a partir de las tomas que ya llegan; no hay endpoint nuevo.
- Depende de: spec 004 (tomas), spec 013 (estado sin registrar). Fuera de alcance: calendario (B4), fecha de fin (B5).
- Sin mock: se diseña con `design-tokens.md` (barra de la app: la del panel de lectura de la receta como referencia).
