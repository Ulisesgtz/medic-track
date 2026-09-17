# Especificación de Funcionalidad: Home Page — Listado de Hijos

**Rama de la Funcionalidad**: `003-home-listado-hijos`

**Creado**: 2026-09-16

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Página de inicio ('home') del padre/tutor después de crear o volver a su cuenta. Muestra el listado de sus hijos dados de alta, cada uno como una tarjeta con nombre y edad calculada a partir de su fecha de nacimiento (sin datos de consultas médicas todavía, esa parte es una feature futura separada). Desde esta pantalla el padre puede agregar un nuevo hijo usando el flujo freemium ya existente (límite de 1 hijo gratis, pop-up de upgrade al plan premium si ya alcanzó el límite, construido en specs/001-registro-cuenta-usuario). Al hacer click en el nombre de un hijo, se navega a su reporte de consultas/recetas médicas — esa pantalla de detalle y todo lo relacionado con recetas médicas, medicamentos, horarios de toma y síntomas es una feature futura separada, fuera de alcance aquí; en esta feature el click solo debe navegar a una ruta placeholder para ese hijo (la pantalla de detalle no se construye todavía). Contexto de navegación: la app todavía no tiene login/autenticación (eso es una fase futura). Por ahora, al crear la cuenta exitosamente el usuario es llevado directo a esta home page, y el identificador de la cuenta se guarda en el navegador (ej. localStorage) para poder volver a esta pantalla sin tener que loguearse — si no hay ningún account_id guardado localmente, mostrar un estado que invite a crear una cuenta (enlace al formulario de registro ya existente)."

## Aclaraciones

### Sesión 2026-09-16

- Q: ¿Cómo se debe mostrar la edad de un hijo muy pequeño, por ejemplo uno de 3 meses de nacido? → A: En meses cuando el niño tiene menos de 2 años, y en años completos a partir de ahí (evita el caso "0 años" sin sentido para bebés).
- Q: Cuando el padre hace click en "Agregar hijo" desde la home, ¿cómo se le presenta ese formulario? → A: Como un modal/panel que se abre sobre la misma home page (no navega a una página aparte), reutilizando los mismos campos del formulario de hijo ya construido en specs/001-registro-cuenta-usuario.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Ver el listado de mis hijos al entrar a la home (Prioridad: P1)

Como padre/tutor que ya creó su cuenta, cuando abro la app, quiero ver de inmediato el listado de mis hijos dados de alta (nombre y edad), para saber a quién puedo consultar sin tener que buscar nada más.

**Por qué esta prioridad**: Es el propósito central de esta pantalla — sin esto, la home page no tiene ninguna razón de existir. Es la base de navegación para todo lo demás que se construya después (reporte de consultas, recetas, etc.).

**Prueba Independiente**: Se puede probar por completo creando una cuenta con al menos un hijo, abriendo la home page, y verificando que aparece una tarjeta por cada hijo con su nombre y su edad correctamente calculada a partir de la fecha de nacimiento.

**Escenarios de Aceptación**:

1. **Dado** que tengo una cuenta con uno o más hijos dados de alta, **Cuando** abro la home page, **Entonces** veo una tarjeta por cada hijo, mostrando su nombre y su edad calculada.
2. **Dado** que tengo una cuenta sin ningún hijo dado de alta todavía, **Cuando** abro la home page, **Entonces** veo un estado distinto que me invita a agregar mi primer hijo, no una lista vacía sin explicación.
3. **Dado** que hago click en el nombre de uno de mis hijos, **Cuando** ocurre la navegación, **Entonces** llego a una pantalla específica de ese hijo (aunque su contenido todavía no esté construido en esta funcionalidad).

---

### Historia de Usuario 2 - Agregar un hijo nuevo desde la home (Prioridad: P2)

Como padre/tutor, desde la home quiero poder agregar un hijo nuevo a mi cuenta, respetando el límite del plan gratuito, para no tener que volver al formulario de registro completo cada vez.

