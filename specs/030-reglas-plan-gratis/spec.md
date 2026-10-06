# Especificación de Funcionalidad: Reglas del plan gratuito para las consultas

**Rama de la Funcionalidad**: `feature/030-reglas-plan-gratis`

**Creado**: 2026-10-05

**Estado**: Implementado

**Entrada**: Decisión de producto del 2026-10-05 (ver `BACKLOG.md`, «Qué incluye el plan de pago»): el plan **gratuito** guarda **una consulta con tratamiento activo a la vez** y **no puede guardar consultas anteriores «solo registro»**; lo que ya registró **siempre lo ve**. El plan **de pago** no tiene esos dos límites. Es el primer paso de «Orden sugerido» de esa entrada: usa el `plan` que ya existe (`free`/`paid`, spec 029) y se prueba en DEV dando `paid` o `free` a los probadores con SQL (`DEPLOY.md`). No hay cobro, ni pantalla de planes, ni compartir (siguen en el backlog).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Un tratamiento activo a la vez en el plan gratuito (Prioridad: P1)

Una cuenta gratuita ya tiene una consulta cuyo tratamiento sigue en curso (algún medicamento sin finalizar con una toma por delante). Quiere registrar otra. La app **no la deja llenar un formulario para decirle que no**: al tocar «Nueva consulta» (o «+ Nueva» en el teléfono) aparece el aviso del plan, con un texto neutral: el plan gratuito incluye un tratamiento activo a la vez; cuando termine —o si lo finaliza— podrá registrar la siguiente; todo lo que ya registró se mantiene y lo sigue viendo. «Entendido» lo cierra y «Ver planes» abre `/planes`.

**Por qué esta prioridad**: es el corte de producto decidido: el uso real es por episodios, así que una familia casi nunca lo toca, y quien tiene varios tratamientos a la vez es quien más valor recibe del plan de pago.

**Prueba Independiente**: con una cuenta gratuita y una consulta de hoy con tratamiento de 3 días, tocar «Nueva consulta» muestra el aviso y no abre el formulario; al finalizar el tratamiento (spec 016) y recargar, «Nueva consulta» es otra vez un enlace al formulario.

**Escenarios de Aceptación**:

1. **Dado** una cuenta gratuita con un tratamiento activo (de cualquiera de sus hijos), **Cuando** toca «Nueva consulta» en el detalle del hijo (web o teléfono) o en el detalle de la consulta (web), **Entonces** se abre el aviso «Ya tienes un tratamiento activo» y no se navega al formulario.
2. **Dado** una cuenta gratuita **sin** tratamiento activo (nunca tuvo uno, terminó, o lo finalizó), **Entonces** «Nueva consulta» es un enlace al formulario y guardar funciona como siempre.
3. **Dado** una cuenta de pago, **Entonces** nunca ve el aviso: tiene tantos tratamientos activos a la vez como quiera.
4. **Dado** que el formulario ya estaba abierto y, mientras tanto (otro dispositivo, otra pestaña), la cuenta empezó un tratamiento, **Cuando** el padre guarda, **Entonces** el servidor lo rechaza, aparece el mismo aviso **encima del formulario** y **no se pierde nada de lo escrito** (ni la foto).
5. **Dado** el aviso abierto, **Entonces** es un diálogo real como los demás de la app (foco en «Ver planes», Tab no sale, Escape y el fondo lo cierran y el foco vuelve al botón que lo abrió).
6. **Dado** el aviso, **Entonces** nunca dice qué hacer con la salud del niño (Principio I): solo dice qué incluye el plan.

---

### Historia de Usuario 2 - «Solo registro» es del plan de pago (Prioridad: P1)

«Consulta anterior: guardar solo como registro» (spec 024) es la forma de pasar a la app el historial de antes: es parte del plan de pago. En el plan gratuito la casilla **se ve** (para que el padre sepa que existe) pero está **deshabilitada**, con el texto «Disponible en el plan completo. Con el plan gratuito registras la consulta actual, con sus horarios y avisos.». El servidor también lo rechaza si llega `recordOnly: true`.

**Prueba Independiente**: con una cuenta gratuita, «Nueva consulta» muestra la casilla deshabilitada; con una de pago, se puede marcar.

**Escenarios de Aceptación**:

1. **Dado** una cuenta gratuita, **Entonces** la casilla está deshabilitada y desmarcada, con el texto del plan completo en lugar del de «no se crearán horarios».
2. **Dado** una cuenta de pago (o la cuenta aún sin cargar), **Entonces** la casilla funciona como en la spec 024.
3. **Dado** una petición `recordOnly: true` de una cuenta gratuita (otra versión de la app, o una llamada directa), **Entonces** el servidor responde 422 con motivo `record_only`, no guarda nada y el formulario muestra el aviso «Consultas anteriores en el plan completo».

