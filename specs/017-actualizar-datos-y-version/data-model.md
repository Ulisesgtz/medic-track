# Modelo de Datos: Actualizar datos y versión

Sin cambios en la base de datos ni en la API. Solo estado de la interfaz:

| Elemento | Dónde vive | Forma |
|---|---|---|
| Versión corriendo | Compilada en el JS (`__APP_VERSION__`) | `string` fijo por build (`dev` en desarrollo) |
| Versión publicada | `GET /version.json` (archivo estático del build) | `{ "version": string }` |
| ¿Hay versión nueva? | Estado de `useNewVersion` | `boolean`; pasa a `true` si la publicada difiere de la que corre; no vuelve a `false` sin recargar |
| Trabajo sin guardar | Registro `unsavedWork` en memoria | contador de formularios sucios; `hasUnsavedWork()` |
| Estado del gesto | `usePullToRefresh` | `idle` → `pulling(distance)` → `refreshing` → `idle` (o `failed` 4 s) |

Nada de esto se guarda en la cuenta ni en el almacenamiento del navegador.