**Por qué esta prioridad**: Aporta valor real, pero la home ya es útil solo con la Historia 1 (ver a los hijos que ya tengo). Agregar hijos desde aquí evita que el usuario tenga que recordar cómo volver al flujo de registro original.

**Prueba Independiente**: Se puede probar agregando un hijo desde la home cuando la cuenta todavía no alcanzó el límite del plan gratuito, y verificando que aparece de inmediato en el listado; y por separado, intentando agregar un segundo hijo en una cuenta gratuita y verificando que aparece el mismo pop-up de límite freemium ya construido en specs/001-registro-cuenta-usuario.

**Escenarios de Aceptación**:

1. **Dado** que mi cuenta todavía no alcanzó el límite de hijos de mi plan, **Cuando** agrego un hijo nuevo desde la home, **Entonces** el hijo se guarda y aparece de inmediato en el listado.
2. **Dado** que mi cuenta ya alcanzó el límite de 1 hijo del plan gratuito, **Cuando** intento agregar otro hijo desde la home, **Entonces** veo el mismo pop-up de límite freemium ("Ver planes" / "Quedarme con el plan gratuito") que ya existe en el registro de cuenta, y no se crea ningún hijo nuevo.

---

### Historia de Usuario 3 - Volver a mi home sin tener que loguearme de nuevo (Prioridad: P3)

Como padre/tutor que ya creé mi cuenta antes, cuando vuelvo a abrir la app (o recargo la página), quiero llegar directo a mi home con mis hijos, sin tener que crear la cuenta otra vez ni buscar cómo entrar.

**Por qué esta prioridad**: Importante para la experiencia real de uso repetido, pero no bloquea el valor central de las Historias 1 y 2 — sin esto, el usuario simplemente tendría que volver a crear una cuenta cada vez, lo cual es una mala experiencia pero no un bloqueador funcional para probar el resto.

**Prueba Independiente**: Se puede probar creando una cuenta, confirmando la navegación automática a la home, recargando la página, y verificando que se sigue mostrando la misma cuenta sin pedir un nuevo registro. Por separado, se puede probar abriendo la app en un navegador limpio (sin ninguna cuenta guardada) y verificando que se muestra la invitación a crear cuenta en vez de una pantalla vacía o un error.

**Escenarios de Aceptación**:

1. **Dado** que acabo de crear mi cuenta exitosamente, **Cuando** se completa el registro, **Entonces** soy llevado automáticamente a mi home page sin ningún paso adicional.
2. **Dado** que ya visité mi home antes en este navegador, **Cuando** recargo la página o vuelvo a abrir la app, **Entonces** veo mi mismo listado de hijos sin tener que crear la cuenta de nuevo.
3. **Dado** que abro la app en un navegador donde nunca he creado una cuenta (o la borré), **Cuando** intento acceder a la home, **Entonces** veo una invitación clara a crear una cuenta nueva, con un enlace al formulario de registro existente.

---

### Casos Límite

