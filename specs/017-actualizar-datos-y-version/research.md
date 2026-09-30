# Investigación: Actualizar datos y versión de la app instalada

## R1 — ¿Cómo detectar una versión nueva? Un archivo `version.json`, no el service worker

**Decisión**: el build escribe `dist/version.json` (`{"version":"<id>"}`) y compila el mismo `<id>` en la app
(`__APP_VERSION__`). La app compara ambos al abrirse, al volver al primer plano (`visibilitychange`) y cada 10 min con la
app abierta; si difieren, muestra el aviso.

**Justificación**: el service worker de la spec 011 (`src/sw.ts`, `injectManifest` sin precache) **no cambia de bytes**
cuando solo cambia la app: el navegador solo detecta una actualización del worker si su archivo cambió, y hoy solo
importa `features/reminders/notification`. Un cambio en cualquier pantalla no dispararía nada. Además ya hace
`skipWaiting` + `clients.claim()`, así que «worker nuevo» no distingue una versión de la app. Un archivo aparte funciona
igual con o sin worker (las E2E bloquean los workers) y se prueba con un `page.route`.

**Alternativas**: (a) hacer que el worker cambie en cada build y escuchar `updatefound`/`controllerchange` — acopla la
detección a un worker que en E2E está bloqueado y en iOS se actualiza con retraso; (b) `registerType: 'prompt'` con
precache de todo — introduce precache y offline, fuera de alcance de la spec 011.

**Id de versión**: `GITHUB_SHA` o `CF_PAGES_COMMIT_SHA` si existen, si no la marca de tiempo del build. En desarrollo
(`vite dev`) es `dev` y, como no hay `version.json` real (el servidor devuelve el `index.html`), la respuesta que no es
JSON con `version` se ignora: sin aviso y sin error.

**Caché**: la petición va con `cache: 'no-store'` y `?t=<ms>`; `public/_headers` añade `Cache-Control: no-store` para
`/version.json` en Cloudflare Pages (DEPLOY.md).

## R2 — «Actualizar» = recargar; confirmar si hay datos sin guardar

**Decisión**: `window.location.reload()` tras tocar el botón. Un registro mínimo `unsavedWork` (módulo con un
contador/`Set` y `hasUnsavedWork()`) lo llena quien tenga un formulario sucio: hoy `NewConsultationPage` (ya calcula
`dirtyRef` para `confirmLeave`) y `AddChildModal`. Si hay, `window.confirm('¿Actualizar ahora? Se perderá lo que
capturaste.')`, la misma familia de `confirmLeave`. Nunca se recarga solo.

**Justificación**: reutiliza la regla que ya existe y no obliga a las pantallas a conocer el aviso. Sin librería de
estado.

## R3 — Dónde vive el aviso

**Decisión**: `AppShell` (pantallas con sesión) monta `UpdateNotice`; así no aparece en login/registro (caso límite de
la spec). Móvil: franja delgada fija abajo (`bottom` con `safe-area`), no tapa el contenido (`pb` del contenedor cuando
está visible); web: misma franja alineada a la derecha, con `max-w`. Dos árboles con `useIsDesktop`, como el resto.
Cuando hay un diálogo abierto el aviso queda por debajo (`z-40`, los diálogos `z-50`).

## R4 — Jalar para actualizar: eventos táctiles propios, sin librería

**Decisión**: hook `usePullToRefresh` montado una sola vez en `AppShell` **solo si `!useIsDesktop()`**; listeners de
`touchstart`/`touchmove` (no pasivo)/`touchend`/`touchcancel` en `document`.

- Arranca solo si `document.scrollingElement.scrollTop === 0`, no hay un `[aria-modal="true"]` en el documento y ningún
  ancestro del toque tiene `scrollTop > 0` (cuadros con su propio scroll).
- Solo cuenta el movimiento hacia abajo (`dy > 0`); mientras se jala se llama `preventDefault()` para que iOS no haga su
  rebote a la vez, y la distancia mostrada es `min(dy × 0.5, 72)`. Umbral de disparo: `dy ≥ 140` (72 px mostrados).
- Al soltar pasado el umbral: `queryClient.refetchQueries({ type: 'active' }, { throwOnError: true })`; el indicador
  queda fijo hasta terminar. Una sola a la vez (bandera). No recarga la página.
- Error: aviso breve «No pudimos actualizar. Revisa tu conexión.» (`Notice`, tono `error`, 4 s); las consultas
  conservan sus datos anteriores (TanStack los mantiene).
- `prefers-reduced-motion`: el indicador aparece sin transición ni giro.

**Alternativas**: `react-simple-pull-to-refresh` y similares (dependencia para ~60 líneas; el backlog pidió sin
librería); `overscroll-behavior` solo (no da el gesto, solo quita el rebote).

**Riesgo conocido**: en E2E el gesto se simula con `TouchEvent` sintéticos en un contexto `hasTouch`; se valida en
Chromium y en el iPhone real por el túnel (quickstart), no se promete la fidelidad de WebKit desde Playwright.
