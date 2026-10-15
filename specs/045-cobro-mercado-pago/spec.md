# Especificación de Funcionalidad: Cobro del plan completo con Mercado Pago

**Rama de la Funcionalidad**: `feature/045-cobro-mercado-pago`

**Creado**: 2026-10-15

**Estado**: Borrador

**Entrada**: Descripción del usuario: «Cobro del plan completo con Mercado Pago (spec 045). Hoy el plan completo (MX$499 al año, una suscripción para toda la familia) no se puede pagar…» (decisiones del dueño del producto del 2026-10-15; ver «Supuestos»).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - La dueña de la cuenta paga el plan completo desde la app (Prioridad: P1)

Hoy la pantalla de planes (`/planes`, spec 034) dice «Contratar plan completo · PRONTO» y el plan de una cuenta se cambia a mano. La persona dueña de la cuenta quiere pagar el plan completo (MX$499 al año, una suscripción para toda su familia) con su tarjeta, sin salir de PediTrack más de lo necesario, y que su plan cambie solo.

**Por qué esta prioridad**: es el cobro; sin esto no hay plan de pago real y todo lo del plan completo (más hijos, historial, familia, suplementos, citas) depende de que alguien lo active a mano.

**Prueba Independiente**: con una cuenta gratuita y las credenciales de **prueba** del proveedor, tocar «Contratar plan completo», pagar con una tarjeta de prueba, volver a la app y ver «Plan completo» como plan actual, con todo lo del plan completo disponible.

**Escenarios de Aceptación**:

1. **Dado** una cuenta gratuita que es **dueña** de su cuenta, **cuando** toca «Contratar plan completo» en `/planes`, **entonces** pasa a pagar con el proveedor (la tarjeta se captura en el proveedor, nunca en PediTrack) y al terminar vuelve a una pantalla de la app que le dice que está confirmando su pago.
2. **Dado** un pago aprobado por el proveedor, **cuando** PediTrack recibe el aviso del pago, **entonces** la cuenta pasa a plan completo y `/planes` dice «Tu plan actual: Plan completo» con la fecha hasta la que está vigente, sin que la persona tenga que hacer nada más.
3. **Dado** una persona que **pertenece como invitada** (Tutor, Cuidador o Hijo) a la familia de **otra** cuenta cuyo plan completo está **vigente**, **cuando** abre `/planes`, **entonces** no se le ofrece contratar: ve que su plan es el de esa familia («Incluido por la familia de Ana») y no hay botón de pagar. Mientras siga siendo invitada de una familia con plan vigente, **nadie** —ni ella ni el servidor— le permite suscribirse por su cuenta.
4. **Dado** una cuenta que ya tiene el plan completo vigente, **cuando** abre `/planes`, **entonces** no se le ofrece pagar otra vez (no se puede contratar dos veces).
5. **Dado** una persona invitada cuya familia **ya no tiene el plan completo vigente** (la suscripción de la titular terminó o venció su gracia), **cuando** abre `/planes`, **entonces** vuelve a ver los dos planes y **puede contratar el plan completo para su propia cuenta**, igual que cualquier otra persona dueña de su cuenta.
6. **Dado** que el cobro no está configurado en ese entorno, **cuando** se abre `/planes`, **entonces** el botón sigue en estado «Pronto» y todo funciona como hoy (el plan se da a mano).

---

### Historia de Usuario 2 - El plan sigue a la suscripción: renovación, falla de cobro y vencimiento (Prioridad: P1)

La suscripción se cobra sola cada año. El plan de la cuenta debe seguir lo que pase con ese cobro: renovarse, esperar un tiempo razonable si un cobro falla, y volver al plan gratuito si ya no hay pago, **sin borrar ni ocultar nada de lo que la familia ya registró**.

**Por qué esta prioridad**: un plan que no se renueva solo o que se pierde por un cobro fallido sin aviso rompe la confianza; y quitarle datos a una familia sería contra los principios del producto.

**Prueba Independiente**: con un proveedor falso (de pruebas), simular una renovación exitosa, un cobro rechazado y un vencimiento, y comprobar el plan de la cuenta y que los datos siguen todos visibles.

**Escenarios de Aceptación**:

