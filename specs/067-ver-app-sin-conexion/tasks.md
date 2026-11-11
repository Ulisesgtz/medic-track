# Tareas: Ver la app sin conexión (etapa 1, solo lectura)

**Entrada**: `specs/067-ver-app-sin-conexion/` — spec.md, plan.md, research.md (R1–R13), data-model.md, contracts/ui.md y quickstart.md. Sin mock.

**Pruebas**: obligatorias (constitución, Principio VI): Vitest con más del 90 %, E2E a 390 px como app instalada y a 1280 px como computadora, y prueba manual en un iPhone real.

**Rama**: `feature/067-ver-app-sin-conexion`. Se hace commit solo cuando el dueño lo pida.

**Estado (2026-11-11)**: implementado. Pruebas unitarias en verde (1978, 97.4 % de líneas). E2E en local contra la app compilada: `sin-conexion` (4) y la suite completa en Chromium (408). Las que fallaron se explicaron: dos de «Inicio» eran una carrera de la prueba de la spec 066, ya corregida; `planes-pago` falló porque el build local no traía `VITE_PAYMENTS_FAKE`, como sí lo hace CI; las demás pasaron al repetirlas. Capturas a 390 y 1280 px. Falta la prueba del dueño en un iPhone real (quickstart §7).

**Reglas que valen para todas las tareas**:
- Solo `frontend/`. Ningún archivo de `backend/` cambia.
- **Solo la app instalada en un teléfono guarda datos** (FR-012, research R2). En una computadora o en una pestaña sin instalar no se abre `peditrack-offline`.
- **Nada se manda ni se pinta como guardado sin conexión** (FR-007, R7). Los estados de las tomas son los del servidor (FR-008).
- **Nunca se guarda una foto** (FR-010): ni `photoBase64` con contenido ni `data:image`.
- Los textos salen de `frontend/src/shared/offline/offlineText.ts` (contracts/ui.md). Sin rojo, sin «error» y sin palabras sobre la salud (Principio I).
- Los dos diseños siguen separados (`useIsDesktop`). No hay `lg:` que los mezcle.
- Los datos pasan por el teléfono del usuario, nunca por terceros: Clerk, `/version.json` y las llamadas al API **no** entran a Cache Storage.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: puede hacerse en paralelo (otro archivo, sin depender de una tarea pendiente).

---

## Fase 1: Configuración

- [X] T001 Agregar dependencias con versión exacta en `frontend/package.json` y el lockfile:
  - `@tanstack/react-query-persist-client` `5.102.8`
  - `workbox-precaching`, `workbox-routing`, `workbox-strategies` y `workbox-expiration` `7.4.1`
  - en `devDependencies`, `fake-indexeddb` `6.2.7`

  Después: `npm install` y `npx tsc -b` limpio.
- [X] T002 [P] Crear `frontend/src/shared/offline/offlineText.ts` con todos los textos de contracts/ui.md:
  - `bannerToday(hhmm)` → «Sin conexión · datos de las 08:15»
  - `bannerOtherDay(fecha, hhmm)` → «Sin conexión · datos del 10 nov, 21:40» (con `formatDateShortNoPad` y `formatTime` de `shared/date`)
  - `GATE_TITLE`, `GATE_BODY_PHONE`, `GATE_BODY_COMPUTER`, `RETRY`
  - `MARK_NEEDS_CONNECTION`, `ACTION_NEEDS_CONNECTION`
  - `SCREEN_NEEDS_CONNECTION`, `BACK`, `PHOTO_NEEDS_CONNECTION`

  Prueba en `offlineText.test.ts`: las fechas, y que ningún texto contenga «error», «falló» ni palabras de salud.

---

## Fase 2: Fundamental (bloquea todas las historias)

### El cascarón (R1)

- [X] T003 En `frontend/vite.config.ts`, cambiar `injectManifest: { injectionPoint: undefined }` por `injectionPoint: 'self.__WB_MANIFEST'`, con `globPatterns` para js, css, html, png, svg, ico, webmanifest y woff2.
  - **Excluir** `version.json`, `/hijo` y lo que no sea del build.
  - Actualizar el comentario que dice «no precache».
