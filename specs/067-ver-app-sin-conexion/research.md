# Investigación: Ver la app sin conexión (spec 067)

Hallazgos del código actual (2026-11-11) y decisiones. Cada una con su justificación y lo que se descartó.

## Lo que hay hoy

- `frontend/src/sw.ts` solo atiende `push` y `notificationclick`. `vite.config.ts` lo compila con `vite-plugin-pwa` (`injectManifest`, `injectionPoint: undefined`): **no hay precache**, sin red la app instalada muestra el error del navegador.
- `App.tsx` crea `new QueryClient()` con las opciones por omisión: las consultas y las mutaciones tienen `networkMode: 'online'`. **Una mutación hecha con `navigator.onLine === false` se pausa y se manda sola al volver la red** — una «etapa 2» escondida que esta spec no quiere (R7).
- `RequireSession` espera a `useAuth().isLoaded`. `@clerk/react` 6.16.1 baja `clerk-js` de la instancia de Clerk y consulta la sesión al servidor: sin red **nunca queda `ready`** (`useClerk().status` pasa a `'error'`) y la app se queda en «Cargando…».
- Las respuestas de datos viven solo en la memoria de TanStack Query. Llaves (`queryKey`): `['accounts','me']`, `['overview', sujeto, día]`, `['consultations', sujeto]`, `['consultation', id]`, `['routines', …, día]`, `['routine', id, …]`, `['appointments', …]`, `['cabinet', dueño]`, `['cabinet-item', id]`, `['cabinet-photo', id]`, `['vaccinations', hijo]`, `['vaccine-photos', hijo(, id)]`, `['growth' | 'growth-chart', hijo]`, `['history' | 'history-options', …]`, `['family']`, `['subscription', cuenta]`, `['reminders','config']`, `['device-links', hijo]`, `['child-device', …]`, `['catalog', …]`, `['invitation-preview']`.
- **El detalle de la consulta trae la foto dentro** (`photoBase64`); el botiquín y la cartilla piden las fotos aparte (`cabinet-photo`, `vaccine-photos` + id).
- `useLogout` y `useClearCacheOnUserChange` ya vacían la memoria al cerrar sesión o cambiar de usuario; el teléfono del hijo guarda solo su credencial (`childDevice/phone/storage.ts`).
- `useNewVersion` (spec 017) ya ignora en silencio un `/version.json` que no llega; `public/_headers` sirve `/version.json` con `no-store`.

## R1 — Precache del cascarón con Workbox, navegación «primero la red»

**Decisión**: `injectionPoint: 'self.__WB_MANIFEST'` y en `sw.ts`: `precacheAndRoute(self.__WB_MANIFEST)` (los archivos con hash del build: JS, CSS, iconos, `index.html`), `cleanupOutdatedCaches()` y una `NavigationRoute` con **`NetworkFirst` (espera máxima 3 s) que cae a `index.html` precacheado** solo si no hay red. `/version.json` queda fuera del precache y de toda ruta. Los dos archivos de Google Fonts se guardan con `StaleWhileRevalidate` en su propio caché (son del cascarón, no datos). Dependencias directas `workbox-precaching`, `workbox-routing`, `workbox-strategies` y `workbox-expiration` **7.4.1** (ya instaladas por `vite-plugin-pwa`; se fijan en `package.json`).
**Justificación**: con conexión la navegación sigue trayendo el `index.html` publicado, así «Actualizar» (spec 017) carga la versión nueva y no una guardada; sin red, el cascarón abre en milisegundos. Los archivos con hash nunca se confunden de versión.
**Alternativas**: `CacheFirst` para la navegación (descartada: «Actualizar» podría cargar el `index.html` viejo hasta que el nuevo service worker se active); escribir el precache a mano (descartada: Workbox ya está en el árbol y resuelve versiones y limpieza).

**Los avisos no cambian**: `push` y `notificationclick` siguen idénticos, incluido mostrar siempre una notificación (bugfix 061). El precache se instala en todos los dispositivos (es solo la app, sin datos de nadie); en una computadora sin red abre el cascarón y muestra «Necesitas conexión» (R4).

## R2 — Quién guarda datos: solo la app instalada en un teléfono (FR-012)

