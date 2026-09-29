# Especificación de Funcionalidad: Finalizar tratamiento antes de tiempo

**Rama de la Funcionalidad**: `feature/016-finalizar-tratamiento`

**Creado**: 2026-09-29

**Estado**: Borrador

**Entrada**: Descripción del usuario: "B6 del backlog: un botón "Finalizar tratamiento" en cada medicamento para terminarlo antes; pide confirmación, guarda cuándo se terminó y cuántas tomas se marcaron, las tomas que faltaban dejan de avisarse y se muestran como canceladas (no se borran)."

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Terminar un tratamiento antes (Prioridad: P1)

Si el médico le indicó al padre dejar un medicamento antes de lo previsto, el padre toca "Finalizar tratamiento" en ese
medicamento y confirma. El tratamiento queda terminado: el detalle dice cuándo y cuántas tomas se marcaron, y las tomas
que aún no llegaban quedan como canceladas.

**Por qué esta prioridad**: hoy un tratamiento sigue "activo" y avisando hasta su última toma aunque ya se suspendió.

**Prueba Independiente**: en un medicamento cada 8 h por 3 días, terminarlo al segundo día con 6 marcadas muestra
"Terminado el 30 sep · 6 de 9 tomas" y las tomas futuras canceladas.

**Escenarios de Aceptación**:

1. **Dado** un medicamento en curso, **Cuando** el padre toca "Finalizar tratamiento", **Entonces** ve una confirmación
   con texto neutral ("Se dejarán de avisar las tomas que faltan. Las tomas registradas se conservan.") y puede
   cancelar.
2. **Dado** que confirma, **Entonces** el medicamento muestra "Terminado el 30 sep · 6 de 9 tomas".
3. **Dado** un tratamiento terminado, **Entonces** sus tomas que aún no llegaban aparecen canceladas (no se borran,
   sin poder marcarse) y las que ya habían llegado siguen como estaban (tomada, por marcar o sin registrar) y se pueden
   seguir marcando.
4. **Dado** un tratamiento terminado, **Entonces** ya no cuenta como tratamiento activo (spec 006) ni recibe recordatorios
   (spec 011).
5. **Dado** un tratamiento terminado, **Entonces** el botón "Finalizar tratamiento" ya no aparece.
6. **Dado** un medicamento cuyas tomas ya terminaron todas, **Entonces** no ofrece "Finalizar tratamiento".

---

### Casos Límite

- Dos medicamentos en la misma consulta: terminar uno no afecta al otro.
- Una toma que llegó pero aún no llega la siguiente: queda como por marcar (no se cancela).
- Otra cuenta intenta terminar un tratamiento ajeno: se rechaza (solo el dueño).
- El padre confirma dos veces (doble toque o dos dispositivos): el segundo intento no cambia nada ni da error.
- Consultas anteriores sin tomas: no ofrecen el botón.
- No hay forma de deshacer en esta funcionalidad (decisión); el texto de la confirmación lo dice.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Cada medicamento con tomas por delante DEBE ofrecer "Finalizar tratamiento", con una confirmación de texto
  neutral que se puede cancelar.
- **FR-002**: Al confirmar, el sistema DEBE guardar cuándo se terminó el tratamiento y NO DEBE borrar ninguna toma.
- **FR-003**: Las tomas cuya hora aún no llegaba al terminar DEBEN mostrarse como canceladas, sin poder marcarse; las que
  ya habían llegado DEBEN conservar su estado y seguir marcándose.
- **FR-004**: El medicamento DEBE mostrar "Terminado el <fecha> · N de M tomas", con N marcadas y M las que
  correspondían hasta terminarlo (las canceladas no cuentan).
- **FR-005**: Un tratamiento terminado NO DEBE contar como activo ni recibir recordatorios.
- **FR-006**: Terminar es irreversible en esta funcionalidad y la confirmación DEBE decirlo.
- **FR-007**: Solo el dueño de la cuenta DEBE poder terminar un tratamiento; terminar dos veces NO DEBE dar error ni
  cambiar nada.
- **FR-008**: Ningún texto DEBE aconsejar ni evaluar (Principio I); solo registra lo que el padre decidió.
- **FR-009**: Es una excepción explícita a la inmutabilidad de las consultas (spec 004, FR-014): lo único que cambia es
  el fin del tratamiento; el horario y los datos del médico no.
- **FR-010**: Móvil y web DEBEN diseñarse por separado con los tokens de diseño y mostrarse al usuario para aprobarlos.

### Entidades Clave

- **Medicamento** (existente): gana el momento en que se terminó, si se terminó antes.
- **Toma cancelada**: toma cuya hora no había llegado al terminarse el tratamiento; derivada, no se borra.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El padre termina un tratamiento en 2 toques (botón y confirmación).
- **SC-002**: Ninguna toma cancelada recibe recordatorio.
- **SC-003**: El 100 % de las tomas y sus marcas se conserva tras terminar.
- **SC-004**: Ningún texto aconseja ni evalúa (revisión contra el Principio I).
- **SC-005**: Los flujos pasan sus pruebas de extremo a extremo a 390 y 1280 px.

## Supuestos

- "Cuándo se terminó" es el momento de la confirmación; las tomas con hora posterior se cancelan.
- No hay deshacer ni reactivar; si hace falta, va al backlog.
- Endpoint nuevo solo para el dueño, con su prueba de acceso; la respuesta de la consulta trae si terminó y cuándo.
- Depende de: spec 004 (consultas), 006 (tratamiento activo), 008 (dueño), 011 (recordatorios), 013 (estado de tomas).
  Recomendado hacer después de B3 (014) para que su total use las tomas que correspondían.
- Fuera de alcance: calendario (B4), fecha de fin dinámica (B5), deshacer.
- Sin mock: se diseña con `design-tokens.md`.
