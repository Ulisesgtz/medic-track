# Especificación de Funcionalidad: Tomas por momento del día

**Rama de la Funcionalidad**: `feature/015-tomas-por-momento-del-dia`

**Creado**: 2026-09-29

**Estado**: Borrador

**Entrada**: Descripción del usuario: "B1 del backlog: en cada medicamento del detalle de la consulta, las tomas del día se agrupan en Mañana, Tarde y Noche; cada toma aparece solo en su grupo y los grupos vacíos no se muestran."

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Tomas agrupadas por momento del día (Prioridad: P1)

En el detalle de la consulta, las tomas del día de un medicamento se muestran en grupos con título: **Mañana**,
**Tarde** y **Noche**, en lugar de una sola fila de chips. Cada toma aparece solo en el grupo que le toca según su
hora en la hora local del padre.

**Por qué esta prioridad**: con tratamientos cada 4 o 6 horas la fila se vuelve larga; agrupar ayuda a ubicar "la de la
tarde".

**Prueba Independiente**: un medicamento cada 8 h con tomas a las 00:00, 08:00 y 16:00 muestra 00:00 en Noche, 08:00 en
Mañana y 16:00 en Tarde.

**Escenarios de Aceptación**:

1. **Dado** tomas a las 00:00, 08:00 y 16:00, **Cuando** el padre ve el día, **Entonces** 08:00 está en Mañana, 16:00 en
   Tarde y 00:00 en Noche.
2. **Dado** que un grupo no tiene tomas ese día, **Entonces** no aparece.
3. **Dado** una toma a las 05:00, 11:59, 12:00, 18:59, 19:00 o 04:59, **Entonces** cae en Mañana, Mañana, Tarde, Tarde,
   Noche y Noche.
4. **Dado** un medicamento con varios días, **Cuando** el padre cambia de día, **Entonces** los grupos se rearman con las
   tomas de ese día.
5. **Dado** una toma de cualquier grupo, **Cuando** el padre la toca, **Entonces** se marca igual que hoy.

---

### Casos Límite

- Un medicamento con una sola toma al día: un solo grupo.
- El padre está en otra zona horaria: los grupos usan la hora local que ve el padre, la misma con que se muestran las
  horas de las tomas.
- Las tomas de la madrugada (00:00 a 04:59) van en Noche y, dentro de Noche, se ordenan por hora.
- Cambio de horario de verano: cada toma cae según la hora local con que se muestra.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Las tomas de un día de cada medicamento DEBEN agruparse en Mañana (05:00–11:59), Tarde (12:00–18:59) y
  Noche (19:00–04:59), según su hora local.
- **FR-002**: Cada grupo DEBE tener su título y solo mostrarse si tiene tomas.
- **FR-003**: Dentro de un grupo, las tomas DEBEN ordenarse por hora.
- **FR-004**: Marcar, desmarcar, el estado de cada toma (spec 013) y el selector de día NO DEBEN cambiar.
- **FR-005**: Los títulos DEBEN ser solo "Mañana", "Tarde" y "Noche"; sin sugerencias (Principio I).
- **FR-006**: Móvil y web DEBEN diseñarse por separado con los tokens de diseño y mostrarse al usuario para aprobarlos.

### Entidades Clave

- **Momento del día**: agrupación derivada de la hora local de la toma; no se guarda.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El padre ubica la toma de la tarde de un tratamiento cada 6 h sin recorrer toda la fila.
- **SC-002**: El 100 % de las tomas cae en un solo grupo, el que corresponde a su hora local.
- **SC-003**: Los flujos pasan sus pruebas de extremo a extremo a 390 y 1280 px.

## Supuestos

- Los rangos son los propuestos en el backlog; se ajustan en un solo lugar si cambian.
- Solo cambia la presentación; no hay cambios de datos ni de API.
- Aplica al detalle de la consulta; "Tomas de hoy" (detalle del hijo) queda como está.
- Depende de: spec 004/013 (chips y estados). Fuera de alcance: calendario (B4), progreso (B3), finalizar (B6).
- Sin mock: se diseña con `design-tokens.md`.