**Decisión**: `isInstalledPhone()` en `shared/offline/device.ts` = `matchMedia('(display-mode: standalone)').matches || navigator.standalone === true` **y** teléfono por agente de usuario (`navigator.userAgentData?.mobile === true`, o `/iPhone|Android.+Mobile/` en el agente). Una tableta, una computadora (aunque instale la app) y una pestaña del navegador del teléfono dan `false`: **no se escribe nada en el dispositivo** y todo funciona como hoy.
**Justificación**: es la decisión del dueño (Q1 = C). El ancho no cuenta: un teléfono girado que pasa al diseño web sigue guardando (caso límite de la spec).
**Alternativas**: decidir por ancho (descartado: mezclaría el criterio de diseño con el de privacidad); `pointer: coarse` (descartado: tabletas y laptops táctiles).

## R3 — Dónde y cómo se guarda: persistidor de TanStack sobre IndexedDB, por llave

**Decisión**: `@tanstack/react-query-persist-client` **5.102.8** (misma versión que `react-query`) con un persistidor propio sobre **IndexedDB** (`shared/offline/idbStore.ts`, sin `idb-keyval`): una base `peditrack-offline`, un almacén con **una entrada por consulta** (llave = `queryHash`) más una entrada `meta` con el dueño (R5). Se usa `persistQueryClientSubscribe`/`Restore` con `dehydrateOptions.shouldDehydrateQuery` = lista permitida (R6) y solo consultas en `success`.
**Justificación**: escribir por consulta evita reescribir todo el caché en cada respuesta (el detalle de una consulta puede pesar), y permite la retención por consulta (R8). IndexedDB es asíncrono y aguanta más que `localStorage`.
**Alternativas**: `PersistQueryClientProvider` con un solo blob (descartado: reescribe todo a cada cambio y la retención sería global, no «cada respuesta vuelve a contar los 7 días»); `localStorage` (descartado: síncrono, ~5 MB, bloquea el hilo); Cache Storage de respuestas HTTP en el service worker (descartado: las peticiones llevan el token de Clerk y la búsqueda es `POST`; la lista permitida y el borrado por cuenta son más claros en el cliente).
**Sin cifrado propio** (Supuesto de la spec): una llave en el mismo teléfono no protege más que el bloqueo del sistema.

## R4 — Abrir sin Clerk: la «sesión sin conexión»

**Decisión**: `RequireSession` y `HomeRoute` consultan `useOfflineSession()` (`shared/offline/`): si Clerk **no** está listo **y** (`navigator.onLine === false` **o** `useClerk().status === 'error'` **o** pasaron 4 s cargando) **y** `isInstalledPhone()` **y** hay datos guardados vigentes con un dueño, se entra en **modo sin conexión**: se pintan las pantallas con los datos guardados de ese dueño y sin pedir token. Sin datos guardados (o en una computadora) se muestra la pantalla «Necesitas conexión para abrir PediTrack» con «Reintentar» (contracts/ui.md §2). En cuanto Clerk queda `ready`: si hay sesión y es del mismo usuario, se sale del modo y se refresca; si no hay sesión o es otro usuario, **se borra todo lo guardado** (R5) y sigue el flujo de hoy (`/login`).
**Justificación**: sin red no hay forma de confirmar la sesión; la spec permite mostrar «los datos de la última sesión abierta en ese dispositivo» y prohíbe pedir iniciar sesión sin red. El teléfono ya está protegido por su bloqueo, y lo guardado expira a los 7 días.
**Alternativas**: guardar `clerk-js` en el service worker (descartado: igual consulta la sesión a Clerk y falla; además mete un script de terceros en el caché); esperar a Clerk indefinidamente (es el problema de hoy).

## R5 — Dueño de lo guardado y borrado (FR-011, FR-014)

**Decisión**: la entrada `meta` guarda `owner`: `user:<clerkUserId>` en la app de los padres o `child:<childId>` en el teléfono del hijo (leído de `phoneKey('me')`; nunca la credencial). Se borra **toda** la base cuando: `useLogout` (antes de `signOut`), `useClearCacheOnUserChange` detecta otro usuario o ninguno, Clerk queda `ready` sin sesión, el teléfono del hijo recibe 401/403 de su credencial (donde hoy se llama `clearCredential`), o al restaurar el dueño guardado no coincide con quien entra. Además, **por llave**: una respuesta 403 o 404 (`*not_found`, `no_access`, `forbidden`) de una consulta guardada la quita del caché y de la base (`removeQueries`), y cuando `['accounts','me']` llega con otra lista de hijos se quitan las llaves de hijos que ya no están.
**Justificación**: la regla es «solo lo que el servidor aún te da»; el servidor sigue decidiendo el acceso (spec 032).

