# Especificación de Funcionalidad: Identidad visual y rediseño del front-end

**Rama de la Funcionalidad**: `feature/005-identidad-visual-front-end`

**Creado**: 2026-09-18

**Estado**: Borrador

**Entrada**: Descripción del usuario: "Diseñar el logo de la PWA y una mejor estética del front-end usando mejores tipografías y colores, incluyendo los modales y el diseño en general. Los colores actuales se sienten opacos, sin vida y sin punch; no dan ganas de navegar en la app."

## Aclaraciones

### Sesión 2026-09-18

- Q: ¿Qué pantallas entran en alcance? → A: Registro de cuenta, home/listado de hijos, detalle del hijo, detalle de consulta, formulario de consulta con OCR, y los dos modales existentes (agregar hijo, límite freemium).
- Q: ¿Móvil solamente o también escritorio? → A: Ambos — la PWA sigue siendo mobile-first, pero la vista de escritorio deja de ser una columna estirada y usa una barra lateral de hijos.
- Q: ¿Qué densidad de interfaz? → A: Amplia — poco contenido por pantalla, tipografía grande y jerarquía por tamaño/peso, no por bordes grises.
- Q: ¿Dónde aparece el logo? → A: Header de la app, pantalla de registro, y como icono/splash de la PWA.
- Q: ¿Esta funcionalidad cambia comportamiento o datos? → A: No. Es exclusivamente visual: mismos componentes, mismas rutas, mismos contratos de API, mismas pruebas de comportamiento.

## Escenarios de Usuario y Pruebas *(obligatorio)*

### Historia de Usuario 1 - Reconocer la app y querer abrirla (Prioridad: P1)

Como padre/tutor, quiero que PediTrack tenga un icono propio en mi pantalla de inicio y una interfaz con color y jerarquía claras, para identificarla de inmediato y no sentir que abro un formulario administrativo.

**Por qué esta prioridad**: El logo y la base visual son la dependencia de todo lo demás — el resto de las pantallas solo puede aplicarse una vez definidos los tokens y el icono.

**Prueba Independiente**: Instalar la PWA en iOS y Android y verificar que el icono, el nombre corto y el color de tema son los definidos, y que la pantalla de registro muestra el logo.

**Escenarios de Aceptación**:

1. **Dado** que instalo la PWA desde el navegador, **Cuando** veo mi pantalla de inicio, **Entonces** aparece el icono de PediTrack (cápsula partida sobre fondo cyan) y no el icono por defecto de Vite.
2. **Dado** que abro la app instalada, **Cuando** carga, **Entonces** la barra de estado y el splash usan el color base `#04252b` y no el blanco por defecto.
3. **Dado** que entro a la pantalla de registro, **Cuando** la veo, **Entonces** el logo y el nombre PediTrack encabezan la pantalla.

---

### Historia de Usuario 2 - Leer cada pantalla sin esfuerzo (Prioridad: P2)

Como padre/tutor, quiero distinguir de un vistazo qué está confirmado, qué está pendiente y qué es accionable, para no tener que leer todo el texto de la pantalla.

**Por qué esta prioridad**: Es el problema de fondo reportado (todo se veía del mismo cyan claro, así que nada destacaba); resuelve la legibilidad sin tocar funcionalidad.

**Prueba Independiente**: Abrir el detalle de una consulta con tomas marcadas y sin marcar y verificar que ambos estados se distinguen por color y peso sin leer las etiquetas.

**Escenarios de Aceptación**:

1. **Dado** que veo una toma ya marcada como tomada, **Cuando** la comparo con una toma sin marcar, **Entonces** la primera usa el color de confirmado y la segunda el de pendiente, y la diferencia es visible sin leer el texto.
2. **Dado** que estoy en cualquier pantalla, **Cuando** busco la acción principal, **Entonces** hay exactamente un botón sólido de acción primaria visible.
3. **Dado** que uso la app en un teléfono, **Cuando** toco cualquier control accionable, **Entonces** su área táctil mide al menos 44 px de alto.

---

### Historia de Usuario 3 - Usar la app en escritorio sin sentirla estirada (Prioridad: P3)

Como padre/tutor que a veces entra desde la computadora, quiero una vista que aproveche el ancho con la lista de hijos siempre visible, para cambiar de hijo sin volver al home.

**Por qué esta prioridad**: Mejora real pero secundaria — el uso primario es móvil (Principio III, mobile-first).

**Prueba Independiente**: Abrir el home en un viewport de 1280 px y verificar la barra lateral de hijos y el contenido en dos columnas.

**Escenarios de Aceptación**:

1. **Dado** que abro la app en un viewport de ancho ≥ 900 px, **Cuando** veo el home, **Entonces** la lista de hijos vive en una barra lateral persistente y el detalle ocupa el área principal.
2. **Dado** que reduzco la ventana a menos de 900 px, **Cuando** la interfaz refluye, **Entonces** vuelve al diseño de una columna móvil sin scroll horizontal.

---

### Casos Límite

- ¿Qué pasa con las pantallas de estado vacío? Heredan la misma jerarquía: título grande, una frase de apoyo y una sola acción primaria — nunca una lista vacía sin explicación (FR-002 de specs/003 y specs/004 siguen vigentes).
- ¿Qué pasa si el usuario tiene el sistema en modo oscuro? Fuera de alcance de esta funcionalidad (ver Adiciones Futuras); la app se mantiene en su paleta clara con base oscura en headers.
- ¿Qué pasa con la foto de la receta en el detalle de consulta? Solo cambia su presentación (tarjeta con miniatura y acción "Ver completa"); la imagen y su origen no cambian.
- ¿El rediseño puede introducir color con significado médico (rojo de alerta, semáforos de dosis)? No — ámbar significa únicamente "sin marcar" y emerald "marcado por el padre", nunca un juicio sobre el tratamiento (Principio I).

