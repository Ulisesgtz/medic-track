# Planes y plan completo — decisiones y desviaciones (de Claude Design)

Copia de `repo-pr/specs/005-identidad-visual-front-end/planes-decisiones.md` del proyecto de Claude Design
(`https://claude.ai/design/p/f4e28757-d885-471d-b5b9-6e6ca094449a`), 2026-10-07. Mock: `Planes PediTrack.dc.html` (+ `PlanTarjeta`, `LimiteModal`,
`PlanAvisoCompacto`; se vuelven a bajar con `DesignSync get_file`). Ids del tablero: P = /planes, M = modal por motivo, A = aviso compacto, E = estado del pago.
Cada punto queda **pendiente de aprobación**.

## A. Tokens

Sin tokens nuevos: `ink`, `ink-soft`, `action`, `bright`, `confirmed`, `canvas`, `surface`, `hint`, `hint-border`, `hint-edge`, `bright-soft`, `body`, `ink-muted`,
`ink-edge`; Tailwind `slate-100/300/600` y `emerald-800`. Fondo de diálogo `bg-ink/70`. **No se usa ámbar ni rojo en ninguna pantalla de esta entrega.**

## B. Desviaciones y tratamientos nuevos

1. **Franja del modal de límite: de ámbar a `ink`**, con el overline «Plan completo» en `bright` y el título en blanco (el ámbar significa «por marcar» y en el modal se leía como alerta). **Actualiza `design-tokens.md` (Modal).**
2. **Un solo modal para los siete motivos (`LimiteModal`)**: título, qué se intentó, comparación «Ahora tienes / Con el plan completo» de tres filas, precio; «Ahora no» (contorno) y «Ver el plan completo» (sólido `confirmed`, enlace a `/planes`).
3. **La fila del motivo se resalta** (fondo `hint`, borde de 2 px `hint-border`, «· lo que intentaste»); la comparación es `role=table` con encabezados de fila y de columna.
4. **El foco inicial va en «Ahora no»**; Escape, la X de 44 px y el fondo cierran y devuelven el foco.
5. **«Entendido» → «Ahora no».**
6. **En móvil, hoja desde abajo** separada 12 px de los bordes, acciones apiladas con el sólido arriba.
7. **Orden de las tarjetas**: web, Gratis a la izquierda; móvil, Plan completo primero. *No coinciden; elegir uno.*
8. **«Tu plan actual»**: chip `hint` y borde de 2 px `ink`; sin sombra ni tamaño especial para «destacar» el de pago.
9. **Estado «Pronto» (P2)**: fondo `slate-100`, borde punteado `slate-300`, texto `slate-600`, `aria-disabled`, etiqueta «PRONTO»; debajo «El pago con tarjeta todavía no está disponible. Mientras tanto, tu plan sigue igual.».
10. **Sin precio mensual equivalente, descuentos ni urgencia.** «MX$499 al año» y, en modal y aviso compacto, «· una suscripción para toda la familia».
11. **«Próximamente» se queda, fuera de los recuadros**: borde punteado `slate-300`, viñetas «·», sin fecha, «No están incluidas hoy en ningún plan.».
12. **Lo registrado se conserva y la privacidad** en un bloque blanco debajo de las tarjetas; el modal dice «Lo que ya registraste se queda igual con cualquier plan.».
13. **Aviso compacto (`PlanAvisoCompacto`)** para Suplementos, Historial y Familia: bloque `hint` con overline, título, frase, «MX$499 al año · para toda la familia» y «Ver el plan completo →».
14. **«Planes» en la barra lateral web**, en el pie bajo la cuenta.
15. **Estados de pago (E1–E3)**: tarjeta de una columna con chip neutro; «Pago en proceso» sin botón sólido; «No se pudo cobrar» muestra la respuesta de Mercado Pago tal cual.
16. **Persona invitada (P5)**: «Tu plan actual» en Plan completo, «Incluido por la familia de Ana. No pagas nada: lo cubre su suscripción.», sin botón.

## C. Textos finales

**Encabezado de /planes:** «Un plan gratuito y un plan completo anual. Una suscripción cubre a toda la familia.»

**Gratis · MX$0 siempre**: 1 hijo · Una consulta con tratamiento activo a la vez (al terminar o finalizarlo, registras la siguiente) · Registrar consultas con foto de la receta, medicamentos y horario, con lectura de la receta en tu teléfono · Síntomas por chips y notas · Marcar las tomas, con el calendario y la barra de progreso del tratamiento · Recordatorios push de las tomas del tratamiento activo · Todo lo que registres siempre lo puedes ver (nunca se oculta ni se borra) · Si te invita una familia de pago, ves y marcas tomas.

**Plan completo · MX$499 al año · «Todo lo de Gratis, más:»**: Hasta 10 hijos · Varias consultas con tratamiento activo a la vez · Consultas anteriores «solo registro» (sin horarios ni avisos) · Historial con búsqueda y filtros (doctor, medicamento, síntomas, fechas) · Compartir con tu familia: hasta 4 personas (Tutores y Cuidadores), cada una con sus avisos y «por Ana, 08:05» en cada toma marcada · Rutinas de suplementos de tus hijos y las tuyas, con tomas marcables y avisos (hasta 10 activas por hijo y 10 propias) · Próxima cita con avisos editables (por omisión un día y dos horas antes) para toda la familia · Una suscripción por familia: quienes invitas quedan incluidos.

**Botón y notas:** con cobro [Contratar plan completo] · «Pago anual con tarjeta, a través de Mercado Pago.»; Pronto: [Contratar plan completo · PRONTO]; vigente: «Vigente hasta el 7 oct 2027.»; vencido: «Tu plan completo terminó el 30 sep 2026. Todo lo registrado sigue aquí y las tomas se siguen marcando.» · [Renovar plan completo]; invitada: «Incluido por la familia de Ana. No pagas nada: lo cubre su suscripción.».