## R6 — Lista permitida de lo que se guarda (FR-009, FR-010)

**Se guarda**: `accounts/me`, `overview`, `consultations`, `consultation` (**con `photoBase64` vaciado** y `photoOmitted: true` al deshidratar), `routines`, `routine`, `appointments`, `cabinet`, `cabinet-item` (sin foto), `vaccinations`, `vaccine-photos` **solo la lista de metadatos** (la llave de dos partes; nunca la de una imagen), `family` (el inicio y los perfiles compartidos la usan), `child-device` (`me`, `overview`, `activities`) y `catalog`.
**No se guarda**: `cabinet-photo`, la imagen de `vaccine-photos`, `history`, `history-options` (búsqueda: necesita al servidor), `growth`, `growth-chart`, `subscription`, `reminders`, `device-links`, `invitation-preview`, y cualquier llave nueva que no esté en la lista (la lista es de permitidos, no de prohibidos).
**Justificación**: FR-010 prohíbe fotos; lo que la spec no lista como pantalla sin conexión no se guarda. Una prueba revisa que ninguna entrada guardada contenga `photoBase64` con contenido ni un `data:image`.

## R7 — Nada se manda sin conexión (FR-007)

**Decisión**: `QueryClient` con `mutations: { networkMode: 'always' }` (una mutación sin red **falla**, nunca se pausa para mandarse después) y un **guardia central**: `MutationCache({ onMutate })` lanza `OfflineError` cuando `isOffline()` (modo sin conexión de R4 o `navigator.onLine === false`), antes de cualquier petición. `requestMark` (spec 066) revisa lo mismo **antes** de aplicar la marca optimista: sin red no cambia nada y empuja el aviso «Marcar necesita conexión.» en lugar de «No se guardó…». Los demás botones que guardan muestran el aviso común (contracts/ui.md §3) desde `MutationCache.onError` cuando el error es `OfflineError`; los formularios no se limpian porque la mutación nunca tuvo éxito.
**Justificación**: un solo lugar cubre todas las acciones presentes y futuras; con `networkMode: 'online'` el comportamiento actual ya sería una sincronización escondida.
**Alternativas**: deshabilitar cada botón (descartado: decenas de pantallas, fácil olvidar una; un botón deshabilitado no explica por qué).

## R8 — Retención de 7 días por respuesta (FR-013)

**Decisión**: cada entrada guarda `dataUpdatedAt` (cuándo la mandó el servidor). Al restaurar y cada hora mientras la app está abierta, se borran las entradas con más de **7 días** (`OFFLINE_MAX_AGE_MS`). Si al restaurar no queda ninguna, se borra el `meta` y el modo sin conexión muestra «Necesitas conexión».
**Justificación**: «cada respuesta nueva vuelve a contar los 7 días de lo que llega» = por entrada, no global.

## R9 — Hoy es otro día: la última respuesta guardada del mismo tipo

**Decisión**: las llaves de `overview` y `routines` llevan el día (`from.toISOString()`); sin red, el día de hoy no estará guardado. `useOfflineFallback(prefix)` busca, solo en modo sin conexión, la entrada guardada más reciente con el mismo prefijo sin el día (mismo sujeto y tipo) y la usa como `placeholderData`. El aviso (FR-004) dice el día de esos datos, y «Hoy» no se recalcula (FR-008).
**Justificación**: el caso de uso real (abrir la app al día siguiente en el consultorio) quedaría vacío sin esto.

## R10 — El aviso «Sin conexión · datos de las 08:15» y el estado de conexión

**Decisión**: `shared/offline/connectivity.ts` (registro en memoria con `useSyncExternalStore`): **sin conexión** cuando `navigator.onLine` es falso, una petición falla con `TypeError` de red o la app está en modo sin conexión (R4); **con conexión** con el evento `online` seguido de una petición que responde. `onlineManager` de TanStack se conecta a este registro para que las consultas se pausen y se reanuden solas al volver (FR-005). `OfflineBanner` (en `AppShell` y en `/hijo/hoy`) toma la hora de la respuesta **más vieja** de la pantalla (`dataUpdatedAt` de las consultas montadas) y la formatea con `formatTime` / `formatDateShortNoPad`.
**Justificación**: `navigator.onLine` solo dice si hay red local, no si el API responde; la falla real de una petición es la señal fiable.

