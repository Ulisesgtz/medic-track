# Plan de Implementación: Ver la app sin conexión (etapa 1, solo lectura)

**Rama**: `feature/067-ver-app-sin-conexion` | **Fecha**: 2026-11-11 | **Especificación**: [spec.md](spec.md)
**Entrada**: Especificación de la funcionalidad desde `/specs/067-ver-app-sin-conexion/spec.md`

## Resumen

La app instalada en un teléfono abre sin red y muestra lo último que ese teléfono vio, sin poder cambiar nada. Tres piezas:

1. **El cascarón**: el service worker precachea los archivos del build con Workbox. La navegación va **primero a la red** y solo sin red cae al `index.html` guardado, así «Actualizar» (spec 017) sigue cargando lo nuevo (research R1).
2. **Los datos**: las respuestas que la sesión ya recibió se guardan en IndexedDB **solo en la app instalada en un teléfono** (R2).
   - Va **una entrada por consulta**, con una lista de llaves permitidas, sin fotos (R3, R6).
   - Cada entrada se borra a los 7 días (R8). Todo se borra al cerrar sesión, al cambiar de cuenta o al perder el acceso (R5).
   - Sin red y sin Clerk, una «sesión sin conexión» pinta los datos del último dueño (R4).
   - Si el día cambió, se usa la última respuesta del mismo tipo (R9).
3. **Solo lectura**: las mutaciones pasan a `networkMode: 'always'` y un guardia central las rechaza sin red antes de mandar nada. Así se cierra la sincronización escondida que hoy hace TanStack (R7).
   - `requestMark` (spec 066) ya no pinta la marca sin red.
   - Un aviso único dice que la acción necesita conexión.
   - Las pantallas conservan sus datos al fallar una petición y muestran «Sin conexión · datos de las 08:15» (R10, R11).

Solo frontend: sin API, sin migración y sin cambios en los avisos push.

## Contexto Técnico

**Lenguaje/Versión**: TypeScript 5 / React 19 (frontend); sin cambios en Go.
**Dependencias Principales**:
- Ya usadas: TanStack Query 5.102.8, React Router, `@clerk/react` 6.16.1, `vite-plugin-pwa` 1.3.0.
- **Nuevas** (versiones exactas):
  - `@tanstack/react-query-persist-client` 5.102.8
  - `workbox-precaching`, `workbox-routing`, `workbox-strategies` y `workbox-expiration` 7.4.1. Ya llegan por `vite-plugin-pwa`; se vuelven directas.
  - `fake-indexeddb` 6.2.7, solo para pruebas.
**Almacenamiento**: IndexedDB en el teléfono (`peditrack-offline`, ver [data-model.md](data-model.md)) y Cache Storage del service worker, solo con el cascarón. Nada en el servidor.
**Pruebas**:
- Vitest con `fake-indexeddb`.
- Playwright contra el **build** (`vite preview`), con service worker permitido, `context.setOffline` y la app instalada simulada (R12).
**Plataforma Objetivo**: la PWA instalada en iPhone (Safari) y Android (Chrome). En computadora solo se precachea el cascarón; no se guardan datos.
**Tipo de Proyecto**: aplicación web (frontend PWA + backend Go); solo cambia el frontend.
**Objetivos de Rendimiento**:
- Abrir sin red y pintar el inicio en menos de 3 s (SC-001).
- Al volver la red, datos actuales en menos de 5 s (SC-005).
- Escribir en IndexedDB nunca bloquea la pantalla: es asíncrono y por entrada.
**Restricciones**:
- Principio II: solo lo ya visto, sin fotos, 7 días, borrado al salir, y solo en el teléfono instalado.
- Nada nuevo a terceros: Clerk no se guarda en caché.
- Los estados de las tomas siguen siendo del servidor (spec 013).
**Escala/Alcance**:
- Unas 10 pantallas leen datos guardados.
- Lo que se guarda es la decena de llaves de R6, más un aviso, una pantalla de «necesitas conexión» y un guardia de mutaciones.

## Verificación de la Constitución

| Principio | Cumple | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Los textos nuevos hablan solo de la conexión y de la hora de los datos (contracts/ui.md). Las tomas se muestran con el estado que dio el servidor; el teléfono no recalcula nada (FR-008, R9). |
| II. Privacidad | ✅ con decisión del dueño | Los datos de salud se guardan en el teléfono, que es lo nuevo de esta spec. Se limita al mínimo: <br>• solo la app instalada en un teléfono (Q1 = C); <br>• solo respuestas ya vistas, de una lista permitida; <br>• sin fotos; <br>• 7 días por respuesta (Q2 = A); <br>• borrado al salir o cambiar de cuenta y por llave cuando el servidor niega el acceso; <br>• nada a terceros ni en la dirección. <br>**Pendiente del dueño**: mencionarlo en el aviso de privacidad (R13). |
| III. Stack fijo | ✅ | Sigue siendo la PWA en React. Workbox y el persistidor son del ecosistema que ya se usa. La captura de fotos no cambia. |
| IV. Freemium sin secuestrar datos | ✅ | Ver sin conexión no depende del plan. No se oculta nada. |
| V. Simplicidad | ✅ | Etapa 1 = solo lectura (la etapa 2 queda en el backlog). Las piezas son chicas y puras: lista permitida, retención, dueño, conexión. Un guardia central reemplaza revisar cada botón. |
| VI. Pruebas | ✅ | Unitarias de cada pieza de `shared/offline`. E2E a 390 px como app instalada sin red y a 1280 px comprobando que la computadora no guarda nada. Prueba manual en un iPhone real. |