- [X] T004 En `frontend/src/sw.ts`, agregar:
  - `precacheAndRoute(self.__WB_MANIFEST)` y `cleanupOutdatedCaches()`;
  - una `NavigationRoute` con `NetworkFirst` (`networkTimeoutSeconds: 3`, caché `pages`) que, si falla, responde `index.html` del precache (`matchPrecache('/index.html')`);
  - una ruta `StaleWhileRevalidate` para `fonts.googleapis.com` y `fonts.gstatic.com` (caché `google-fonts`, `ExpirationPlugin` con `maxEntries: 10`).

  Ninguna ruta para el API, `/version.json` ni los dominios de Clerk. **No tocar** `push` ni `notificationclick`: todo aviso se sigue mostrando (bugfix 061). Mover la lógica a funciones puras en `frontend/src/shared/offline/swRoutes.ts`, con su prueba `swRoutes.test.ts`: qué URL va a qué estrategia y que el API y `version.json` no van a ninguna.
- [X] T005 Verificar que el build genera el manifiesto de precache (`npm run build`, que `dist/sw.js` contiene la lista) y que siguen en verde `e2e/recordatorios.spec.ts` y `e2e/actualizar.spec.ts`.

### Dónde se guarda (R2, R3, R6, R8; data-model.md)

- [X] T006 [P] Crear `frontend/src/shared/offline/device.ts`.
  - `isInstalledPhone()`: verdadero solo si se cumplen las dos condiciones:
    - `matchMedia('(display-mode: standalone)').matches` o `navigator.standalone === true`;
    - y `navigator.userAgentData?.mobile === true` o el agente cumple `/iPhone|Android.+Mobile/`.
  - Todo va en `try/catch` y, si algo falla, es falso. El ancho no cuenta.
  - Pruebas en `device.test.ts`: iPhone instalado, Android instalado, iPhone en pestaña, iPad, computadora instalada y `matchMedia` ausente.
- [X] T007 [P] Crear `frontend/src/shared/offline/idbStore.ts`, sobre IndexedDB directo (sin `idb-keyval`).
  - Base `peditrack-offline`, versión 1, almacén `queries`, llave `queryHash`.
  - Funciones: `readAll()`, `put(entry)`, `remove(queryHash)`, `readMeta()`, `writeMeta({ owner, schema: 1, buildId })` (llave `__meta__`) y `clearAll()`.
  - Toda falla (abrir, cuota, modo privado) se traga y devuelve vacío o `false`.
  - Pruebas en `idbStore.test.ts` con `fake-indexeddb`.
- [X] T008 [P] Crear `frontend/src/shared/offline/persistPolicy.ts`.
  - `OFFLINE_MAX_AGE_MS = 7 * 24 h`.
  - `PERSISTED_ROOTS` con la lista permitida de R6: `accounts`, `overview`, `consultations`, `consultation`, `routines`, `routine`, `appointments`, `cabinet`, `cabinet-item`, `vaccinations`, `vaccine-photos` (solo la llave de 2 partes), `family`, `child-device` y `catalog`.
  - `shouldPersist(queryKey, state)`: solo `status === 'success'` y raíz permitida. **No** permite `cabinet-photo`, `vaccine-photos` con id, `history`, `history-options`, `growth`, `growth-chart`, `subscription`, `reminders`, `device-links`, `invitation-preview` ni una llave desconocida.
  - `stripForStorage(queryKey, data)`: en `consultation`, `photoBase64` → `''` y `photoOmitted: true` si tenía foto. En cualquier llave, quita todo campo de texto que empiece por `data:image`.
  - `isExpired(dataUpdatedAt, now)`.
  - Pruebas en `persistPolicy.test.ts`: tabla de llaves permitidas y prohibidas, foto vaciada, y que ningún resultado de `stripForStorage` contiene `data:image` ni `photoBase64` con contenido.
