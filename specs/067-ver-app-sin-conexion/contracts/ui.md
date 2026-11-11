# Contrato de interfaz: Ver la app sin conexión (spec 067)

Sin mock: se hace con el sistema visual (`specs/005-identidad-visual-front-end/design-tokens.md`). **Los textos de este archivo son la propuesta para que el dueño los apruebe**; viven en `frontend/src/shared/offline/offlineText.ts`. Ninguno usa rojo, «error» ni habla de la salud (Principio I, FR-020).

## 1. Aviso de sin conexión (`OfflineBanner`)

- **Cuándo**: mientras el estado de conexión es «sin conexión» y la pantalla muestra datos guardados (FR-004).
- **Texto**:
  - Datos de hoy: «Sin conexión · datos de las 08:15»
  - Datos de otro día: «Sin conexión · datos del 10 nov, 21:40»
  - La hora es la de la respuesta **más vieja** de la pantalla.
- **Dónde**:
  - Teléfono: una franja fija arriba, debajo del área segura, con el tono `hint` (fondo `bg-hint`, borde `border-hint-border`, texto `text-ink`), 14 px, altura mínima 36 px; no tapa el «← …» del encabezado (empuja el contenido).
  - Web (teléfono girado): la misma franja arriba de la columna de contenido.
- **Accesibilidad**: una región `aria-live="polite"` (no `role="status"`: las pantallas ya tienen sus propios estados, igual que el aviso de la spec 066); se anuncia al aparecer.
- **Al volver la conexión**: desaparece cuando llegan datos nuevos; no muestra un «ya hay conexión».

## 2. Abrir sin datos guardados (`OfflineGate`)

- **Cuándo**: sin conexión y sin datos guardados vigentes (primera vez, después de cerrar sesión, más de 7 días, o en una computadora).
- **Pantalla** (centrada, logo de PediTrack arriba):
  - Título: «Necesitas conexión para abrir PediTrack»
  - Texto: «Cuando tengas señal, abre la app y lo que veas quedará disponible en este teléfono por 7 días.» En una computadora: «Cuando tengas conexión, vuelve a abrir esta página.»
  - Botón: «Reintentar» (vuelve a intentar la carga).

## 3. Acción que necesita conexión (`ConnectionNotice`, el mismo lugar que `MarkNotice` de la spec 066)

- **Cuándo**: se toca algo que guarda o cambia datos sin conexión (FR-007). Nada cambia en pantalla.
- **Textos**:
  - Marcar, quitar la marca, «✓ Realizado»: «Marcar necesita conexión. Tu marca no se guardó.»
  - Cualquier otra acción (guardar, crear, editar, finalizar, recorrer, borrar, invitar, activar avisos): «Esto necesita conexión. Lo que escribiste sigue aquí.»
- **Comportamiento**: igual que el aviso de la spec 066 (una línea, «Cerrar», se va al cambiar de pantalla); si ya hay uno igual no se repite.

## 4. Pantalla que nunca se vio (`OfflineMissing`)

- **Cuándo**: sin conexión, una ruta cuyos datos no están guardados (FR-003), o una de las que siempre necesitan al servidor (historial, exportar PDF, crecimiento, planes, familia para invitar).
- **Contenido** dentro del `AppShell`, en el lugar de la página: «Esta pantalla necesita conexión.» y un enlace «← Volver» (al inicio si no hay historial).

## 5. Foto guardada sin conexión

- **Cuándo**: el detalle de una consulta guardada con `photoOmitted: true`, o la foto de un medicamento del botiquín o de la cartilla, sin conexión.
- **Contenido**: el marco de la foto con el texto «La foto necesita conexión.» en `text-muted`; sin icono de alerta.

## 6. Lo que no cambia

- «Hay una versión nueva · Actualizar» (spec 017): igual con conexión; sin conexión no aparece.
- Los avisos push y su acción «Tomada» (spec 011): sin cambios.
- Jalar hacia abajo (spec 017) sin conexión: la pantalla no se vacía y el aviso de §1 sigue.
- «No se guardó la marca…» (spec 066) sigue para una falla **con** conexión; sin conexión gana el texto de §3, y la marca nunca se pinta.