**Bloques fijos:** «Lo registrado se conserva» / «Si el plan completo no se renueva, todo lo que registraste se sigue viendo y las tomas se siguen marcando. Solo deja de poder agregarse lo del plan completo.» · «Tus datos» / «Tus datos de salud no se venden ni se usan para anuncios.» · «Próximamente» / «Ideas en las que trabajamos, sin fecha. No están incluidas hoy en ningún plan.» + Exportar el historial a PDF para el pediatra · Liga de solo lectura para el pediatra · Curvas de crecimiento OMS · Cartilla de vacunas · Resumen semanal por correo.

**Modal (común):** overline «Plan completo» · columnas «Ahora tienes» / «Con el plan completo» · «MX$499 al año · una suscripción para toda la familia» · «Lo que ya registraste se queda igual con cualquier plan.» · [Ahora no] [Ver el plan completo]

| Motivo | Título | Línea | Filas (la primera es la resaltada) |
|---|---|---|---|
| M1 Segundo hijo | Tu plan incluye un hijo | Intentaste agregar a otro hijo. El plan gratuito incluye uno. | Hijos 1 → Hasta 10 · Familia Solo tú → Hasta 4 personas · Tratamientos activos Uno a la vez → Varios a la vez |
| M2 Tratamiento activo | Ya hay un tratamiento activo | Intentaste registrar una consulta con tratamiento mientras otro sigue activo. En el plan gratuito, al terminar o finalizar el actual registras el siguiente. | Tratamientos activos Uno a la vez → Varios a la vez · Consultas «solo registro» No incluido → Sin horarios ni avisos · Hijos 1 → Hasta 10 |
| M3 Solo registro | Consultas «solo registro» | Intentaste guardar una consulta anterior sin horarios ni avisos. Esa opción es del plan completo. | Consultas anteriores «solo registro» No incluido → Sin horarios ni avisos · Historial Se ve completo → Con búsqueda y filtros · Tratamientos activos Uno a la vez → Varios a la vez |
| M4 Búsqueda | Búsqueda en el historial | Intentaste buscar o filtrar consultas. Tu historial se sigue viendo completo; la búsqueda y los filtros son del plan completo. | Historial Se ve completo → Con búsqueda y filtros por doctor, medicamento, síntomas y fechas · Consultas «solo registro» No incluido → Sin horarios ni avisos · Hijos 1 → Hasta 10 |
| M5 Familia | Compartir con tu familia | Intentaste invitar a alguien. Con el plan completo, hasta 4 personas ven y marcan las tomas, cada una con sus avisos. | Personas en la familia Solo tú → Hasta 4, Tutores y Cuidadores · Quién marcó cada toma No incluido → «por Ana, 08:05» · Suscripción No incluido → Una para toda la familia |
| M6 Suplementos | Rutinas de suplemento | Intentaste crear una rutina de suplemento. Las rutinas, de tus hijos y las tuyas, son del plan completo. | Rutinas de suplemento No incluido → Hasta 10 activas por hijo y 10 tuyas · Avisos Tomas del tratamiento activo → También de rutinas y citas · Familia Solo tú → Hasta 4 personas |
| M7 Próxima cita | Próxima cita | Intentaste anotar la próxima cita. Las citas con avisos son del plan completo. | Próxima cita No incluido → Con avisos editables · Quién recibe el aviso No incluido → Cada persona de la familia, si lo activa · Familia Solo tú → Hasta 4 personas |

**Aviso compacto:** Suplementos «Rutinas de suplemento» / «Registra lo que Mateo toma de forma regular, con su horario. Cada toma se marca como las de medicamento, con avisos para la familia.» · Historial «Búsqueda y filtros» / «Busca por doctor, medicamento, síntomas o fechas. Tu historial se sigue viendo completo.» · Familia «Compartir con tu familia» / «Hasta 4 personas ven y marcan las tomas, cada una con sus avisos. Quienes invitas quedan incluidos en tu suscripción.» · Pie común «MX$499 al año · para toda la familia» · «Ver el plan completo →».

**Estados de pago (fuera de esta entrega):** En proceso «Pago en proceso» / «Mercado Pago está confirmando el cobro. Puede tardar unos minutos. Mientras tanto, PediTrack funciona como siempre.» · [Ir al inicio]; Activo «Tu plan completo está activo» / «Vigente hasta el 7 oct 2027. Las personas que invites a tu familia quedan incluidas.» · [Ir al inicio] [Invitar a tu familia]; Sin cobro «No se pudo cobrar» / «Mercado Pago no completó el cobro con esa tarjeta. Tu plan sigue como estaba y todo lo registrado se conserva.» · [Intentar de nuevo] [Volver a planes].

## D. Preguntas abiertas y cómo se resolvieron (el dueño puede cambiarlas)

1. «Próximamente»: **se queda con las cinco ideas.**
2. Equivalente mensual: **no se muestra.**
3. Mientras no exista el cobro: **se publica P2 («Pronto», deshabilitado).**
4. Renovación automática: **sin decidir**; no se muestran fechas de vigencia (no hay suscripción en el backend).
5. Aviso de plan por vencer: **no se dibuja ni se construye.**
6. Orden de las tarjetas: **el del diseño** (web Gratis primero, móvil Plan completo primero).
7. Familia que deja de pagar: la persona invitada ve **«Gratis · Tu plan actual»**.
8. Facturación (CFDI): **fuera de esta entrega**, con el cobro.
