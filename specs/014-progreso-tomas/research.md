# Investigación: Barra de progreso de tomas por medicamento

## R1. Se calcula en el frontend, sin endpoint nuevo

**Decisión**: el progreso de un medicamento se deriva de sus tomas, que ya llegan completas en el detalle de la consulta
(`medication.doses`, cada una con `taken` y `status`, specs 004/013): `total = doses.length`,
`marcadas = doses.filter(taken).length`, `sinRegistrar = doses.filter(status === 'unregistered').length`.

**Justificación**: una sola fuente de verdad y actualización inmediata al marcar (la mutación de `useDoseToggle` ya
invalida el detalle, spec 004). Sin cambios de API, datos ni migración (Principio V).

**Alternativas**: campo calculado en el backend (duplica la regla y exige otra ida al servidor sin ganar nada, porque las
tomas ya viajan).

## R2. Función pura `medicationProgress`

**Decisión**: `progress.ts` con `medicationProgress(doses) → {taken, total, unregistered}` y los textos
(`"3 / 9 tomas"`, `"0 / 1 toma"`, `" · 2 sin registrar"`); el componente `ProgressBar` solo pinta.

**Justificación**: la regla se prueba sin renderizar y `spec 016` la reutiliza (total sin las canceladas).

## R3. La barra

**Decisión**: `role="progressbar"` con `aria-valuemin=0`, `aria-valuemax=total`, `aria-valuenow=marcadas` y
`aria-valuetext="3 de 9 tomas registradas"`; pista `slate-200`, relleno `confirmed` (verde de "tomada") con ancho en
porcentaje y `transition-[width]`. Encima, el texto "3 / 9 tomas" (`text-[13px] font-bold`), y a la derecha, en
`slate-600`, "· 2 sin registrar" solo si hay. Sin colores de alerta ni mensajes de evaluación (Principio I). Se coloca
entre el título y la línea del horario en ambos diseños; en web la barra mide todo el ancho de la tarjeta.

**Justificación**: la barra de lectura de la receta ya usa `role="progressbar"`; el verde `confirmed` es el color de lo
marcado en toda la app. `prefers-reduced-motion`: la transición se quita con `motion-reduce:transition-none`.

## R4. Sin tomas, sin barra

Un medicamento sin tomas (consultas anteriores sin hora de inicio) no muestra la barra (FR-007).

## R5. Pruebas

Unitarias de `medicationProgress` (0, todas, sin registrar, una sola toma, sin tomas), del componente (valores
accesibles, texto, actualización al marcar) y E2E móvil/web: marcar una toma sube el avance y el texto cambia.