## Requisitos *(obligatorio)*

### Requisitos Funcionales

- **FR-001**: El proyecto DEBE definir un conjunto único de tokens de color y tipografía (ver `design-tokens.md`) y todas las pantallas DEBEN usarlo — no se permiten colores sueltos fuera de ese conjunto.
- **FR-002**: La PWA DEBE tener un icono propio en formato SVG, exportado en 192 px, 512 px y variante maskable, más un favicon.
- **FR-003**: El `manifest` DEBE declarar `name`, `short_name` ("PediTrack"), `theme_color` `#04252b`, `background_color` `#04252b` y los iconos de FR-002.
- **FR-004**: El `<title>` del documento DEBE ser "PediTrack" (hoy dice "frontend").
- **FR-005**: El logo DEBE aparecer en el header de la app, en la pantalla de registro y como icono/splash de la PWA; NO DEBE repetirse dentro del contenido de cada pantalla.
- **FR-006**: Toda pantalla DEBE tener un único botón de acción primaria sólido; las acciones secundarias DEBEN usar el estilo de contorno.
- **FR-007**: El estado de una toma DEBE distinguirse por color además del texto: confirmado (emerald) y pendiente (ámbar), con el texto siempre en tinta de contraste suficiente.
- **FR-008**: Todo texto DEBE cumplir un contraste mínimo de 4.5:1 contra su fondo (3:1 para texto de 24 px o mayor en peso 700+).
- **FR-009**: Todo control accionable en móvil DEBE medir al menos 44 px de alto.
- **FR-010**: Los modales DEBEN seguir un patrón único: encabezado con título y cierre, cuerpo, y fila de acciones alineada a la derecha (secundaria de contorno + primaria sólida); el modal de límite freemium DEBE conservar su franja de encabezado ámbar como señal de contexto de plan.
- **FR-011**: Los modales DEBEN conservar su comportamiento accesible actual (`aria-modal`, trampa de foco en `FreemiumLimitModal`, scroll interno del cuerpo en `ChildDetailPage`) — el rediseño NO DEBE alterarlo.
- **FR-012**: En viewports ≥ 900 px la app DEBE usar barra lateral de hijos + área de contenido; por debajo DEBE reflowar a una columna sin scroll horizontal.
- **FR-013**: Esta funcionalidad NO DEBE cambiar rutas, contratos de API, tipos de datos ni reglas de negocio — únicamente marcado y clases de Tailwind.
- **FR-014**: Las pruebas existentes DEBEN seguir pasando sin cambios de aserción salvo las que consultan texto o atributos que el rediseño renombra explícitamente; cualquier cambio de aserción DEBE quedar documentado en `tasks.md`.
- **FR-015**: El color NO DEBE usarse para emitir juicios médicos (Principio I): ámbar indica "sin marcar por el padre", nunca "dosis atrasada" ni advertencia clínica.

### Entidades Clave

*Sin entidades nuevas — esta funcionalidad no toca el modelo de datos.*

## Criterios de Éxito *(obligatorio)*

### Resultados Medibles

- **SC-001**: El 100% de los colores usados en `frontend/src` provienen de los tokens declarados en `index.css`.
- **SC-002**: La PWA instalada muestra icono, nombre corto y color de tema propios en iOS y Android.
- **SC-003**: Ninguna combinación texto/fondo de la app queda por debajo de 4.5:1 (3:1 para titulares ≥ 24 px y peso 700+).
- **SC-004**: Ningún viewport entre 320 px y 1920 px produce scroll horizontal.
- **SC-005**: El gate de cobertura (>90%) y los E2E de Playwright siguen en verde sin cambios de comportamiento.

## Supuestos

- La referencia visual aprobada es el mock `PediTrack Front-end.dc.html` y el tablero de logo `Logo PediTrack.dc.html` (opción 2a, cápsula partida) producidos en la sesión del 2026-09-18.
- Tailwind v4 sigue siendo el mecanismo de estilos (Principio III); los tokens se declaran en el bloque `@theme` de `frontend/src/index.css`, no en un archivo de configuración nuevo.
- Figtree ya está cargado en el proyecto y se conserva; el cambio tipográfico es de escala y peso (900 para titulares), no de familia.
- No se introducen librerías de componentes ni de iconos nuevas.

## Adiciones Futuras Previstas

Ítems que este sistema visual debe poder absorber sin rediseñarse. No entran en alcance aquí; cada uno se especifica por separado cuando se trabaje.

- **Curvas de crecimiento peso/talla (OMS)** — usar cyan brillante para la línea del niño y tinta base para las referencias; nunca colorear zonas como "bueno/malo" (Principio I).
- **Exportar y compartir el historial** — hereda el patrón de modal de FR-010; el documento exportado usa la misma paleta y Figtree.
- **Autenticación real** — pantalla de login con el mismo encabezado oscuro y logo de la pantalla de registro (ver BACKLOG.md).
- **Planes de pago** — la franja ámbar del modal de límite freemium es el punto de entrada visual ya establecido; la pantalla de planes debe continuarla.
- **Modo oscuro** — la base `#04252b` ya es la superficie oscura del sistema; requiere definir sus equivalentes de superficie y borde antes de implementarse.
- **Notificaciones de toma** — deben usar el color pendiente (ámbar) y texto neutro, sin lenguaje de alerta médica.
