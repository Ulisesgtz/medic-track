# Investigación — Spec 076: la gráfica solo hasta la edad de la curva de la OMS

Fecha: 2026-11-19. Hechos del código leídos por `Explore` (Haiku); decisiones de la sesión principal. Mock:
`referencia/Crecimiento mayor de la curva PediTrack.dc.html` (estados A, A2, B, B2, C, D).

## R1. Dónde se corta: en el servidor, por fecha de calendario

**Hallazgo**: `service.Chart` (`internal/growth/service.go:66-103`) devuelve todas las medidas; `AgeInMonths`
(`reference.go:21-26`) es `días / 30.4375` con dos decimales, así que el cumpleaños 10 cae en 119.98 o 120.02 según los
bisiestos. `MaxMonths` sale de la última fila de cada tabla (peso 120, talla 228; iguales para niña y niño) y **solo viaja
dentro de `reference`**, que es `null` mientras no se elige la tabla Niña/Niño.

**Decisión**: el servidor decide qué medidas entran: una medida entra en la gráfica de un indicador si su fecha es **igual o
anterior a `birthDate + maxMonths meses` de calendario** (`time.AddDate(0, maxMonths, 0)`): el día que cumple 10 años entra, el
siguiente no, sin depender del redondeo. `maxMonths` por indicador sale de constantes del paquete derivadas de las tablas
(`WeightMaxMonths = 120`, `HeightMaxMonths = 228`, con una prueba que las compara con la última fila de cada tabla de los dos
sexos), así que el corte funciona **sin tabla elegida y con las curvas apagadas** (`WHO_GROWTH_REFERENCE_ENABLED`).

## R2. Forma nueva de la respuesta de la gráfica

`GET /children/{childId}/growth-chart` agrega, compatible hacia atrás:

```json
"limits": {
  "weight": { "maxMonths": 120, "later": 1 },
  "height": { "maxMonths": 228, "later": 0 }
}
```

`points.weight`/`points.height` traen **solo** las medidas dibujables; `later` = cuántas medidas con ese indicador quedaron
fuera. La lista (`GET …/growth-measurements`) y la «última medida» no cambian (usan otra consulta).

## R3. Pantalla (mock)

- **A / A2**: cada pestaña con su propia edad; el eje termina en `limits[indicator].maxMonths`; la nota fija «La curva de peso
  de la OMS llega a los 10 años. Las medidas de después están en Medidas anotadas.» va **dentro del cuadro de notas, entre la
  nota de la referencia y «Tu pediatra es quien interpreta la gráfica.»**, solo en la pestaña con `later > 0` y puntos
  dibujados. Reemplaza `beyondWeight`/`beyondHeight`.
- **D**: la lectura ‹ › recorre solo lo dibujado; en la pestaña con `later > 0` añade «Medida n de 3 en la gráfica de peso»
  (13 px); los extremos `disabled` con 40 % de opacidad.
- **B**: pestaña sin puntos dibujables y `later > 0` → sin ejes ni curvas: un bloque celeste (16–17 px) con «La curva de peso
  de la OMS llega a los 10 años. Las medidas de Sofía están en Medidas anotadas.» y el enlace «Ir a Medidas anotadas ↓» (44 px)
  a la lista o la tabla; sin rangos, lectura, selector Niña/Niño ni nota del pediatra. Las pestañas se quedan.
- **C**: ningún indicador con puntos dibujables → sin pestañas; título «Gráfica de crecimiento» y «Las curvas de la OMS llegan
  a los 10 años en peso y a los 19 en talla. Sus medidas están en Medidas anotadas.» con el mismo enlace.
- **Rango**: para un hijo de más de 3 años el rango inicial es «Hasta 10 años» / «Hasta 19 años»; «0–3 años» solo se ofrece si
  hay medidas dibujables en esos 36 meses (B2 no lo tiene). Hasta los 3 años sigue la regla de la spec 065. **Esto cambia la
  spec 065 para los hijos de 3 a 10 años** (antes «0–(edad+1) años»): es decisión del mock.
- `REFERENCE_END` del frontend se reemplaza por `limits`.
- Sin cambios: «Última medida», «Medidas anotadas» (sin marcar cuáles quedaron fuera), formulario, encabezado.

## R4. Desviaciones previstas

- «Quitar» en el mock va en color de acción, no en rojo: queda como en el resto de la app (rojo de «Quitar» del sistema
  visual) y se anota; cambiarlo en todas las pantallas es otra decisión.
- El selector Niña/Niño de Sofía en el mock no tiene tabla propia: datos de ejemplo.

## R5. Sin migración, sin dependencias, sin cambio de plan

La gráfica sigue siendo del plan completo (422 `growth_chart` antes de leer nada).