- [X] T009 Crear `frontend/src/shared/offline/persistence.ts` (depende de T006–T008).
  - **`startPersistence(queryClient, owner)`**, solo si `isInstalledPhone()`:
    - se suscribe al `QueryCache` y, ante cada `success` permitido, escribe `put({ queryHash, queryKey, data: stripForStorage(...), dataUpdatedAt })` por entrada;
    - ante una consulta quitada del caché, hace `remove`;
    - ante un error con `kind` 403/404 (`forbidden`, `*not_found`, `no_access`) de una llave guardada, hace `queryClient.removeQueries` de esa llave y `remove`;
    - escribe el `meta` con el dueño;
    - devuelve una función para dejar de escuchar.
  - **`restoreSnapshot(queryClient, now)`**:
    - lee el `meta` y descarta todo si `schema !== 1`;
    - borra lo vencido (`isExpired`);
    - si no queda nada, `clearAll()` y devuelve `null`;
    - si queda algo, siembra el caché con `setQueryData(queryKey, data, { updatedAt: dataUpdatedAt })` y devuelve `{ owner, oldestUpdatedAt }`.
  - **`pruneExpired()`** cada hora y **`wipeOffline(queryClient)`** (`clearAll()` + `queryClient.clear()`).
  - **`pruneRemovedChildren(queryClient, account)`**: borra las llaves con un `childId` que ya no está en `account.children`.
  - Pruebas en `persistence.test.ts`:
    - no escribe nada si no es teléfono instalado;
    - escribe solo lo permitido y sin foto;
    - un 403 o 404 borra la entrada;
    - la retención es por entrada (una de 8 días se va, una de 1 día se queda);
    - `schema` distinto borra todo;
    - `wipeOffline` deja la base vacía.

### Nada se manda sin conexión (R7)

- [X] T010 [P] Crear `frontend/src/shared/offline/connectivity.ts`. Es un registro en memoria con `useSyncExternalStore`, con el estado `online | offline`:
  - `offline` si `navigator.onLine` es falso, si se llama `reportNetworkFailure()` (un `TypeError` de `fetch`) o si `setOfflineSession(true)`;
  - `online` con el evento `online` más `reportReachable()` (una respuesta del API llegó).

  Exporta `isOffline()`, `useConnectivity()` y `connectOnlineManager()`, que conecta `onlineManager.setEventListener` de TanStack a este registro para que las consultas se pausen y se reanuden solas (FR-005). Pruebas en `connectivity.test.ts`.
- [X] T011 Crear `frontend/src/shared/offline/offlineGuard.ts`.
  - `class OfflineError extends ApiError<'offline'>`.
  - `guardMutation()` lanza `OfflineError` si `isOffline()`.
  - `notifyIfOffline(error, kind)` empuja el aviso de contracts/ui.md §3 por el mismo registro de avisos de la spec 066 (`shared/marks/markNotices.ts`, `pushMarkNotice`). Hay una sola línea por tipo y no se repite.

  Pruebas en `offlineGuard.test.ts`.
- [X] T012 En `frontend/src/App.tsx`, crear el `QueryClient` con:
  - `defaultOptions.mutations.networkMode: 'always'`, para que una mutación sin red **falle y nunca se pause para mandarse después**;
  - un `MutationCache({ onMutate: guardMutation, onError: (e) => notifyIfOffline(e, 'action') })`.

  Agregar una prueba en `frontend/src/shared/offline/queryClient.test.ts` (exportar la fábrica `createQueryClient()` desde `frontend/src/shared/offline/queryClient.ts` y usarla en `App.tsx`):
  - sin conexión, una mutación no llama a su `mutationFn`;
  - al volver la red no se manda sola;
  - el aviso «Esto necesita conexión…» aparece una vez.
- [X] T013 En `frontend/src/shared/marks/requestMark.ts`, al inicio:
  - si `isOffline()`, **no** se llama a `setDesired`, la toma no cambia, se empuja `MARK_NEEDS_CONNECTION` y se sale;
  - con conexión todo sigue como en la spec 066 («No se guardó…» para una falla con red).

  Ampliar `frontend/src/shared/marks/marks.test.ts`: sin conexión no hay marca pendiente, no hay petición y aparece el aviso.
- [X] T014 En el `fetch` del cliente del API, reportar la conectividad: un `TypeError` llama a `reportNetworkFailure()` y cualquier respuesta HTTP llama a `reportReachable()`.
  - Si hay un envoltorio común, va en él. Si no, se crea `frontend/src/shared/offline/trackedFetch.ts`, y los `api.ts` de cada feature lo usan en lugar de `fetch`; el cambio es mecánico.
  - Prueba en `trackedFetch.test.ts`.