Sin violaciones. Se revisó de nuevo después del diseño y sigue igual.

**Riesgos que el diseño atiende**:
1. **Una marca que parece guardada sin estarlo.** R7 cierra el camino de hoy, en que TanStack pausa la mutación y la manda sola al volver la red. Además impide pintar la marca optimista sin red.
2. **«Actualizar» carga una versión vieja.** La navegación va primero a la red (R1).
3. **Datos de otra cuenta en el teléfono.** El dueño queda en `meta`, y todo se borra en cada cambio de usuario (R5).

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/067-ver-app-sin-conexion/
├── spec.md
├── plan.md              # este archivo
├── research.md          # R1–R13
├── data-model.md        # IndexedDB, meta, retención, caché del service worker
├── quickstart.md        # cómo validarlo (build + emulación + iPhone real)
├── contracts/ui.md      # aviso, «necesitas conexión», acción sin conexión, foto
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Código Fuente (raíz del repositorio)

```text
frontend/
├── vite.config.ts                      # injectionPoint: 'self.__WB_MANIFEST'
├── package.json                        # dependencias nuevas (versiones exactas)
├── playwright.config.ts                # sin-conexion corre contra el build con service worker
├── public/_headers                     # sin cambios esperados (worker-src 'self' ya está)
├── src/
│   ├── sw.ts                           # + precache, NavigationRoute NetworkFirst, Google Fonts; push intacto
│   ├── App.tsx                         # QueryClient: mutations networkMode 'always' + MutationCache con el guardia; persistencia
│   ├── shared/offline/                 # NUEVO
│   │   ├── device.ts                   # isInstalledPhone() (R2)
│   │   ├── idbStore.ts                 # abrir/leer/escribir/borrar peditrack-offline (R3)
│   │   ├── persistPolicy.ts            # lista permitida, vaciar la foto, retención de 7 días (R6, R8)
│   │   ├── persistence.ts              # suscribir/restaurar el caché por entrada; dueño y borrado (R3, R5)
│   │   ├── connectivity.ts             # estado de conexión + onlineManager (R10)
│   │   ├── offlineSession.ts           # useOfflineSession: abrir sin Clerk (R4)
│   │   ├── offlineGuard.ts             # OfflineError + guardia de mutaciones (R7)
│   │   ├── useOfflineFallback.ts       # última respuesta del mismo tipo de otro día (R9)
│   │   ├── OfflineBanner.tsx           # «Sin conexión · datos de las 08:15»
│   │   ├── OfflineGate.tsx             # «Necesitas conexión para abrir PediTrack»
│   │   ├── OfflineMissing.tsx          # «Esta pantalla necesita conexión.»
│   │   ├── offlineText.ts              # todos los textos (contracts/ui.md)
│   │   └── *.test.ts(x)
│   ├── shared/marks/requestMark.ts     # sin red: no pinta la marca, aviso «Marcar necesita conexión…»
│   ├── features/auth/                  # RequireSession, useLogout, useClearCacheOnUserChange: modo sin conexión y borrado
│   ├── features/childDevice/phone/     # dueño child:<id>, borrado al perder la credencial, aviso
│   ├── features/consultations/ConsultationDetailPage.tsx   # foto omitida → «La foto necesita conexión.»
│   ├── features/{home,consultations,supplements,profile,medicineCabinet,vaccinations}/   # datos aunque isError (R11), respaldo de otro día
│   └── features/home/AppShell.tsx       # monta OfflineBanner
└── e2e/sin-conexion.spec.ts            # NUEVO (390 instalada / 1280 computadora)
```

**Decisión de Estructura**: todo lo nuevo vive junto en `frontend/src/shared/offline/`, como `shared/marks/` de la spec 066. Las pantallas solo cambian para no vaciarse al fallar y para usar el respaldo de otro día. El backend no se toca.

## Orden de construcción

1. Dependencias y precache (`sw.ts`, `vite.config.ts`). Verificar que `recordatorios` y `actualizar` siguen en verde.
2. `shared/offline`: `device`, `idbStore`, `persistPolicy`, `persistence` y sus pruebas.
3. El guardia de mutaciones y `requestMark` sin red (R7). Es lo más delicado y va antes que mostrar datos.
4. `connectivity`, `offlineSession`, `OfflineGate` y `RequireSession`/`HomeRoute` (R4, R10).
5. Las pantallas: datos aunque fallen, `OfflineBanner`, `OfflineMissing`, la foto omitida y el respaldo de otro día (R9, R11).
6. El teléfono del hijo (dueño y borrado).
7. E2E `sin-conexion` y ajuste de `playwright.config.ts`.
8. Documentos: `CLAUDE.md`, `frontend/CLAUDE.md`, `BACKLOG.md` (etapa 2 y aviso de privacidad), `DEPLOY.md` si cambia algo del build.

## Seguimiento de Complejidad

Sin violaciones de la constitución que justificar.
