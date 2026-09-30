# Especificación de Funcionalidad: Calendario del tratamiento

**Rama de la Funcionalidad**: `feature/019-calendario-tratamiento`

**Creado**: 2026-09-30

**Estado**: Borrador

**Entrada**: Descripción del usuario: "el B4" (backlog, «Seguimiento del tratamiento»): un solo calendario por consulta, con el rango de cada medicamento de inicio a fin, un color por medicamento con su leyenda, y al tocar un día se ven las tomas de ese día.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Ver el tratamiento completo en un calendario (Prioridad: P1)

En el detalle de la consulta, el padre ve **un solo calendario** que muestra, de un vistazo, qué días dura cada medicamento. Cada medicamento tiene su color y una leyenda con su nombre; cada día dentro de su rango lleva una marca de ese color. Hoy solo puede ver las tomas de **un día** a la vez y cambiar con «Día anterior / Día siguiente»: con dos o tres medicamentos que empiezan y terminan en días distintos no hay forma de ver el conjunto.

**Por qué esta prioridad**: es el pedido central del B4; responde «¿hasta cuándo le toca cada medicina?» sin ir día por día.

**Prueba Independiente**: una consulta con Amoxicilina 7 días desde hoy y Paracetamol 3 días desde hoy muestra el mes con 7 días marcados del color de Amoxicilina y, encima de los tres primeros, también el del Paracetamol; la leyenda lista los dos.

**Escenarios de Aceptación**:

1. **Dado** una consulta con varios medicamentos, **Cuando** el padre abre el detalle, **Entonces** ve un único calendario (no uno por medicamento) y una leyenda con el nombre de cada medicamento junto a su color.
2. **Dado** un medicamento con tomas del 30 sep al 6 oct, **Entonces** esos días, y solo esos, llevan su marca, aunque el rango cruce de un mes a otro (el padre cambia de mes con flechas).
3. **Dado** que dos medicamentos coinciden un día, **Entonces** el día muestra la marca de ambos, sin tapar una con otra.
4. **Dado** un medicamento cuyo tratamiento se finalizó antes de tiempo (spec 016), **Entonces** su rango termina en el día en que se finalizó y los días posteriores no llevan su marca.
5. **Dado** el día de hoy, **Entonces** se distingue claramente de los demás, y si hay días fuera del tratamiento se ven atenuados pero legibles.
6. **Dado** una consulta con un solo medicamento, **Entonces** el calendario funciona igual, con su leyenda de uno.

---

### Historia de Usuario 2 - Tocar un día para ver sus tomas (Prioridad: P1)

Al tocar un día del calendario, el padre ve debajo las tomas de ese día, de todos los medicamentos, cada una con su hora, su medicamento (con su color) y su estado (spec 013/016), y puede marcarla o desmarcarla como hoy.

**Por qué esta prioridad**: sin esto el calendario solo sería un dibujo; el padre lo usa para revisar un día pasado o consultar uno futuro.

**Prueba Independiente**: tocar el día 3 de un tratamiento de 7 días muestra las tomas de ese día de cada medicamento y permite marcar una.

**Escenarios de Aceptación**:

1. **Dado** el calendario, **Cuando** el padre toca un día con tomas, **Entonces** se listan sus tomas en orden de hora, cada una con el color del medicamento, su hora, su estado y el mismo control de marcar que hoy.
2. **Dado** que entra al detalle, **Entonces** el día seleccionado es hoy si cae dentro del tratamiento; si no, el primer día del tratamiento.
3. **Dado** un día sin tomas (fuera de todos los rangos), **Cuando** lo toca, **Entonces** el calendario dice que ese día no hay tomas.
4. **Dado** una toma marcada desde el día seleccionado, **Entonces** se actualiza ahí y en el resto de la pantalla (barra de progreso, cantidades) sin recargar.
5. **Dado** una toma cancelada (spec 016) o sin registrar (spec 013), **Entonces** conserva su aspecto y reglas actuales.

---

### Casos Límite

