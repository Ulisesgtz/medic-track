# Contrato de interfaz — Unir y ocultar hijos

Hecho **tal cual** del mock de Claude Design (`referencia/Unir hijos duplicados PediTrack.dc.html`, estados A–H, teléfono
390 px y web 1280 px, dos diseños con `useIsDesktop`, nunca mezclados). Desviaciones y su motivo en
`referencia/desviaciones.md`. Todas las pantallas necesitan conexión (`RequireConnection`). Código en
`frontend/src/features/family/merge/`; **todas las frases** en `mergeText.ts` (con su prueba de redacción).

## Rutas

| Ruta | Qué | Quién |
|---|---|---|
| `/familia/como-seguir` | A (y A2 para Cuidador), F «Quedan los dos registros» | integrante recién aceptado con hijos propios (`HowToContinuePage`) |
| `/familia/unir` | B → C → D → E1/E2/E3 (`MergeFlow`) | `canMerge` (Tutor de familia de pago con hijos propios y de la familia); si no, redirige a `/familia` |

Ambas en `App.tsx` (con `RequireSession` y `RequireConnection`) y en `shared/clientErrors/routePatterns.ts`.

`InvitationPage`: tras aceptar, si la cuenta tiene hijos propios (los de `accountId` propio, leídos de `['accounts','me']`
ya refrescado) y el rol es Tutor o Cuidador → `/familia/como-seguir` (`replace`); si no, `/home` como antes. Cerrar o «atrás»
desde A no guarda nada (= «Conservar ambas»).

## Pantallas

- **A / A2** (`HowToContinuePage`): encabezado «FAMILIA DE ANA / ¿Cómo quieres seguir?» sin «←»; tarjeta de dos columnas con
  los hijos de cada lado; tres tarjetas-radio (`ChoiceCard`: borde de tinta de 2 px y marca en el círculo) y «Continuar»,
  deshabilitado hasta elegir (dice por qué). Un Cuidador no ve «Unir» (`canMerge: false`). «Unir» → `/familia/unir`; «Usar solo
  lo de la familia» → `PUT /accounts/{id}/hidden-children` con todos los propios → `/home`; «Conservar ambas» → F sin escribir
  nada.
- **B / B2** (`PairsStep`): una tarjeta por hijo propio con «Tuyo», sus conteos y `<select>` «Es el mismo que…»
  (sugerencia preseleccionada con la pastilla «Se llaman igual» y «Es una sugerencia; puedes cambiarla.»; «No es ninguno»; un
  hijo de la familia ya elegido queda deshabilitado con «Ya lo elegiste en tu …»). Web: tarjetas en dos columnas y «1 pareja ·
  1 sin pareja» junto a «Continuar». «Continuar» pide la vista previa (`POST /family/merges/preview`).
- **C / C2** (`DifferencesStep`): una pareja a la vez, solo los datos de `differences`, «El tuyo» antes de «El de la familia»,
  ninguno elegido; contador «N de M elegidos»; nota de que alergias y padecimientos se juntan (si ambos tienen ficha).
- **D / D2** (`SummaryStep`): «Se unen» con «Mateo (tuyo) → Mateo (familia)» y los conteos (`moves`), «Quedará con 12
  suplementos activos» y el aviso celeste de tope (`overLimits`), los no emparejados («No se une. Sigue como está.»), la caja de
  tinta «Todo pasa a la familia de Ana…» con la línea del teléfono del hijo (`devicesRemoved`), `recordTooLong` con «Abrir la ficha»
  (bloquea «Unir»). Barra: «Descargar mis datos» (contorno, spec 070) y «Unir» (el único sólido).
- **E1 / E2 / E3** (`ResultStep`): «Uniendo a Mateo» (barra sin porcentaje), «Se unió Mateo» + «Ahora está en la familia de Ana con
  sus …» + «Ir al inicio», «No se pudo unir» + «No cambió nada…» + «Intentar de nuevo» (solo las parejas que fallaron) y «Volver
  al resumen». Las opciones se congelan al empezar (la unión cambia lo que leen).
- **F**: «Quedan los dos registros» + dónde unirlos después; «Ir al inicio» (+ «Ver Familia» en la web).
- **G** (`MergedLine`): «Se unió el 3 dic con el registro de Laura» en gris de 13 px al final del contenido del hijo (teléfono)
  y bajo «Hoy» (web), de `child.merges`; sin `byFirstName`, «Se unió el 3 dic».
- **H1** (`HiddenChildren`, en `AccountPage`): «Hijos ocultos» con conteos (de `merge-options`) y «Volver a mostrar a …»; la
  nota de que entran en «Descargar todos mis datos».
- **H2 / H3** (`OwnChildrenSection`, en `FamilyPage`): «Tus hijos y los de la familia» con «Unir con un hijo de la familia» (solo
  Tutor de familia de pago) y «Ocultar mis hijos» / «Volver a mostrar mis hijos»; nada para la dueña ni un integrante Hijo; el
  Cuidador solo oculta.
- **Barra lateral web**: «Tuyo» / «Familia» en lugar de la edad mientras haya hijos propios y de la familia a la vez
  (`showsOwnership`).

## Textos fijos (`mergeText.ts`, prueba de redacción)

- La sugerencia: «Se llaman igual». Nunca «el correcto», «el bueno», «recomendado», «parece el mismo»; sin felicitaciones.
- Advertencia del resumen: «Todo pasa a la familia de Ana. Si después sales de la familia, no te llevas copia. Esto no se puede
  deshacer.»
- Error: «No se pudo unir. No cambió nada.»
- Sin rojo ni ámbar de alarma (la prueba lee las fuentes de la carpeta).

## Después de unir

`useMergeChildren` invalida `['accounts','me']` y `['family']` y borra las llaves del hijo propio (memoria y copia sin conexión);
la pantalla E2 sigue con las opciones congeladas y «Ir al inicio» lleva a `/home`.
