# Modelo de datos: Marcado inmediato de tomas y confirmaciones propias

No hay tablas, columnas ni campos de API nuevos. Lo que sigue es estado **en memoria del navegador**: se pierde al recargar y nunca se guarda en `localStorage`.

## Marca por confirmar (`PendingMark`)

Una por toma que la persona tocó y cuya respuesta no ha llegado.

| Campo | Tipo | Qué es |
|---|---|---|
| `doseId` | string | la toma (llave) |
| `taken` | boolean | el estado del último toque |
| `since` | number | cuándo se tocó (para «guardando…» a los 2 s y para la hora provisional) |
| `inFlight` | boolean | hay una petición en camino para esta toma |
| `sent` | boolean \| null | el estado que lleva la petición en camino |

**Reglas**
- A lo más una por toma y una petición en camino por toma.
- Existe solo mientras la pantalla va por delante del servidor; se borra al confirmarse o al fallar.

**Transiciones**

```text
(nada) ──toque──▶ en camino ──respuesta OK, sin otro toque──▶ (nada)   [la caché ya tiene la toma del servidor]
                     │  ▲
                     │  └── respuesta OK y el último toque es distinto ──▶ otra petición
                     └── falla ──▶ (nada) + aviso + volver a pedir los datos
```

## Toma mostrada

`applyPendingMarks(datos, marcas)` devuelve los mismos datos con cada toma que tiene marca por confirmar así:

| Último toque | `taken` | `status` | `takenBy` |
|---|---|---|---|
| marcar | `true` | `taken` | `null`, hora = `since` |
| quitar | `false` | `pending` | `null` |

Las demás tomas, y todo lo que no es una toma, pasan sin cambio. Los conteos y barras se siguen derivando de las tomas, así que avanzan solos.

## Aviso de marca (`MarkNoticeEntry`)

| Campo | Tipo | Qué es |
|---|---|---|
| `doseId` | string | la toma (un aviso por toma; el nuevo reemplaza al anterior) |
| `kind` | `not_saved` \| `not_unmarked` \| `marked_by_other` \| `not_yours` \| `gone` | qué pasó (research R7) |
| `name`, `time` | string | el nombre del medicamento, suplemento o actividad y la hora de la toma, ya en pantalla |
| `by` | string \| undefined | el nombre de pila de quien la marcó antes |

Se borra cuando la toma se guarda, al tocar «Cerrar» o al cambiar de pantalla. No lleva nada que no esté ya en la pantalla.

## Salida por confirmar (`useDiscardGuard`)

Estado local del formulario: lo que la persona quiso hacer (ir a una dirección o ejecutar una acción) y el control que tocó. Existe solo mientras el diálogo está abierto.