**Punto de control**: el cascarón se precachea, lo permitido se guarda solo en el teléfono instalado y ninguna acción sale sin red.

---

## Fase 3: Historia de Usuario 1 — La app abre sin señal y muestra lo último que vi (P1) 🎯 MVP

**Objetivo**: en el teléfono instalado, sin red, la app abre con los datos de la última vez y el aviso con su hora (FR-001 a FR-006).

**Prueba independiente**: usar la app con red y abrir inicio, hijo y consulta. Cortar la red y recargar: abre con esos datos y con «Sin conexión · datos de las HH:MM». Volver la red: los datos se actualizan solos.

- [X] T015 [US1] Crear `frontend/src/shared/offline/offlineSession.ts`.
  - **`useOfflineSession()`**: devuelve `{ mode: 'clerk' | 'offline' | 'gate' }`.
    - `offline` si Clerk no está `ready` y además:
      - `navigator.onLine === false`, `useClerk().status === 'error'` o pasaron 4 s cargando;
      - `isInstalledPhone()`;
      - `restoreSnapshot` devolvió datos.
    - `gate` en esas mismas condiciones de Clerk, pero sin datos o fuera del teléfono instalado.
    - `clerk` en cuanto Clerk queda `ready`.
  - Al pasar a `offline`, llama a `setOfflineSession(true)`. Al pasar a `clerk`:
    - si hay sesión y `user:<userId>` coincide con el dueño guardado, sale del modo y llama a `invalidateQueries()`;
    - si no hay sesión o el usuario es otro, llama a `wipeOffline(queryClient)`.
  - Pruebas en `offlineSession.test.tsx`, con Clerk simulado en `loading`, `error` y `ready` y con usuario igual o distinto.
- [X] T016 [US1] Crear `frontend/src/shared/offline/OfflineGate.tsx` («Necesitas conexión para abrir PediTrack», contracts/ui.md §2).
  - Lleva el logo, el texto del teléfono o de la computadora según `isInstalledPhone()` y el botón «Reintentar», que hace `location.reload()`.
  - Tiene un diseño por viewport con `useIsDesktop`.
  - Prueba en `OfflineGate.test.tsx`.
- [X] T017 [US1] En `frontend/src/features/auth/RequireSession.tsx` y en `HomeRoute` de `frontend/src/App.tsx`, usar `useOfflineSession()`:
  - `offline` → renderiza los hijos sin pedir token;
  - `gate` → `<OfflineGate />`;
  - `clerk` → el comportamiento de hoy.

  Ningún hook de lectura debe pedir `getToken()` en modo sin conexión: las consultas quedan pausadas por `onlineManager` y se ven los datos sembrados. Actualizar `RequireSession.test.tsx`.
- [X] T018 [US1] En `frontend/src/App.tsx`, después de que Clerk confirma la sesión, llamar a `startPersistence(queryClient, 'user:' + userId)` y a `pruneExpired` cada hora. También `pruneRemovedChildren` cuando cambia `['accounts','me']`.
  - Al arrancar, solo en un teléfono instalado, llamar a `restoreSnapshot` antes de pintar las rutas, para que el modo sin conexión tenga datos.
  - Además, `connectOnlineManager()` una vez.
- [X] T019 [P] [US1] Crear `frontend/src/shared/offline/OfflineBanner.tsx` (contracts/ui.md §1).
  - Se muestra si `useConnectivity() === 'offline'` y la pantalla tiene datos.
  - La hora es el `dataUpdatedAt` más viejo de las consultas activas guardables (`queryClient.getQueryCache().findAll({ type: 'active' })` filtrado con `shouldPersist`).
  - Si no es de hoy, usa `bannerOtherDay`.
  - Lleva `role="status"` y `aria-live="polite"`, franja `bg-hint` y `border-hint-border` con `text-ink`, de 14 px y altura mínima de 36 px, y empuja el contenido.
  - Pruebas en `OfflineBanner.test.tsx`: hoy, otro día, se oculta con conexión y elige la hora más vieja.
