# Especificación de Funcionalidad: Autenticación real de cuenta (login)

**Rama de la Funcionalidad**: `feature/008-autenticacion-cuenta`

**Creado**: 2026-09-22

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Autenticación real de cuenta (login) para PediTrack, reemplazando la
"sesión" actual de account_id en localStorage. Contexto actual: specs/001 y 003 implementaron el registro
(tutor + primer hijo) y el home, pero no hay login real — el account_id creado en el registro se guarda en
localStorage y con eso "vuelve" el usuario a su cuenta, sin contraseña ni verificación de identidad en ningún
momento. specs/007 ya agregó a los formularios de registro (móvil y web) el campo "Contraseña" (mínimo 8
caracteres, solo validado en el cliente, nunca enviado ni guardado) y el botón "Registrarme con Google" (hoy
solo avisa "disponible pronto"). GET /accounts/{accountId} y POST /accounts/{accountId}/children hoy no tienen
ninguna autenticación — cualquiera que sepa o adivine un account_id puede leerlo o agregarle hijos. Un
proveedor de identidad externo (Clerk o AWS Cognito, por decidir) maneja la contraseña y el login con Google;
el backend de PediTrack nunca guarda ni ve contraseñas. Se necesita una pantalla de login, que el registro cree
la cuenta también en el proveedor, que la sesión deje de ser el account_id en localStorage, que los endpoints
existentes exijan que la sesión corresponda a la cuenta, cerrar sesión, y qué pasa con las cuentas ya
existentes sin contraseña en el proveedor. Fuera de alcance: cambios al modelo de datos más allá de lo
necesario, recuperación de contraseña si el proveedor no la resuelve gratis en el primer corte, y roles/
permisos más allá de un tutor por cuenta."

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Registrarse con una identidad real (Prioridad: P1)

Un tutor nuevo llena el formulario de registro (correo, contraseña, o "Registrarme con Google") y, al
terminar, su forma de entrar a PediTrack queda protegida de verdad: su contraseña la controla el proveedor de
identidad, no PediTrack, y puede volver a entrar más adelante demostrando que es él.

**Por qué esta prioridad**: Es la puerta de entrada — sin esto no hay nada que proteger después. Ya existe el
formulario (spec 007) pero hoy la contraseña se descarta y "Registrarme con Google" solo avisa "disponible
pronto"; esta historia es la que los vuelve reales.

**Prueba Independiente**: Se registra una cuenta nueva con correo+contraseña (y por separado con Google) y se
verifica que la cuenta queda utilizable para iniciar sesión después, sin que la contraseña quede visible en
ningún log o tabla de PediTrack.

**Escenarios de Aceptación**:

1. **Dado** el formulario de registro con correo, contraseña y los datos del tutor/primer hijo ya llenos,
   **Cuando** el tutor lo envía, **Entonces** su cuenta queda creada y puede usarla para iniciar sesión más
   adelante.
2. **Dado** el formulario de registro, **Cuando** el tutor toca "Registrarme con Google" y confirma su cuenta
   de Google, **Entonces** su cuenta de PediTrack queda creada sin haber escrito ninguna contraseña.
3. **Dado** un correo que ya tiene una cuenta, **Cuando** alguien intenta registrarse de nuevo con ese mismo
   correo, **Entonces** el sistema lo rechaza con un mensaje claro (comportamiento ya existente en spec 001,
   ahora también válido para Google).

---

### Historia de Usuario 2 - Iniciar sesión (Prioridad: P1)

Un tutor que ya tiene cuenta abre PediTrack en cualquier dispositivo o navegador (no solo el que usó para
registrarse) y entra escribiendo su correo y contraseña, o con "Continuar con Google", para ver a sus hijos.

**Por qué esta prioridad**: Es el reemplazo directo del `account_id` en `localStorage` — hoy la "sesión" no
sobrevive a un cambio de dispositivo o navegador ni demuestra identidad; esta es la funcionalidad central de la
feature.