---

### Historia de Usuario 3 - Nada ya registrado se oculta ni se pierde (Prioridad: P1)

Ninguna de estas reglas esconde, bloquea la lectura de, ni borra datos. Una cuenta que baja de pago a gratuito **conserva y ve todo** lo que registró; solo **no puede crear** una consulta que el plan no incluye. Seguir **marcando tomas** nunca se bloquea (es seguridad, no «agregar»).

**Escenarios de Aceptación**:

1. **Dado** una cuenta gratuita con varias consultas (de cuando era de pago), **Entonces** el listado y el detalle de todas siguen visibles y las tomas se siguen marcando.
2. **Dado** el aviso del plan, **Entonces** dice que lo ya registrado se mantiene.

---

### Casos Límite

- **«Activo»** es lo mismo que en el resumen del hijo (spec 006): un medicamento **sin finalizar** (`ended_at` nulo) con **al menos una toma por delante** (`scheduled_at > ahora`, reloj del servidor). Se deriva de las tomas; nunca es un juicio médico. Una consulta de varios medicamentos cuenta como una sola.
- **De toda la cuenta, no solo del hijo:** una cuenta gratuita que conserva varios hijos (bajó de plan) tiene **un** tratamiento activo en total.
- **Dos peticiones a la vez** de la misma cuenta se revisan una tras otra (el servidor bloquea la fila de la cuenta): solo una empieza el tratamiento.
- Una consulta de fecha pasada cuyas tomas **ya terminaron** no cuenta como activa; como se guarda con sus horarios, no es «solo registro». No es un candado de seguridad sino un corte de producto: lo que no se permite en gratis es **la casilla** y **dos tratamientos a la vez**.
- El **tope de hijos** (1 gratis, 10 de pago, spec 029) no cambia.
- Un error cualquiera distinto de estas reglas se sigue mostrando como siempre.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: `POST /children/{childId}/consultations` de una cuenta **gratuita** con otro tratamiento activo en la cuenta responde **422** `freemium_consultation_limit_exceeded` con `reason: "active_treatment"` y no guarda nada.
- **FR-002**: La misma petición con `recordOnly: true` de una cuenta gratuita responde **422** con `reason: "record_only"` y no guarda nada (aunque no haya tratamiento activo).
- **FR-003**: Una cuenta **de pago** no tiene ninguno de los dos límites.
- **FR-004**: El servidor decide siempre (no el cliente) y la revisión es **atómica** por cuenta: bajo el bloqueo de su fila (`FOR UPDATE`), dentro de la transacción que guarda la consulta.
- **FR-005**: Ninguna lectura (listados, detalles, resumen) ni marcar tomas cambia por el plan.
- **FR-006**: En «Nueva consulta», la casilla de «solo registro» está deshabilitada en el plan gratuito y explica que es del plan completo.
- **FR-007**: En el detalle del hijo (ambos diseños) y en el detalle de la consulta (web), con plan gratuito y tratamiento activo, «Nueva consulta» abre el aviso del plan **antes** de mostrar un formulario; en los demás casos es un enlace.
- **FR-008**: Si el servidor rechaza al guardar, el aviso aparece sobre el formulario y **todo lo escrito se conserva**.
- **FR-009**: Los textos del aviso son neutrales (Principio I) y siempre dicen que lo ya registrado se mantiene.

### Entidades Clave

Ninguna nueva. Se lee `accounts.plan`, `medications.ended_at` y `doses.scheduled_at`. Sin migración.

## Supuestos

- El plan de una cuenta se da a mano con SQL (spec 029) hasta que exista el cobro; un cliente (la app) que aún no cargó la cuenta deja la casilla habilitada y el servidor decide.
- La app trata la respuesta 422 con `reason` desconocido como «tratamiento activo» (el aviso más general).
- Fuera de alcance: pantalla de planes (`/planes` sigue siendo un aviso), cobro con Mercado Pago, compartir con la pareja, búsqueda y filtros del historial. Ver «Orden sugerido» en `BACKLOG.md`.

## Criterios de Éxito

- **SC-001**: Una cuenta gratuita con un tratamiento activo nunca llega a un formulario que el servidor vaya a rechazar, salvo que el estado cambie mientras lo llena (y entonces no pierde lo escrito).
- **SC-002**: Una cuenta que baja de plan conserva el 100 % de lo ya registrado, visible y con las tomas marcables.
- **SC-003**: Dos peticiones simultáneas de una cuenta gratuita nunca guardan dos tratamientos activos.
- **SC-004**: Una cuenta de pago no nota ningún cambio.