- [X] T020 [US1] Montar `<OfflineBanner />` en `frontend/src/features/home/AppShell.tsx`, arriba del contenido en los dos diseños, antes de `<MarkNotice />` y `<UpdateNotice />`. Actualizar su prueba.
- [X] T021 [P] [US1] Crear `frontend/src/shared/offline/useOfflineFallback.ts` (R9).
  - `useOfflineFallback(prefix)`: solo en modo sin conexión, devuelve los datos de la entrada del caché más reciente cuya llave empieza con `prefix`, es decir, el mismo sujeto y tipo sin el día. Sirve como `placeholderData`.
  - Pruebas en `useOfflineFallback.test.tsx`: con conexión no devuelve nada; sin conexión elige la más reciente.
- [X] T022 [US1] Usar `useOfflineFallback` como `placeholderData` en las lecturas con día:
  - `overview` en `frontend/src/features/consultations/ChildDetailPage.tsx`, `frontend/src/features/home/useChildDay.ts` y `frontend/src/features/profile/hooks.ts`;
  - `routines` en `frontend/src/features/supplements/hooks.ts`;
  - el overview y las actividades de `frontend/src/features/childDevice/phone/hooks.ts`.

  Va dentro de `useShownQuery` (spec 066), sin romperlo.
- [X] T023 [P] [US1] Crear `frontend/src/shared/offline/OfflineMissing.tsx` (contracts/ui.md §4): «Esta pantalla necesita conexión.» con «← Volver» (`navigate(-1)` o `/home` si no hay historial). Prueba en `OfflineMissing.test.tsx`.
- [X] T024 [US1] Pantallas con datos aunque la petición falle (FR-006, R11). El error solo se muestra si **no** hay datos; sin datos y sin conexión, `<OfflineMissing />`.
  - Pantallas:
    - `frontend/src/features/home/HomePage.tsx`
    - `frontend/src/features/consultations/ChildDetailPage.tsx`
    - `frontend/src/features/consultations/ConsultationDetailPage.tsx`
    - `frontend/src/features/supplements/RoutineDetailPage.tsx`
    - `frontend/src/features/profile/ProfilePage.tsx`
    - `frontend/src/features/profile/SharedProfilePage.tsx`
    - `frontend/src/features/medicineCabinet/CabinetPage.tsx`
    - `frontend/src/features/medicineCabinet/CabinetItemPage.tsx`
    - `frontend/src/features/vaccinations/VaccinationCardPage.tsx`
  - Una prueba por pantalla en su `*.test.tsx`: con datos y un error de red se ven los datos; sin datos y sin conexión se ve el mensaje.
- [X] T025 [US1] Las pantallas que siempre necesitan al servidor muestran `<OfflineMissing />` sin conexión: Historial (`/children/:id/historial`, `/yo/historial`), el panel de exportar PDF, Crecimiento (`/children/:id/crecimiento`), Planes (`/planes`) y Familia (`/familia`).
  - Se usa un pequeño `RequireConnection` en `frontend/src/shared/offline/RequireConnection.tsx` alrededor de esas rutas en `frontend/src/App.tsx`.
  - Pruebas en `RequireConnection.test.tsx`.
- [X] T026 [US1] Jalar hacia abajo sin conexión (`frontend/src/shared/pullToRefresh/usePullToRefresh.ts`): no vacía la pantalla ni muestra error, solo termina la animación. Actualizar su prueba.

**Punto de control**: el MVP. La app instalada abre sin señal con los datos y el aviso, y nada está roto con conexión.

---

## Fase 4: Historia de Usuario 2 — Sin conexión nada parece guardarse (P1)

**Objetivo**: ninguna acción se manda ni se pinta sin red, y cada una lo dice (FR-007, FR-008).

**Prueba independiente**: sin red, tocar «Marcar», «✓ Realizado», «Nueva consulta» → «Guardar», «Editar», «Finalizar» y «Activar avisos». Nada cambia, aparece el aviso y lo escrito sigue.

- [X] T027 [US2] En `frontend/src/features/supplements/hooks.ts` (`useMarkDone`, con su toma optimista de la spec 066) y en el `useDone` de `frontend/src/features/childDevice/phone/hooks.ts`, revisar que el camino sin conexión de `requestMark` (T013) cubre «✓ Realizado». Si `useMarkDone` manda sin `requestMark` cuando no hay toma optimista, agregar la misma salida temprana.
  - Pruebas en `frontend/src/features/supplements/hooks.test.tsx`, o en el archivo de pruebas existente de esos hooks.