1. **Dado** una suscripción vigente, **cuando** el proveedor avisa que el cobro anual se realizó, **entonces** la vigencia se extiende un año y el plan sigue siendo completo.
2. **Dado** un cobro de renovación rechazado, **cuando** el proveedor avisa el rechazo, **entonces** el plan completo **no se quita de inmediato**: hay un periodo de gracia de 7 días en el que sigue activo y la dueña ve un aviso neutral de que su cobro no se pudo realizar y cómo actualizar su tarjeta.
3. **Dado** que el periodo de gracia terminó sin pago, o que la suscripción terminó, **cuando** se evalúa el plan, **entonces** la cuenta vuelve al plan gratuito: **lo ya registrado se conserva y se sigue viendo** y las reglas del plan gratuito solo impiden **crear** lo que el plan gratuito no incluye (como en las specs 030, 031, 032 y 033); la familia invitada queda en solo lectura pero **sigue pudiendo marcar tomas**.
4. **Dado** el mismo aviso del proveedor recibido dos veces (o fuera de orden), **cuando** PediTrack lo procesa, **entonces** el resultado es el mismo que si se hubiera recibido una vez (no se extiende dos veces ni se cambia a un estado anterior).
5. **Dado** un aviso del proveedor que no se puede verificar como auténtico, **cuando** llega, **entonces** se ignora y no cambia ningún plan.

---

### Historia de Usuario 3 - Ver la vigencia y cancelar, conservando lo ya pagado (Prioridad: P2)

La dueña quiere ver hasta cuándo está pagado su plan y poder cancelar la renovación sin perder lo que ya pagó.

**Por qué esta prioridad**: da control y confianza (nada de trampas), pero el cobro funciona sin esto, y se puede cancelar desde el propio proveedor mientras tanto.

**Prueba Independiente**: con una suscripción vigente, cancelar desde la app y comprobar que el plan sigue completo hasta la fecha de vigencia y que después vuelve a gratuito sin más cobros.

**Escenarios de Aceptación**:

1. **Dado** una suscripción vigente, **cuando** la dueña abre `/planes`, **entonces** ve «Vigente hasta <fecha>» y si se renovará.
2. **Dado** una suscripción vigente, **cuando** la dueña toca «Cancelar renovación» y confirma (en palabras neutras, sin culpa ni presión), **entonces** no se le vuelve a cobrar, su plan **se conserva hasta el fin del periodo ya pagado** y la pantalla dice «No se renovará; tu plan sigue hasta <fecha>».
3. **Dado** una suscripción cancelada desde el panel del proveedor, **cuando** el proveedor avisa, **entonces** la app lo refleja igual que en el escenario anterior.
4. **Dado** una suscripción cancelada con vigencia por delante, **cuando** la dueña quiere volver a suscribirse, **entonces** puede contratar de nuevo y no pierde los días que ya tenía.

---

### Historia de Usuario 4 - Estados del pago claros y neutrales (Prioridad: P2)

Tras pagar, la confirmación puede tardar o fallar. La persona nunca debe quedarse sin saber qué pasó, ni sentirse presionada.

**Por qué esta prioridad**: evita cobros dobles por confusión y llamadas de soporte, y cumple lo pendiente de la spec 034 (estados de pago y plan vencido).

**Prueba Independiente**: recorrer cada estado (confirmando, aprobado, rechazado, cancelado antes de pagar, en gracia, vencido) y comprobar que el texto es claro, neutral y ofrece una salida.

**Escenarios de Aceptación**:

1. **Dado** que la persona volvió del proveedor y el aviso aún no llegó, **cuando** mira la pantalla de regreso, **entonces** dice que está confirmando el pago, se actualiza sola en cuanto llega y **no** la invita a pagar otra vez.
2. **Dado** que el pago fue rechazado o la persona lo canceló antes de terminar, **entonces** ve un mensaje neutral («No se realizó ningún cobro») y puede intentarlo de nuevo cuando quiera.
3. **Dado** un plan vencido, **entonces** la pantalla lo dice sin urgencia («Tu plan completo terminó el <fecha>. Lo que registraste sigue ahí.») y ofrece contratar de nuevo.
4. **Dado** cualquier estado, **entonces** nunca hay descuentos, cuentas regresivas, advertencias de «pierdes tus datos» ni lenguaje que presione; el texto describe lo que pasa con el plan y no da consejos sobre la salud de un hijo.