**Prueba Independiente**: Con una cuenta ya creada, se abre la app en un navegador limpio (sin nada guardado),
se inicia sesión, y se verifica que aparecen los hijos correctos de esa cuenta.

**Escenarios de Aceptación**:

1. **Dado** un tutor con cuenta ya creada y sin sesión activa, **Cuando** escribe su correo y contraseña
   correctos y confirma, **Entonces** entra a su home y ve a sus propios hijos.
2. **Dado** un tutor con cuenta ya creada, **Cuando** toca "Continuar con Google" y confirma la cuenta de
   Google con la que se registró, **Entonces** entra a su home sin escribir ninguna contraseña.
3. **Dado** un tutor escribiendo su correo y contraseña, **Cuando** la contraseña es incorrecta,
   **Entonces** ve un mensaje de error que no revela si el correo existe o no, y sigue sin sesión.
4. **Dado** un tutor que ya iba a entrar a `/home` (o a cualquier pantalla con sesión) sin haber iniciado
   sesión, **Cuando** intenta abrir esa pantalla, **Entonces** el sistema lo manda al login primero.
5. **Dado** un tutor que ya inició sesión, **Cuando** cierra la pestaña y vuelve a abrir PediTrack más tarde
   en el mismo dispositivo, **Entonces** sigue con la sesión activa (no tiene que volver a escribir su
   contraseña cada vez).

---

### Historia de Usuario 3 - Cada cuenta protege sus propios datos (Prioridad: P1)

Un tutor autenticado no puede leer ni modificar los datos (cuenta, hijos, consultas) de otra cuenta, aunque
conozca o adivine su identificador — hoy `GET /accounts/{accountId}` y `POST /accounts/{accountId}/children`
no verifican nada.

**Por qué esta prioridad**: Es un requisito de privacidad no negociable (Principio II de la constitución del
proyecto — datos de salud de menores) y ya es una brecha real hoy, no solo una mejora a futuro.

**Prueba Independiente**: Con dos cuentas distintas ya creadas, iniciar sesión con la primera y, usando esa
misma sesión, intentar leer o modificar la segunda cuenta por su identificador — debe rechazarse siempre.

**Escenarios de Aceptación**:

1. **Dado** un tutor autenticado como la cuenta A, **Cuando** intenta leer los datos de la cuenta B (por
   ejemplo, cambiando el identificador en la URL), **Entonces** el sistema lo rechaza y no expone ningún dato
   de la cuenta B.
2. **Dado** un tutor autenticado como la cuenta A, **Cuando** intenta agregar un hijo a la cuenta B,
   **Entonces** el sistema lo rechaza y la cuenta B no cambia.
3. **Dado** una petición sin sesión válida, **Cuando** intenta leer o modificar cualquier cuenta,
   **Entonces** el sistema la rechaza igual que si fuera una cuenta ajena.

---

### Historia de Usuario 4 - Cerrar sesión (Prioridad: P2)

Un tutor cierra su sesión desde la app (por ejemplo, antes de devolver un teléfono prestado) y, después de
eso, cualquiera que use ese mismo dispositivo ya no ve sus hijos ni sus datos.

**Por qué esta prioridad**: Es necesaria para que la sesión persistente de la Historia 2 no se convierta en un
riesgo de privacidad en dispositivos compartidos, pero no bloquea poder demostrar el login funcionando.

**Prueba Independiente**: Con una sesión activa, cerrar sesión desde la UI y verificar que la siguiente carga
de la app pide login de nuevo y no muestra ningún dato de la cuenta anterior.

**Escenarios de Aceptación**:

1. **Dado** un tutor con sesión activa, **Cuando** toca "Cerrar sesión", **Entonces** vuelve a la pantalla de
   login y ya no puede ver sus hijos sin volver a entrar.