- [X] T028 [US2] Los formularios no pierden lo escrito (FR-007). Revisar que `ConsultationForm`, `RoutineFormPage`, `AppointmentFormPage`, `CabinetFormPage`, `GrowthFormPage` y `EditChildPage` no limpian ni navegan en `onError`.
  - Agregar una prueba en `frontend/src/features/consultations/NewConsultationPage.test.tsx`: sin conexión, «Guardar» deja los campos llenos y muestra «Esto necesita conexión…».
- [X] T029 [US2] La foto omitida en `frontend/src/features/consultations/ConsultationDetailPage.tsx`: con `photoOmitted === true`, el marco de la foto dice «La foto necesita conexión.» (`text-muted`, sin icono de alerta) en lugar de ocultarse.
  - Igual en la foto de `CabinetItemPage.tsx` y en las fotos de la cartilla en `VaccinationCardPage.tsx` cuando su consulta de imagen falla sin conexión.
  - Pruebas en sus `*.test.tsx`.
- [X] T030 [US2] Revisar que, en modo sin conexión, ninguna pantalla deriva estados con el reloj del teléfono (FR-008).
  - Buscar usos de `doseStatus`, `canUnmarkDose` y comparaciones con `Date.now()` que cambien el `status` mostrado.
  - Documentar en `research.md` que no hay ninguno, o corregirlo.

**Punto de control**: con las Fases 3 y 4, el teléfono instalado se puede usar sin red sin riesgo de una dosis doble.

---

## Fase 5: Historia de Usuario 3 — Lo guardado es solo mío y se borra (P1)

**Objetivo**: solo lo ya visto, sin fotos, solo en el teléfono instalado y borrado al salir (FR-009 a FR-015).

**Prueba independiente**: con datos guardados, cerrar sesión: la base queda vacía. Con otra cuenta no se ve nada de la anterior. En la computadora no existe la base.

- [X] T031 [US3] En `frontend/src/features/auth/useLogout.ts`, llamar a `wipeOffline(queryClient)` **antes** de `signOut`, aunque falle la red.
  - En `frontend/src/features/auth/useClearCacheOnUserChange.ts`, al cambiar de usuario o al quedar sin sesión, `wipeOffline` en lugar de solo `queryClient.clear()`.
  - Actualizar `useLogout.test.tsx` y `useClearCacheOnUserChange.test.tsx`.
- [X] T032 [US3] La sesión que venció al volver la red: cuando Clerk queda `ready` sin sesión, `offlineSession` llama a `wipeOffline` (T015) y `RequireSession` manda a `/login`. Prueba en `offlineSession.test.tsx`.
- [X] T033 [US3] Prueba de privacidad en `frontend/src/shared/offline/privacy.test.ts`, que recorre todo lo escrito en `fake-indexeddb` después de sembrar respuestas reales de ejemplo (consulta con foto, botiquín con foto, cartilla con fotos):
  - ninguna cadena empieza por `data:image`;
  - ningún `photoBase64` tiene contenido;
  - no hay llaves fuera de la lista permitida;
  - el `meta` no tiene correo, nombre ni credencial;
  - en una «computadora» (`isInstalledPhone` falso) la base no se crea.
- [X] T034 [US3] Agregar `frontend/src/shared/offline/` a la tabla de módulos de `frontend/CLAUDE.md`. Una fila que diga:
  - qué se guarda y qué no;
  - que **toda llave nueva que deba verse sin conexión se agrega a `PERSISTED_ROOTS`**;
  - que **toda mutación pasa por el guardia** del `QueryClient`.

---

## Fase 6: Historia de Usuario 4 — El teléfono del hijo también abre sin señal (P2)

**Objetivo**: `/hijo/hoy` abre sin red con sus datos, sin marcar, y se borra al perder el acceso (FR-018).

**Prueba independiente**: canjear el acceso, abrir «Hoy» con red y luego sin red: se ven sus tomas y el aviso. Al quitar el acceso y volver la red, la base queda vacía.