- ¿Qué pasa si el identificador de cuenta guardado en el navegador ya no corresponde a ninguna cuenta real (por ejemplo, fue borrada del lado del servidor)? El sistema DEBE tratar este caso igual que "no hay cuenta guardada" — mostrar la invitación a crear cuenta, nunca un error críptico.
- ¿Qué pasa si el navegador no permite guardar datos localmente (modo privado/incógnito restrictivo)? El sistema DEBE seguir funcionando dentro de esa misma sesión de navegador (la cuenta recién creada sigue siendo accesible mientras la pestaña no se cierre), aunque no persista entre visitas — no debe romper la navegación a la home tras crear la cuenta.
- ¿En qué orden aparecen los hijos en el listado si hay varios? En el mismo orden en que fueron dados de alta (el más antiguo primero), sin necesidad de que el usuario los ordene manualmente.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: Al entrar a la home page, el sistema DEBE mostrar una tarjeta por cada hijo de la cuenta activa, con su nombre y su edad calculada a partir de la fecha de nacimiento — en meses cuando el hijo tiene menos de 2 años, y en años completos a partir de ahí.
- **FR-002**: Si no hay ninguna cuenta identificable en el navegador (o el identificador guardado no corresponde a una cuenta real), el sistema DEBE mostrar un estado que invite a crear una cuenta nueva, con un enlace al formulario de registro ya existente (specs/001-registro-cuenta-usuario).
- **FR-003**: Al completarse exitosamente la creación de una cuenta, el sistema DEBE guardar el identificador de esa cuenta en el navegador y navegar automáticamente a la home page, sin pasos adicionales del usuario.
- **FR-004**: La home page DEBE incluir un control para agregar un hijo nuevo a la cuenta activa, que abre un modal/panel sobre la misma home (sin navegar a una página aparte), reutilizando el mismo formulario y comportamiento freemium ya construidos (límite de 1 hijo en el plan gratuito; al alcanzarlo, se muestra el pop-up de upgrade en vez de crear el hijo).
- **FR-005**: Al hacer click en el nombre de un hijo listado, el sistema DEBE navegar a una ruta específica de ese hijo. El contenido de esa pantalla de destino está fuera de alcance de esta funcionalidad.
- **FR-006**: Si la cuenta activa no tiene ningún hijo dado de alta, el sistema DEBE mostrar un estado vacío distinto que invite a agregar el primer hijo, en vez de una lista en blanco sin explicación.
- **FR-007**: Esta funcionalidad NO DEBE incluir ninguna pantalla de detalle de consultas médicas, recetas, medicamentos, horarios de toma ni síntomas — eso es una funcionalidad futura separada (ver BACKLOG.md).
- **FR-008**: Esta funcionalidad NO DEBE incluir ningún mecanismo real de login/autenticación (contraseña, sesión de servidor, etc.) — la única persistencia es el identificador de cuenta guardado del lado del navegador.

### Entidades Clave

- Reutiliza las entidades **Account** y **Child** ya existentes (specs/001-registro-cuenta-usuario); esta funcionalidad no agrega ninguna entidad nueva del lado del servidor.
- **Sesión local (concepto, no entidad de base de datos)**: el identificador de la cuenta activa, guardado del lado del navegador, que permite mostrar la home correcta sin un mecanismo de login real.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un padre con cuenta ya creada ve el listado completo de sus hijos en menos de 2 segundos después de abrir la home page.
- **SC-002**: Un padre dentro del límite de su plan puede agregar un hijo nuevo desde la home y verlo reflejado en el listado sin recargar la página manualmente.
- **SC-003**: El 100% de los casos sin cuenta identificable en el navegador muestran la invitación a crear cuenta — nunca una pantalla en blanco, un error técnico, o un listado vacío sin explicación.
- **SC-004**: Un padre que recarga la página o cierra y vuelve a abrir la app en el mismo navegador llega a su home con su listado de hijos, sin tener que volver a crear una cuenta, en el 100% de los casos donde el navegador conservó el dato guardado.

## Supuestos

- Por ahora no existe ningún mecanismo real de autenticación (login/contraseña) — esto es una fase futura explícitamente fuera de alcance (ver constitución, alcance MVP). La "sesión" de esta funcionalidad es únicamente el identificador de cuenta guardado en el navegador tras un registro exitoso.
- La edad se calcula en años completos a partir de la fecha de nacimiento del hijo y la fecha actual; no requiere ningún dato adicional del backend más allá de lo que ya existe.
- El orden del listado de hijos sigue el orden en que fueron dados de alta, sin necesidad de una función de reordenar en esta funcionalidad.
- La pantalla de destino al hacer click en un hijo (reporte de consultas/recetas médicas) es una funcionalidad futura separada — aquí solo se define la navegación hacia una ruta placeholder para ese hijo, no su contenido.
- El botón de agregar hijo reutiliza el formulario y la lógica freemium ya construidos en specs/001-registro-cuenta-usuario, sin cambios de comportamiento — esta funcionalidad solo define dónde y cómo se accede a ese flujo desde la home.