2. **Dado** un tutor que cerró sesión, **Cuando** alguien más abre PediTrack en ese mismo dispositivo después,
   **Entonces** no ve ningún dato de la cuenta anterior.

---

### Historia de Usuario 5 - Primer acceso de una cuenta creada antes de esta feature (Prioridad: P3)

Una cuenta que ya existe hoy (creada antes de que existiera contraseña real) puede acceder por primera vez con
esta feature sin perder a los hijos que ya tiene registrados.

**Por qué esta prioridad**: Afecta a cuentas reales que ya existen en el ambiente del proyecto (ver
BACKLOG.md), pero es un caso de migración puntual, no el camino principal de un tutor nuevo — puede resolverse
después de que P1/P2 ya funcionen.

**Prueba Independiente**: Tomar una cuenta creada antes de esta feature (sin contraseña en el proveedor),
completar el flujo de primer acceso, e iniciar sesión con la contraseña recién establecida (o con Google) —
debe seguir viendo a los mismos hijos que ya tenía.

**Escenarios de Aceptación**:

1. **Dado** una cuenta creada antes de esta feature (con hijos ya registrados) y sin contraseña en el
   proveedor de identidad, **Cuando** su tutor intenta entrar por primera vez con esta feature ya activa,
   **Entonces** el sistema lo guía a establecer su forma de entrar (contraseña o Google) sin perder a sus
   hijos.
2. **Dado** que ese tutor ya completó su primer acceso, **Cuando** vuelve a entrar más adelante,
   **Entonces** puede iniciar sesión de manera normal como cualquier otra cuenta (Historia 2).

### Casos Límite

- ¿Qué ve el tutor si el proveedor de identidad no responde (caído/lento)? El login/registro MUST fallar con
  un mensaje claro, nunca dejar entrar sin verificar identidad.
- ¿Qué pasa si alguien se registra con Google usando el mismo correo que ya usó para registrarse con
  contraseña? Se resuelve con el comportamiento propio del proveedor de identidad elegido (vinculación de
  cuentas por correo); no se construye una vinculación manual dentro de PediTrack.
- ¿Qué pasa si la sesión expira mientras el tutor tiene la app abierta y llenando algo (p. ej. una nueva
  consulta)? El sistema MUST mandarlo a login sin perder silenciosamente lo que ya escribió cuando sea posible
  detectarlo antes de enviar.
- ¿Qué pasa si un tutor con sesión activa borra el `account_id` guardado manualmente (comportamiento legado)?
  Ya no debe tener ningún efecto — la sesión real vive del lado del proveedor de identidad, no de
  `localStorage`.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El sistema DEBE permitir a un tutor nuevo crear su cuenta con correo y contraseña, donde la
  contraseña la valida y almacena el proveedor de identidad — nunca el backend de PediTrack.
- **FR-002**: El sistema DEBE permitir a un tutor nuevo crear su cuenta usando su cuenta de Google, sin pedir
  ninguna contraseña.
- **FR-003**: El sistema DEBE ofrecer una pantalla de inicio de sesión donde un tutor ya registrado entre con
  correo+contraseña o con Google, desde cualquier dispositivo o navegador.
- **FR-004**: El sistema DEBE reconocer una sesión ya iniciada y mostrar directamente los datos de esa cuenta,
  sin pedir credenciales de nuevo mientras la sesión siga siendo válida.
- **FR-005**: El sistema DEBE impedir que un tutor autenticado lea o modifique los datos (cuenta, hijos,
  consultas) de una cuenta que no es la suya, incluso si conoce o adivina su identificador.
- **FR-006**: El sistema DEBE rechazar cualquier intento de leer o modificar datos de una cuenta cuando no hay
  una sesión válida.
- **FR-007**: El sistema DEBE permitir a un tutor cerrar su sesión desde la app; después de cerrarla, el
  sistema ya no MUST mostrar sus datos sin que vuelva a iniciar sesión.