- [X] T035 [US4] En `frontend/src/features/childDevice/phone/ChildTodayPage.tsx`:
  - montar `<OfflineBanner />`;
  - con la credencial y en un teléfono instalado, llamar a `startPersistence(queryClient, 'child:' + childId)` cuando llega `phoneKey('me')`, y a `restoreSnapshot` al abrir sin red;
  - donde hoy se llama a `clearCredential()` por una credencial rechazada, llamar también a `wipeOffline`.

  `HomeRoute` en `frontend/src/App.tsx`: sin Clerk y con una credencial guardada, sigue mandando a `/hijo/hoy` también sin red. Pruebas en `ChildTodayPage.test.tsx`.
- [X] T036 [US4] Si en el teléfono hay una sesión de padre y también la credencial del hijo, cada uno tiene su dueño. Al cambiar de uno a otro, el `meta` distinto borra lo anterior (T009). Prueba en `persistence.test.ts`.

---

## Fase 7: Historia de Usuario 5 — Las actualizaciones y los avisos siguen funcionando (P2)

**Objetivo**: el aviso de versión nueva y los recordatorios no cambian (FR-016, FR-017).

**Prueba independiente**: las E2E `actualizar` y `recordatorios` siguen en verde con el precache, y «Actualizar» carga el `index.html` nuevo.

- [X] T037 [US5] En `frontend/src/shared/appVersion/UpdateNotice.tsx` y `useNewVersion.ts`:
  - sin conexión no se muestra el aviso ni se pregunta;
  - con conexión, «Actualizar» llama a `registration.update()` antes de `reload()`, para que el service worker nuevo active su precache. La navegación va primero a la red (T004), así que el `index.html` nuevo llega aunque el service worker viejo siga activo.

  Pruebas en `UpdateNotice.test.tsx` y `useNewVersion.test.tsx`.
- [X] T038 [US5] Correr y dejar en verde `e2e/actualizar.spec.ts` y `e2e/recordatorios.spec.ts` contra el build. Si `recordatorios` necesita el service worker, ya lo permite: revisar que el precache no rompe su espera de registro.

---

## Fase 8: E2E y pulido

- [X] T039 Crear `frontend/e2e/sin-conexion.spec.ts` (R12). Usa `test.use({ serviceWorkers: 'allow' })` y espera el registro y la activación del service worker antes de cortar la red.
  - **390 px, app instalada**: `userAgent` de iPhone y `addInitScript` que hace que `matchMedia('(display-mode: standalone)')` responda `true`.
    1. Usar con red el inicio, un hijo y una consulta con foto.
    2. `context.setOffline(true)` y recargar: el inicio con «Sin conexión · datos de las …».
    3. El hijo y la consulta con sus datos, y la foto con «La foto necesita conexión.».
    4. Una consulta nunca abierta → «Esta pantalla necesita conexión.».
    5. «Marcar» → «Marcar necesita conexión…» y la toma igual.
    6. «Nueva consulta», escribir y «Guardar» → aviso, y lo escrito sigue.
    7. `setOffline(false)` → el aviso se va en menos de 5 s.
    8. Cerrar sesión, sin red y recargar → «Necesitas conexión para abrir PediTrack».
    9. `indexedDB` de `peditrack-offline` vacía (leída con `page.evaluate`).
  - **1280 px, computadora**: usar con red, cortar y recargar → «Necesitas conexión…», y `peditrack-offline` no existe.
  - **Teléfono del hijo, 390 px instalado**: canjear, abrir «Hoy», cortar y recargar: sus tomas y el aviso.
- [X] T040 En `frontend/playwright.config.ts`, hacer que `sin-conexion` corra contra el build (`vite preview`, igual que CI) también en local:
  - un `webServer` aparte o un proyecto que lo exija, documentado;
  - agregarlo a `CROSS_BROWSER_SPECS` solo si WebKit soporta `setOffline` con service worker; si no, dejarlo en Chromium y anotarlo en `research.md`.