---

### Historia de Usuario 5 - Entornos de prueba y vigilancia (Prioridad: P3)

Quien opera el servicio necesita probar todo el cobro sin cobrar de verdad, y enterarse si algo falla en el flujo de pagos.

**Por qué esta prioridad**: protege el primer cobro real, pero no cambia lo que ve la persona.

**Prueba Independiente**: en DEV, con tarjetas y usuarios de prueba del proveedor, completar un cobro y una cancelación; provocar un aviso inválido y ver el registro de la falla.

**Escenarios de Aceptación**:

1. **Dado** un entorno con credenciales de **prueba**, **cuando** se paga con una tarjeta de prueba, **entonces** el cobro es de mentira y todo el flujo se puede probar de punta a punta.
2. **Dado** que falla el procesamiento de un aviso o la conciliación con el proveedor, **cuando** ocurre, **entonces** queda registrado como falla de proceso de pagos (sin tarjetas, tokens ni datos personales) y llega al resumen semanal de errores del operador.
3. **Dado** que faltan las credenciales del proveedor, **entonces** el cobro queda «no disponible» y el resto de la app funciona igual.

---

### Casos Límite

- La persona cierra la ventana del proveedor a media operación: no se cobra nada y la cuenta no cambia.
- La persona paga y el aviso del proveedor tarda minutos o horas: la pantalla sigue en «confirmando» sin dejar pagar de nuevo; si ya hay una suscripción en curso para esa cuenta, no se crea otra.
- Dos intentos de pago a la vez (dos pestañas, dos dispositivos): como máximo una suscripción vigente por cuenta.
- Una cuenta con el plan completo dado **a mano** (quien prueba la app): sigue como está y no se ve afectada por avisos del proveedor, hasta que se cambie a mano.
- La titular **cancela la renovación** pero su plan sigue vigente hasta el fin del periodo ya pagado: durante ese tiempo la familia sigue teniendo plan completo, así que sus invitadas **todavía no** pueden contratar por su cuenta; pueden hacerlo cuando ese periodo (y su gracia, si hubiera) termine.
- Una persona invitada contrata por su cuenta **después** de que la familia dejó de tener plan y luego la titular **vuelve a contratar**: la persona conserva su propia suscripción (no se cancela sola) y no se le cobra ni se le cambia nada por eso; es la persona quien decide si la sigue o la cancela.
- Una persona que ya tiene su propia suscripción vigente y **acepta una invitación** a la familia de otra cuenta con plan vigente: su suscripción sigue su curso (no se cancela sola ni se reembolsa) y se le muestra con palabras neutras que ya tiene cobertura de la familia, para que decida si cancelar su renovación.
- La dueña cambia de correo o de nombre en su cuenta: no afecta la suscripción.
- Una cuenta que es dueña de una familia con invitadas: al vencer el plan, las invitadas quedan en solo lectura (con permiso de marcar tomas) y se les dice con las palabras neutras de la spec 032.
- El proveedor avisa de una suscripción que PediTrack no conoce: se ignora y se registra la falla, sin cambiar planes.
- Pago con una tarjeta que el proveedor rechaza, tarjeta vencida o sin fondos: el padre ve el mensaje neutral y puede reintentar; PediTrack nunca ve el motivo detallado ni los datos de la tarjeta.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El sistema DEBE permitir a la **persona dueña de la cuenta** contratar el plan completo (MX$499 al año, una suscripción para toda su familia) pagando con tarjeta mediante Mercado Pago, con cobro automático cada año hasta que se cancele.
- **FR-002**: Los datos de la tarjeta DEBEN capturarse y procesarse **únicamente** en Mercado Pago: PediTrack nunca los recibe, ni los guarda, ni los registra.
- **FR-003**: Solo la **cuenta dueña de su propia cuenta** puede contratar o cancelar su suscripción. Una persona que pertenece como **invitada** (Tutor, Cuidador o Hijo) a la familia de **otra** cuenta con plan completo **vigente** NO ve la opción de pagar (se le dice a quién pertenece el plan) y el servidor **rechaza** cualquier intento suyo de suscribirse mientras esa familia siga vigente.
- **FR-003b**: En cuanto la familia de la que es invitada **deja de tener el plan completo vigente** (la suscripción de la titular terminó, o venció su periodo de gracia), esa persona vuelve a ver los planes y **puede contratar** para su propia cuenta, sin ningún otro trámite. Esto se evalúa en cada consulta (no se guarda ni se «libera» a mano), igual que el nivel de acceso de la spec 032.
- **FR-004**: El sistema DEBE enterarse del resultado de cada pago, renovación, rechazo y cancelación por el aviso que envía el proveedor, **verificar que el aviso es auténtico** antes de usarlo y procesarlo de forma **idempotente** (mismo aviso repetido o fuera de orden, mismo resultado).
- **FR-005**: El plan de la cuenta DEBE derivarse del estado de su suscripción: completo mientras la suscripción esté vigente o en su periodo de gracia; gratuito cuando ya no.
- **FR-006**: Un cobro de renovación rechazado DEBE dejar el plan completo activo durante un **periodo de gracia de 7 días** y mostrar a la dueña un aviso neutral con una salida para actualizar su tarjeta.
- **FR-007**: Al terminar la suscripción o la gracia, la cuenta DEBE volver al plan gratuito **sin borrar, ocultar ni modificar nada de lo ya registrado**; las reglas del plan gratuito solo limitan crear lo que no incluye. Las personas invitadas quedan en solo lectura y **siguen pudiendo marcar tomas**.
- **FR-008**: La dueña DEBE poder **cancelar la renovación** (desde la app o desde el proveedor) conservando el plan hasta el fin del periodo ya pagado; la cancelación se confirma con texto neutral y no puede deshacerse de forma que cobre sin su consentimiento.
- **FR-009**: `/planes` DEBE mostrar el plan actual, **«Vigente hasta <fecha>»**, si se renovará, y los estados de pago (confirmando, rechazado o cancelado antes de pagar, en gracia, vencido), todos en palabras **neutrales**: sin urgencia, sin descuentos, sin cuentas regresivas, sin presión y sin consejos de salud.
- **FR-010**: El botón de contratar DEBE seguir en el estado «Pronto» (y todo funcionar como hoy, con el plan dado a mano) **mientras el cobro no esté configurado** en ese entorno.
- **FR-011**: Una cuenta NO DEBE poder tener más de una suscripción vigente ni contratar mientras ya tiene el plan completo vigente, ni —si es invitada— mientras la familia de otra cuenta le da el plan completo vigente (FR-003).
- **FR-012**: Las cuentas con plan completo **dado a mano** DEBEN conservarse tal cual y no verse afectadas por avisos del proveedor.
- **FR-013**: Las fallas al procesar avisos del proveedor o al conciliar con él DEBEN registrarse como fallas de proceso de pagos, con mensajes fijos y **sin** tarjetas, tokens, correos ni datos personales, y aparecer en el resumen semanal de errores del operador.
- **FR-014**: El aviso de privacidad y los términos DEBEN decir qué recibe el proveedor (lo del pago y la identificación de la cuenta pagadora; **nunca** datos de salud ni de los hijos), cómo se cancela y cómo se piden reembolsos, en palabras neutras. La versión del aviso «Antes de empezar» solo sube si cambia su texto.
- **FR-015**: Las credenciales de prueba y las reales DEBEN estar separadas por entorno; las reales viven solo en la configuración del servidor y nunca en el repositorio, la documentación ni el chat.
- **FR-016**: Los medios de pago ofrecidos son **solo tarjeta**, un solo pago al año; NO se ofrecen meses sin intereses, SPEI ni efectivo.
- **FR-017**: Nada del flujo DEBE interpretar, aconsejar ni opinar sobre datos de salud (Principio I); el plan es un cobro por el servicio de registro.

