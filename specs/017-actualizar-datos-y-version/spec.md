# Especificación de Funcionalidad: Actualizar datos y versión de la app instalada

**Rama de la Funcionalidad**: `feature/017-actualizar-datos-y-version`

**Creado**: 2026-09-30

**Estado**: Borrador

**Entrada**: Descripción del usuario: "sí, arranca con el pull-to-refresh y aviso de versión nueva" (sección «La app instalada: actualizar datos y versión» del backlog, anotada 2026-09-29).

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Jalar hacia abajo para actualizar los datos (Prioridad: P1)

En el teléfono, con la app instalada en la pantalla de inicio (que se abre sin la barra del navegador y pierde el gesto
de «jalar para actualizar»), el padre jala la pantalla hacia abajo estando hasta arriba y, al soltar, la app vuelve a
pedir sus datos. Aparece un indicador mientras se actualiza. La página **no se recarga**: lo que el padre ya capturó
(por ejemplo la foto de la receta elegida en «Nueva consulta») no se pierde.

**Por qué esta prioridad**: hoy los datos solo se renuevan solos al volver a la app; no hay forma de pedirlos a mano, y
las tomas cambian de estado con el tiempo (spec 013) o se marcan desde otro dispositivo o desde el aviso.

**Prueba Independiente**: en el detalle de un hijo, marcar una toma desde otro dispositivo, jalar hacia abajo y soltar:
la toma aparece marcada sin recargar la página.

**Escenarios de Aceptación**:

1. **Dado** una pantalla con sesión en diseño móvil (home, detalle del hijo, detalle de consulta) y la página hasta
   arriba, **Cuando** el padre jala hacia abajo más allá del umbral y suelta, **Entonces** se vuelven a pedir los datos
   y aparece un indicador que desaparece al terminar.
2. **Dado** que el padre jala menos del umbral, **Cuando** suelta, **Entonces** no pasa nada y el indicador se va.
3. **Dado** que la página no está hasta arriba, **Cuando** el padre jala hacia abajo, **Entonces** la pantalla se
   desplaza normalmente y no se actualiza nada.
4. **Dado** que hay datos capturados en un formulario, **Cuando** el padre actualiza, **Entonces** el formulario
   conserva todo lo escrito y la foto elegida.
5. **Dado** que la actualización falla (sin conexión), **Cuando** termina, **Entonces** se conservan los datos que ya
   se veían y se muestra un aviso breve de que no se pudo actualizar.
6. **Dado** el diseño web (≥ 900 px), **Entonces** no existe el gesto.

---

### Historia de Usuario 2 - Aviso de versión nueva (Prioridad: P2)

Cuando se publica una versión nueva, quien tiene la app instalada sigue con la anterior hasta cerrarla y abrirla de
nuevo. La app detecta que hay una versión nueva y muestra un aviso discreto **«Hay una versión nueva · Actualizar»**.
Al tocar «Actualizar» la app se recarga con la versión nueva.

**Por qué esta prioridad**: sin el aviso, un padre puede quedarse días con una versión vieja; «jalar para actualizar»
trae datos, no código. Es menos urgente que el gesto porque la API mantiene compatibilidad entre versiones (spec 012).

**Prueba Independiente**: con la app abierta, publicar una versión nueva y volver a la app: aparece el aviso; al tocar
«Actualizar» la app carga la versión nueva y el aviso ya no aparece.

**Escenarios de Aceptación**:

1. **Dado** una versión nueva publicada, **Cuando** el padre abre o vuelve a la app, **Entonces** se muestra el aviso
   «Hay una versión nueva» con el botón «Actualizar».
2. **Dado** el aviso, **Cuando** el padre toca «Actualizar», **Entonces** la app se recarga con la versión nueva.
3. **Dado** que hay datos capturados sin guardar (formulario con texto o foto), **Cuando** el padre toca «Actualizar»,
   **Entonces** la app pide confirmación antes de recargar, y nunca se recarga sola.
4. **Dado** el aviso, **Cuando** el padre lo ignora, **Entonces** puede seguir usando la app y el aviso permanece
   visible pero discreto, sin tapar contenido ni botones.