- [X] T041 Correr toda la suite unitaria con cobertura (`cd frontend && npx vitest run --coverage`): más del 90 % y `shared/offline` cerca del 100 %. También `npx tsc -b` y `npx eslint .` limpios.
- [X] T042 Correr las E2E afectadas en local: `sin-conexion`, `actualizar`, `recordatorios`, `marcado-inmediato`, `detalle-consulta-hijo` y `autenticacion`.
- [X] T043 Verificar con el quickstart en el navegador emulado (§2, §3 y §5), a 390 y 1280 px, y guardar capturas del aviso, de «Necesitas conexión» y de la foto omitida.
- [X] T044 [P] Documentos:
  - `CLAUDE.md`: entrada de la spec 067.
  - `frontend/CLAUDE.md`: `shared/offline/`, precache del `sw.ts` y la regla de `PERSISTED_ROOTS`.
  - `BACKLOG.md`:
    - marcar «Ver la app sin conexión» etapa 1 como hecha;
    - dejar la etapa 2;
    - anotar el pendiente del dueño de mencionar en el aviso de privacidad que se guardan datos en el teléfono (R13);
    - anotar la prueba en un iPhone real (quickstart §7).
- [X] T045 Poner `Estado: Implementada` en `spec.md` y dejar el resumen listo para el PR a `develop`. El commit, el push y el PR solo cuando el dueño lo pida.

---

## Dependencias y orden

- **Fase 1** → **Fase 2**, que bloquea todo. Dentro de la Fase 2:
  - T003 → T004 → T005;
  - T006, T007 y T008 en paralelo, luego T009;
  - T010 → T011 → T012 → T013, con T014 en paralelo con T011.
- **US1** (Fase 3) depende de la Fase 2. Es el MVP.
- **US2** (Fase 4) depende de T011–T013 (Fase 2) y de T024 para las pantallas.
- **US3** (Fase 5) depende de T009 y T015.
- **US4** (Fase 6) depende de US1 (T015, T019) y de T009.
- **US5** (Fase 7) depende de T004. Puede ir en paralelo con US2–US4.
- **Fase 8** al final.

## Ejemplos de trabajo en paralelo

- Fase 2: T006 (`device.ts`), T007 (`idbStore.ts`), T008 (`persistPolicy.ts`) y T010 (`connectivity.ts`) son archivos distintos sin dependencias entre sí.
- Fase 3: T019 (`OfflineBanner`), T021 (`useOfflineFallback`) y T023 (`OfflineMissing`) en paralelo, luego T020, T022 y T024.
- US5 (T037) puede ir en paralelo con la Fase 4.

## Estrategia de implementación

1. **Primero lo que evita el daño**. T011–T013 cierran la sincronización escondida de hoy, en que una marca sin red se manda sola después. Vale aunque nada más se termine.
2. **MVP = Fases 1–3**: el teléfono instalado abre sin red con datos y aviso.
3. Luego US2 (solo lectura en todas las acciones), US3 (borrado y privacidad), US4 (teléfono del hijo) y US5 (actualizaciones), cada una probable por separado.
4. Al final, las E2E contra el build y la prueba del dueño en un iPhone real.

## Cobertura de los requisitos

| Requisito | Tareas |
|---|---|
| FR-001 abrir sin red | T003–T005, T015–T018 |
| FR-002 pantallas con datos | T009, T018, T022, T024 |
| FR-003 pantalla nunca vista | T023–T025 |
| FR-004 aviso con hora | T002, T019, T020, T035 |
| FR-005 refresco al volver | T010, T015 |
| FR-006 no vaciar al fallar | T024, T026 |
| FR-007 nada se manda | T011–T013, T027, T028 |
| FR-008 estados del servidor | T030 |
| FR-009 solo lo visto | T008, T009, T033 |
| FR-010 sin fotos | T008, T029, T033 |
| FR-011 borrado | T031, T032, T035 |
| FR-012 solo teléfono instalado | T006, T009, T033, T039 |
| FR-013 7 días | T008, T009 |
| FR-014 acceso perdido | T009, T018 |
| FR-015 nada a terceros | T004, T033 |
| FR-016 versión nueva | T037, T038 |
| FR-017 recordatorios | T004, T038 |
| FR-018 teléfono del hijo | T035, T036 |
| FR-019 dos diseños | T016, T019, T039 |
| FR-020 sin juicios | T002 |