### Entidades Clave *(incluir si la funcionalidad involucra datos)*

- **Suscripción**: pertenece a **una cuenta dueña**; tiene un estado (en confirmación, vigente, en gracia, cancelada con vigencia por delante, terminada), la fecha hasta la que está pagada, la fecha de la próxima renovación (si la hay), y el identificador que le da el proveedor. No guarda datos de tarjeta.
- **Evento de pago**: registro de cada aviso del proveedor ya procesado (para que repetirlo no cambie nada) con su identificador, su tipo y cuándo se procesó; sin datos personales.
- **Plan de la cuenta**: sigue siendo gratuito o completo; deja de ser solo un valor que se cambia a mano y pasa a derivarse de la suscripción (salvo las cuentas con plan dado a mano).

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Una persona dueña con tarjeta de prueba completa el pago y ve su plan completo activo, sin intervención del operador, en **menos de 3 minutos** (y, una vez que el proveedor avisa, en menos de 1 minuto).
- **SC-002**: El **100 %** de los avisos repetidos o fuera de orden producen el mismo plan que si se hubieran recibido una vez; el **100 %** de los avisos no auténticos se ignoran sin cambiar ningún plan.
- **SC-003**: Ninguna cuenta pierde, ve oculto ni se le modifica un solo registro (consultas, fotos, tomas, citas, suplementos) por vencer o cancelar su plan; las personas invitadas en solo lectura **siguen marcando tomas** en el 100 % de los casos probados.
- **SC-004**: Ningún dato de tarjeta aparece en los registros, la base de datos ni los mensajes de error del servicio (verificado por pruebas y revisión).
- **SC-005**: En todos los estados del pago, la pantalla dice qué pasó y qué sigue en una o dos frases, y no contiene lenguaje de urgencia, descuento ni consejo de salud (verificado por una prueba de texto).
- **SC-006**: Un mismo intento no genera **dos cobros**: con dos pestañas o un reintento, la cuenta tiene como máximo **una** suscripción vigente.
- **SC-007**: El cobro completo (pagar, renovar, rechazar, cancelar, vencer) se puede probar de punta a punta en DEV con tarjetas de prueba, sin cobrar dinero real.