5. **Dado** que no hay versión nueva, **Entonces** no aparece ningún aviso.
6. **Dado** el diseño web o móvil, **Entonces** el aviso funciona en ambos, cada uno con su diseño.

---

### Casos Límite

- El gesto no debe activarse al desplazarse dentro de un cuadro con su propio scroll (visor de la receta, diálogos) ni
  mientras hay un diálogo abierto.
- El rebote propio de iOS no debe interferir: el gesto solo cuenta si empezó con la página en el tope.
- Con «reducir movimiento» activado, el indicador aparece sin animación.
- Varios jalones seguidos mientras ya se actualiza: solo se hace una actualización a la vez.
- Sin conexión al abrir la app: no aparece el aviso de versión (no hay forma de saberlo) y no se muestra un error por eso.
- El aviso no aparece en pantallas de inicio de sesión ni durante un envío en curso de un formulario.

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: En diseño móvil, todas las pantallas con sesión DEBEN admitir el gesto de jalar hacia abajo desde el tope
  para volver a pedir los datos, implementado una sola vez para todas ellas.
- **FR-002**: El gesto DEBE actualizar solo los datos (volver a pedirlos), NUNCA recargar la página, y NO DEBE borrar lo
  capturado en formularios.
- **FR-003**: DEBE mostrar un indicador mientras se jala y mientras se actualiza, y respetar «reducir movimiento».
- **FR-004**: El gesto NO DEBE activarse si la página no está en el tope, si hay un diálogo abierto o si el toque empezó
  dentro de un elemento con su propio desplazamiento.
- **FR-005**: Si la actualización falla, DEBE conservar los datos ya mostrados y avisar brevemente en español.
- **FR-006**: La app DEBE detectar que hay una versión nueva al abrirse y al volver al primer plano, y mostrar el aviso
  «Hay una versión nueva · Actualizar».
- **FR-007**: «Actualizar» DEBE recargar la app con la versión nueva; NUNCA debe recargarse sola, y si hay datos
  capturados sin guardar DEBE pedir confirmación antes.
- **FR-008**: El aviso DEBE ser discreto: sin bloquear el uso, sin tapar contenido ni acciones, con área táctil de al
  menos 44 px y contraste ≥ 4.5:1.
- **FR-009**: Los textos DEBEN ser neutros y en español; nada médico ni de sugerencia (Principio I).
- **FR-010**: Móvil y web DEBEN diseñarse por separado (el gesto es solo móvil; el aviso existe en ambos) con los tokens
  de diseño y mostrarse al usuario para aprobarlos.

### Entidades Clave

- **Versión de la app**: identificador de la versión publicada contra el que se compara la que corre en el dispositivo;
  no es un dato del padre y no se guarda en su cuenta.

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El padre actualiza los datos de cualquier pantalla con sesión con un solo gesto, sin recargar y sin perder
  lo capturado (0 formularios pierden datos en las pruebas).
- **SC-002**: Tras publicar una versión, el aviso aparece en la siguiente apertura o regreso a la app y, al tocarlo,
  la app corre la versión nueva en un solo paso.
- **SC-003**: En el 100 % de los casos el aviso no recarga la app sin que el padre lo pida.
- **SC-004**: Los flujos pasan sus pruebas de extremo a extremo a 390 y 1280 px (el gesto solo a 390 px).

## Supuestos

- Se sigue la propuesta del backlog: gesto propio sin librería, una vez en `AppShell`, solo diseño móvil, invalidando
  las consultas de TanStack Query; umbral y textos se ajustan en un solo lugar.
- La forma de detectar la versión nueva (actualización del service worker de la spec 011 o un archivo de versión) se
  decide en el plan; aquí solo importa el comportamiento.
- «Datos capturados sin guardar» = un formulario con texto escrito o foto elegida (la misma regla de `confirmLeave` de
  «Nueva consulta»).
- Fuera de alcance: actualizaciones automáticas sin aviso, notas de la versión, forzar actualización obligatoria,
  jalar para actualizar en el diseño web, y cambios de API.
- Depende de: spec 011 (service worker), spec 005/007 (`AppShell`, tokens, diseño móvil/web separado).
- Sin mock: se diseña con `design-tokens.md`.
