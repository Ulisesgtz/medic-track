# Modelo de Datos: Ver la app sin conexión (spec 067)

Sin cambios en la base del servidor ni en el API. Todo lo nuevo vive **en el teléfono**, y solo en la app instalada en un teléfono (research R2).

## Base `peditrack-offline` (IndexedDB del navegador)

Una base por origen, versión 1, con un almacén:

### Almacén `queries` (llave = `queryHash` de TanStack)

| Campo | Tipo | Regla |
|---|---|---|
| `queryHash` | texto | Llave. Igual a la de la memoria de TanStack (`JSON` de la `queryKey`). |
| `queryKey` | arreglo | Debe empezar por una llave de la lista permitida (research R6). |
| `data` | objeto | La respuesta del servidor **tal como llegó**, salvo `photoBase64` del detalle de la consulta, que se guarda vacío con `photoOmitted: true`. Nunca imágenes. |
| `dataUpdatedAt` | número (ms) | Cuándo llegó del servidor. Base de la retención y de la hora del aviso. |

### Entrada especial `meta` (en el mismo almacén, llave `__meta__`)

| Campo | Tipo | Regla |
|---|---|---|
| `owner` | texto | `user:<clerkUserId>` (padres) o `child:<childId>` (teléfono del hijo). Nunca correo, nombre ni credencial. |
| `schema` | número | `1`. Si cambia la forma de lo guardado, una versión nueva borra todo en vez de leer algo viejo. |
| `buildId` | texto | El id del build que lo escribió (el de `/version.json`); informativo para depurar, no invalida. |

## Reglas y transiciones

```text
           (respuesta permitida llega, teléfono instalado)
  vacía ───────────────────────────────────────────────► con datos de <owner>
    ▲                                                        │
    │  cerrar sesión · otro usuario · Clerk ready sin sesión │
    │  credencial del hijo rechazada · owner ≠ quien entra    │
    │  schema distinto · todas las entradas con > 7 días      │
    └────────────────────────────────────────────────────────┘

  por entrada:  403/404 de esa llave → se borra
                hijo que ya no está en accounts/me → se borran sus llaves
                dataUpdatedAt > 7 días → se borra (al restaurar y cada hora)
```

- Solo se escribe cuando `isInstalledPhone()` es verdadero; si no, la base ni se abre (en una computadora no existe).
- Solo se escriben consultas en estado `success` con una llave permitida; una falla nunca sobreescribe datos buenos.
- Un error al abrir o escribir la base (lleno, bloqueado, modo privado) se ignora: la app funciona como hoy y sin conexión muestra «Necesitas conexión».

## Estado en memoria (no se guarda)

| Pieza | Qué es |
|---|---|
| `connectivity` | `'online' \| 'offline'`, derivado de `navigator.onLine`, de las fallas de red y del modo sin conexión (research R10). Conectado al `onlineManager` de TanStack. |
| `offlineSession` | `null` o `{ owner }` mientras se muestran datos guardados sin Clerk (research R4). |
| `OfflineError` | Error con `kind: 'offline'` que lanza el guardia de mutaciones antes de mandar nada (research R7). |

## Caché del service worker (Cache Storage)

| Caché | Contenido | Regla |
|---|---|---|
| `workbox-precache-v2-…` | Archivos del build con hash, `index.html`, iconos, `manifest.webmanifest` | Lo maneja Workbox; se limpia lo viejo en cada versión. **Sin datos de nadie.** |
| `google-fonts` | Hoja y archivos de Figtree | `StaleWhileRevalidate`, máximo 10 entradas. |

`/version.json`, las llamadas al API y los scripts de Clerk **nunca** se guardan en Cache Storage.
