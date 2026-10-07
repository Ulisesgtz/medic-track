# Especificación de Funcionalidad: Pantalla de planes y modales del plan completo

**Rama de la Funcionalidad**: `feature/034-planes-y-modales`

**Creado**: 2026-10-07

**Estado**: En implementación

**Entrada**: Decisión del dueño del producto (2026-10-07): un solo plan de pago a **MX$499 al año**, una suscripción por familia, y una pantalla de planes con dos recuadros (Gratis y Plan completo) más el modal de límite rediseñado para todos los motivos. Diseño entregado: `Planes PediTrack.dc.html` (+ `PlanTarjeta`, `LimiteModal`, `PlanAvisoCompacto`); decisiones en [referencia/planes-decisiones.md](./referencia/planes-decisiones.md). **El cobro con Mercado Pago NO está en esta entrega**: la pantalla se publica con el botón en estado «Pronto».

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Ver los planes y lo que incluye cada uno (Prioridad: P1)

La persona abre `/planes` (desde cualquier «Ver el plan completo», desde la barra lateral web o a mano) y ve dos recuadros: **Gratis** (MX$0) y **Plan completo** (MX$499 al año), cada uno con lo que incluye, marcando «Tu plan actual». Debajo, que lo registrado se conserva, que sus datos de salud no se venden, y «Próximamente».

**Por qué esta prioridad**: hoy «Ver planes» cae en un aviso «Estamos preparando los planes»; es la puerta de todo el plan de pago.

**Prueba Independiente**: con una cuenta gratuita, `/planes` muestra los dos recuadros con «Tu plan actual» en Gratis y el botón «Contratar plan completo» deshabilitado con «Pronto»; con una cuenta de pago, «Tu plan actual» está en Plan completo y no hay botón de contratar.

**Escenarios de Aceptación**:

1. **Dado** una cuenta gratuita, **Entonces** Gratis lleva «Tu plan actual» y Plan completo muestra «Contratar plan completo · PRONTO» (`aria-disabled`, sin acción) con «El pago con tarjeta todavía no está disponible. Mientras tanto, tu plan sigue igual.».
2. **Dado** una cuenta de pago, **Entonces** Plan completo lleva «Tu plan actual» y no tiene botón de contratar.
3. **Dado** una persona invitada a una familia de pago (su propia cuenta gratuita), **Entonces** Plan completo lleva «Tu plan actual» y dice «Incluido por la familia de Ana. No pagas nada: lo cubre su suscripción.», sin botón.
4. **Dado** una persona invitada cuya familia dejó de pagar (solo lectura), **Entonces** Gratis lleva «Tu plan actual».
5. **Dado** el diseño web (≥ 900 px), **Entonces** Gratis va a la izquierda y Plan completo a la derecha dentro de la barra lateral; en móvil el Plan completo va primero, apilados, con el encabezado oscuro.
6. **Dado** cualquier estado, **Entonces** aparecen «Lo registrado se conserva» y «Tus datos», y «Próximamente» como bloque aparte de borde punteado, con «No están incluidas hoy en ningún plan.».
7. **Dado** cualquier texto de la pantalla, **Entonces** no hay descuentos, equivalente mensual, urgencia ni consejos de salud (Principio I).

---

### Historia de Usuario 2 - El modal de límite con comparación (Prioridad: P1)

Al topar con un límite del plan gratuito (segundo hijo, tratamiento activo, «solo registro», búsqueda en el historial, compartir, suplementos, próxima cita) se abre **un solo modal** con la misma estructura: franja `ink` con «Plan completo», título del motivo, qué se intentó, la comparación «Ahora tienes / Con el plan completo» de tres filas con la del motivo resaltada, el precio y las dos acciones.

**Prueba Independiente**: con una cuenta gratuita con un hijo, «Agregar hijo» abre el modal «Tu plan incluye un hijo» con «Hijos · 1 → Hasta 10» resaltada; «Ahora no» lo cierra y devuelve el foco; «Ver el plan completo» va a `/planes`.

**Escenarios de Aceptación**:

1. **Dado** cada uno de los siete motivos, **Entonces** el modal muestra su título, su línea, sus tres filas con la del motivo resaltada (fondo `hint`, borde de 2 px, «· lo que intentaste») y la tabla accesible (`role=table`, encabezados de fila y de columna).
2. **Dado** el modal abierto, **Entonces** el precio dice «MX$499 al año · una suscripción para toda la familia» y «Lo que ya registraste se queda igual con cualquier plan.».
3. **Dado** el modal abierto, **Entonces** el foco inicial está en «Ahora no» (no en la acción sólida), Tab no sale, Escape, la X de 44 px y el fondo lo cierran y el foco vuelve a quien lo abrió.
4. **Dado** el teléfono, **Entonces** es una hoja desde abajo con las acciones apiladas (la sólida arriba); **dado** la web, **Entonces** es un diálogo centrado con las acciones a la derecha.
5. **Dado** el modal, **Entonces** no usa ámbar ni rojo: la franja es `ink`, el overline `bright`, y el sólido `confirmed` es «Ver el plan completo» (un enlace a `/planes`).

---

### Historia de Usuario 3 - Aviso compacto dentro de las pantallas (Prioridad: P2)

Los bloques «Plan completo» de **Suplementos** (detalle del hijo), **Mis suplementos** y **Familia** pasan a un mismo aviso compacto: overline, título, una frase, «MX$499 al año · para toda la familia» y el enlace «Ver el plan completo →».

**Escenarios de Aceptación**:

1. **Dado** una cuenta gratuita sin rutinas en Suplementos, Mis suplementos o la pantalla de Familia, **Entonces** se ve el aviso compacto con su texto propio y el enlace a `/planes` (ya no hay botón de contorno ni sólido que abra un modal).
2. **Dado** el aviso, **Entonces** no tiene botón sólido (la pantalla ya puede tener uno).

---

### Historia de Usuario 4 - Acceso fijo a «Planes» en la web (Prioridad: P3)

La barra lateral web tiene «Planes» en el pie, debajo de la cuenta, activo en `/planes`.

## Requisitos *(obligatorio)*

- **FR-001**: `/planes` DEBE mostrar los dos recuadros con las listas del diseño, el precio **MX$499 al año** y el plan actual de la persona (propio, o el de la familia de la que es integrante).
- **FR-002**: El botón «Contratar plan completo» DEBE estar en estado «Pronto» (deshabilitado, sin acción) mientras no exista el cobro; el cambio a activo es un solo lugar (una constante).
- **FR-003**: Ninguna pantalla DEBE decir que se perderá o se ocultará algo registrado; DEBE decir que se conserva (Principio IV).
- **FR-004**: Ningún texto DEBE sugerir, evaluar ni prometer salud (Principio I), ni mostrar descuentos, equivalentes mensuales, urgencia o anuncios; sí «Tus datos de salud no se venden ni se usan para anuncios.» (Principio II).
- **FR-005**: El modal de límite DEBE conservar sus props (`reason`, `onViewPlans`, `onStayFree`, `opener`) para que cada pantalla que lo abre siga igual, y DEBE ser un diálogo real (portal, foco, trampa de Tab, Escape).
- **FR-006**: Web y móvil son dos diseños separados (`useIsDesktop`), nunca mezclados.
- **FR-007**: Sin cambios de API ni de base de datos: el plan sigue dándose a mano (`UPDATE accounts SET plan`).

## Fuera de alcance (anotado en `BACKLOG.md`)

- El **cobro con Mercado Pago**, el webhook, la tabla de suscripciones y el aviso de privacidad y términos.
- El estado **«plan vencido»** (P4) y las **pantallas de estado de pago** (E1–E3: «Pago en proceso», «Plan activo», «No se pudo cobrar»), y «Vigente hasta el…»: necesitan la suscripción en el backend. Los textos y el diseño ya están en `referencia/planes-decisiones.md`.
- El **bloque de aviso en el Historial** (A2): la lista del plan gratuito sigue con su entrada marcada «Plan completo» que abre el modal (spec 031).

## Supuestos

- **Una sola constante de precio** (`PLAN_PRICE`, MX$499 al año) en el frontend, usada por la pantalla, el modal y el aviso; si cambia, cambia en un lugar.
- Las preguntas abiertas del diseño se resuelven así hasta que el dueño decida otra cosa: «Próximamente» se queda con las cinco ideas; sin equivalente mensual; mientras no exista el cobro se publica P2 («Pronto»); el orden de tarjetas es el del diseño (web Gratis primero, móvil Plan completo primero); una persona invitada cuya familia deja de pagar ve «Gratis · Tu plan actual».
- «Ver el plan completo» del modal es un enlace (`<a href="/planes">`) cuyo clic llama al `onViewPlans` del que lo abrió (navegación de la app).