## R11 — Las pantallas no se vacían al fallar (FR-006)

**Decisión**: las consultas guardables usan `retry` normal pero, con datos ya presentes, las pantallas deben pintar los datos aunque `isError`. Se revisan las pantallas de FR-002 (inicio, detalle del hijo, consulta, suplemento/actividad, perfil, botiquín, cartilla, teléfono del hijo) para que el estado de error **solo** aparezca cuando no hay datos. Una pantalla sin datos guardados y sin red muestra «Esta pantalla necesita conexión» (contracts/ui.md §4) en vez del error de carga.

## R12 — Pruebas

- **Unitarias** (Vitest + `fake-indexeddb` como dependencia de desarrollo, **6.2.7**, solo pruebas): lista permitida, vaciado de la foto, retención, dueño y borrado, `isInstalledPhone`, guardia de mutaciones, `requestMark` sin red, la sesión sin conexión con Clerk en `error`, el aviso y su hora, el respaldo del día anterior.
- **E2E** (`frontend/e2e/sin-conexion.spec.ts`): necesitan el **build** con service worker (`serviceWorkers: 'allow'` solo en esta prueba; la configuración actual los bloquea) y simular la app instalada en un teléfono: `addInitScript` que responde `true` a `matchMedia('(display-mode: standalone)')` y un `userAgent` de iPhone. A 390 px: usar con red, `context.setOffline(true)`, recargar, ver datos y aviso, tocar «Marcar» y ver «necesita conexión», volver la red y ver el refresco; cerrar sesión y comprobar que la base quedó vacía. A 1280 px (computadora): usar con red, cortar, recargar: «Necesitas conexión», y la base `peditrack-offline` no existe. En local corren contra `vite preview` del build (el modo de desarrollo no precachea).
- **Manual** (dueño, en un iPhone real con la app instalada): abrir en modo avión tras usarla; cerrar sesión y volver a abrir en modo avión.

## R13 — Aviso de privacidad

Guardar datos de salud en el teléfono debe agregarse al aviso de privacidad (pendiente del dueño, como en las specs 046/047/058). No se sube `CurrentDisclaimerVersion`: el aviso «Antes de empezar» habla de la foto y del OCR, no del almacenamiento; si el dueño quiere mencionarlo, es un cambio de texto aparte.

## Notas de la implementación (2026-11-11)

- **T014 (cliente del API)**: en lugar de cambiar los 19 `api.ts`, `installConnectivity()` envuelve una sola vez el `fetch` global (`trackedFetch`). Ese envoltorio hace dos cosas. Primero, rechaza con `OfflineError` **toda petición al API que no sea de lectura sin conexión**, antes de la red: eso cubre también las acciones que no usan `useMutation`. Segundo, reporta la red: un `TypeError` marca «sin conexión» y cualquier respuesta marca «con conexión». Tras una falla con el navegador en línea, revisa la conexión al momento (`GET /catalog/countries`) y después cada 10 s. Así una sola petición perdida no deja la app «sin conexión» (lo vio la E2E de la spec 066).
- **Borrar no crea la base**: `clearAll` borra la base completa (`deleteDatabase`), y ninguna limpieza abre IndexedDB fuera del teléfono instalado. La E2E a 1280 px lo detectó: limpiar al cambiar de sesión creaba una base vacía en la computadora.
- **T030**: el teléfono no deriva estados. `statusOf` solo usa el reloj cuando la toma **no trae** `status` (un servidor anterior a la spec 013), y lo guardado siempre lo trae.
- **T037**: no hizo falta `registration.update()`. La navegación va primero a la red, así que «Actualizar» recibe el `index.html` publicado, y sus archivos con hash nuevos se piden a la red porque no están en el precache viejo. Sin conexión, el aviso de versión no se muestra.
- **Memoria**: en el teléfono instalado las respuestas quedan un día en memoria (`gcTime`), no 5 minutos. Así una pantalla abierta otra vez sin señal sigue teniendo la copia restaurada al arrancar.
- **E2E**: `sin-conexion.spec.ts` solo corre contra la app compilada (`/sw.js` con la lista de precache). Con `npm run dev` se salta y lo dice. CI ya sirve el build.