## Supuestos

- **Proveedor y plan**: Mercado Pago, con su producto de **suscripciones**; ya existe un plan anual en su panel («Peditrack», MX$499, frecuencia anual, duración ilimitada, sin prueba gratis). La comisión es 3.49 % + $4.64 con IVA (≈ $474.15 netos de $499), según su simulador (2026-10-15); no confirmada para suscripciones.
- **Cuenta del proveedor**: es la cuenta personal del dueño del producto; el nombre del negocio y el nombre en estados de cuenta se quedan con su nombre. **Antes del primer cobro real**, con un contador: RFC/actividad empresarial, facturación y nombre legal. Son pasos del dueño, no de este código, pero bloquean el lanzamiento real. Cambiar la cuenta cobradora después obligaría a volver a crear el plan y a que cada familia se suscriba otra vez.
- **Quién paga**: la cuenta dueña; una suscripción cubre a toda su familia (hasta lo que ya define la spec 032). Una persona invitada a la familia de otra cuenta con plan vigente **no puede** contratar su propio plan mientras tanto (decisión del dueño, 2026-10-15); cuando esa familia deje de tener plan vigente, cualquier integrante puede contratar. «Deja de tener plan vigente» = la suscripción de la titular terminó (o venció su gracia); si solo canceló la renovación pero sigue vigente, **todavía cuenta como plan vigente**.
- **Periodo de gracia**: 7 días tras un cobro de renovación rechazado (valor por omisión razonable; se puede ajustar).
- **Reembolsos**: no hay reembolso automático desde la app; se piden por correo al operador y se hacen desde el panel del proveedor. Las palabras de los términos las define el dueño antes del lanzamiento.
- **Dar el plan a mano** sigue existiendo (quien prueba la app, soporte); esas cuentas no cambian con los avisos del proveedor.
- **Pantalla de regreso**: tras pagar, el proveedor devuelve a la persona a una página de PediTrack que consulta el estado y se actualiza sola; el plan solo cambia cuando el aviso (verificado) llega, nunca por lo que diga la dirección de regreso.
- **Moneda**: pesos mexicanos; un solo precio (el de la spec 034); sin descuentos, cupones, prueba gratis ni planes mensuales.
- **Datos que recibe el proveedor**: lo necesario para cobrar y ligar el pago a la cuenta (un identificador y el correo de la cuenta pagadora); **nada** de salud ni de los hijos.
- **Fuera de alcance**: Openpay y cambiar de proveedor; SPEI, efectivo y meses sin intereses; facturación electrónica (CFDI); cupones y descuentos; planes mensuales o por hijo; reembolsos automáticos desde la app; app nativa (compras dentro de la tienda de Apple/Google: no aplica a una PWA).