- Un tratamiento de un solo día: un solo día marcado.
- El padre está en otra zona horaria: los días se calculan con la hora local que ve el padre, igual que el resto de la pantalla (specs 013/015).
- Más de 6 medicamentos: los colores se repiten; cada marca lleva además una inicial o número para no depender solo del color.
- Día con muchas tomas (p. ej. cada 4 h de dos medicamentos): el calendario solo marca presencia por medicamento, el detalle de tomas va en la lista del día.
- Tratamiento de más de un mes: el calendario abre en el mes del día seleccionado y tiene flechas para cambiar de mes; las flechas solo llegan hasta los meses que tienen algún día del tratamiento (no hay meses vacíos que recorrer).
- Medicamentos con tomas sin registrar (spec 013): el calendario **no** cambia su rango ni «recorre» el tratamiento; lo que se hace con esas tomas es el B5 y no entra aquí.
- Pantallas de 390 px: el calendario cabe sin desplazamiento horizontal.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El detalle de la consulta DEBE mostrar **un solo calendario mensual** por consulta, con todos sus medicamentos.
- **FR-002**: Cada medicamento DEBE tener **un color propio** dentro de la consulta y una **leyenda** con su nombre; los colores DEBEN distinguirse entre sí, tener contraste ≥ 3:1 contra el fondo, no ser rojo (no hay alerta médica) ni el ámbar de «pendiente» (Principio I y `design-tokens.md`), y no ser el único indicador (cada marca lleva una inicial o número).
- **FR-003**: Cada día entre la primera y la última toma de un medicamento (o hasta el día en que se finalizó, spec 016) DEBE llevar la marca de su color; un día con varios medicamentos DEBE mostrar todas las marcas.
- **FR-004**: El día de hoy DEBE distinguirse; el calendario DEBE permitir cambiar de mes.
- **FR-005**: Tocar un día DEBE seleccionarlo y mostrar sus tomas, de todos los medicamentos y ordenadas por hora, cada una con color, hora, estado y el control de marcar/desmarcar existente.
- **FR-006**: Al abrir el detalle, el día seleccionado DEBE ser hoy si está dentro del tratamiento o, si no, el primer día de la consulta.
- **FR-007**: Marcar una toma desde la lista del día DEBE actualizarla en todo el detalle (chips por medicamento, progreso) sin recargar, igual que hoy.
- **FR-008**: Los días se DEBEN calcular en la hora local del padre; el calendario NO DEBE cambiar el rango, las tomas ni sus estados (solo los presenta).
- **FR-009**: Los textos DEBEN ser neutros y en español, sin consejo ni evaluación (Principio I).
- **FR-010**: Móvil y web DEBEN diseñarse por separado con los tokens de diseño y mostrarse al usuario para aprobarlos antes de darse por terminados.
- **FR-011**: Los colores nuevos DEBEN documentarse en `design-tokens.md`.

### Entidades Clave

- **Rango de un medicamento**: primer y último día con tomas (o el día en que se finalizó); derivado de sus tomas, no se guarda.
- **Color del medicamento**: asignación estable dentro de la consulta (por orden del medicamento); no se guarda.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El padre contesta «¿hasta cuándo dura cada medicamento?» mirando una sola pantalla, sin cambiar de día.
- **SC-002**: El 100 % de los días dentro del rango de un medicamento lleva su marca y ninguno fuera de él.
- **SC-003**: Ver las tomas de cualquier día toma un toque.
- **SC-004**: Los flujos pasan sus pruebas de extremo a extremo a 390 y 1280 px, y las unitarias mantienen >90 % de cobertura.

## Supuestos

- Se sigue la propuesta del backlog: un calendario por consulta, un color por medicamento con leyenda, tocar un día muestra sus tomas.
- Solo frontend: todo se deriva de las tomas y de `endedAt` que el detalle de la consulta ya trae; sin cambios de API ni de base de datos.
- **Decidido por el usuario (2026-09-30, al ver las capturas)**: el selector «Día anterior / Día siguiente» de cada medicamento se **quita**; el calendario y su lista del día son la forma de ver las tomas de otros días. Cada medicamento sigue mostrando los chips de un día (hoy, o el día más cercano con tomas). Consecuencia: las tomas de un tratamiento finalizado antes de tiempo (canceladas) ya no se alcanzan por el calendario si caen después del día en que terminó; solo se ven en el día más cercano de la tarjeta.
- La paleta exacta (unos 6 colores) se define en el plan y se documenta en `design-tokens.md`.
- Fuera de alcance: recorrer el tratamiento o marcar en el calendario los días con tomas sin registrar (B5), exportar al calendario del teléfono (.ics, spec 011), y vistas semanal o anual.
- Depende de: specs 013 (estados), 015 (hora local), 016 (finalizar), 014 (progreso).
- Sin mock: se diseña con `design-tokens.md` y se muestran capturas.