- **FR-008**: El sistema DEBE dar a las cuentas creadas antes de esta feature un camino para su primer acceso
  (establecer contraseña o vincular Google) sin perder ningún hijo ya registrado.
- **FR-009**: El sistema DEBE mostrar un mensaje de error claro cuando el correo o la contraseña son
  incorrectos, sin revelar si ese correo tiene o no una cuenta.
- **FR-010**: El sistema DEBE seguir sin guardar ni transmitir la contraseña del tutor, en ningún formato, al
  backend propio de PediTrack (extiende lo ya construido en spec 007, donde el campo solo se valida en el
  cliente).
- **FR-011**: El sistema DEBE usar **Clerk** como proveedor de identidad para todo correo+contraseña y login
  con Google — decidido el 2026-09-22 sobre AWS Cognito por su integración más directa con el stack actual
  (SDK de React, hooks para armar el login/registro con el diseño propio, verificación de sesión vía JWT desde
  el backend Go) y su plan gratuito hasta 50,000 usuarios retenidos mensuales (MRU, ampliado en febrero 2026),
  de sobra para el MVP.

### Entidades Clave

- **Sesión de tutor**: representa que un tutor demostró su identidad ante el proveedor de identidad elegido;
  vincula ese usuario del proveedor con su `Account` ya existente en PediTrack (specs 001/003). Reemplaza al
  `account_id` guardado sin verificar en `localStorage`.
- **Identidad externa del tutor**: el registro de "este tutor, en el proveedor de identidad, es esta cuenta de
  PediTrack" — se crea al registrarse (Historia 1) o al completar el primer acceso de una cuenta migrada
  (Historia 5).

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: Un tutor nuevo completa su registro (incluyendo confirmar su forma de entrar, con contraseña o
  con Google) en menos de 3 minutos.
- **SC-002**: Un tutor que ya tiene cuenta pasa de la pantalla de login a ver a sus propios hijos en menos de
  30 segundos.
- **SC-003**: El 100% de los intentos de leer o modificar los datos de una cuenta ajena son rechazados —
  verificado con pruebas automatizadas que cubren los tres escenarios de la Historia 3, sin ninguna excepción.
- **SC-004**: El 100% de las cuentas creadas antes de esta feature completan su primer acceso sin perder
  ningún hijo que ya tenían registrado.
- **SC-005**: Cero contraseñas de tutores quedan almacenadas o visibles en los sistemas propios de PediTrack
  (base de datos, logs, `error_logs` de spec 002) — verificable por auditoría directa del código y la base de
  datos.

## Supuestos

- El registro sigue creando primero la cuenta en PediTrack (tutor + primer hijo, como hoy en specs 001/007);
  esta feature agrega que ese mismo paso también cree (o vincule) al tutor en el proveedor de identidad
  elegido.
- No hay multi-tutor por cuenta en esta v1 — sigue siendo un tutor por cuenta, igual que hoy.
- La sesión se mantiene activa mientras el tutor no cierre sesión explícitamente o el proveedor la expire por
  su propia política por defecto (no se pide una duración específica en esta spec).
- "Olvidé mi contraseña" se resuelve con el flujo propio del proveedor de identidad elegido (Historia de
  Usuario "Cerrar sesión"/recuperación quedan fuera de esta feature si el proveedor no la ofrece sin costo
  adicional en el primer corte — ya excluido explícitamente por el usuario).
- Los endpoints backend ya existentes (`GET /accounts/{accountId}`, `POST /accounts/{accountId}/children`)
  conservan la misma forma de datos; esta feature les agrega la verificación de que la sesión autenticada
  corresponde a esa cuenta, sin cambiar qué devuelven o reciben.
- Por el Principio V de la constitución (Simplicidad y MVP Real) y el Principio II (Privacidad), cualquier
  detalle de cómo el proveedor de identidad elegido guarda o transmite datos del tutor MUST revisarse contra
  el aviso de privacidad LFPDPPP vigente antes de implementarse, aunque el proveedor sea externo.
