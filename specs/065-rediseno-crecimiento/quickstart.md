# Quickstart: validar el rediseño de «Crecimiento»

## Requisitos

- La base local con la migración `0034` (spec 063).
- El backend corriendo con `WHO_GROWTH_REFERENCE_ENABLED=true` para ver las curvas.
- El frontend con `npm run dev`.

## 1. Pruebas automáticas

```bash
cd frontend
npx vitest run src/features/growth src/shared --coverage
npx tsc --noEmit && npx eslint src/features/growth
```

Resultado esperado:

- todo pasa;
- `features/growth/` tiene más del 90 %;
- `noColorLiterals.test.ts` y la prueba de redacción pasan.

La E2E (`e2e/crecimiento.spec.ts`, 390 y 1280) corre en CI.

## 2. Lado a lado con el mock

1. Abre el mock `specs/065-rediseno-crecimiento/referencia/Crecimiento PediTrack.dc.html` en Claude Design, o su copia local.
2. Arma en local los datos del mock: Mateo nacido el 12 sep 2024, las 8 medidas de `M` del mock (con la nota de la farmacia y una corrección), la medida del registro 3.3 kg · 50 cm y la tabla «Niño».
3. Abre `/children/<id>/crecimiento` a 390 px y a 1280 px y compara, sección por sección:

   | Estado | Qué comparar |
   |---|---|
   | A | Encabezado, última medida, gráfica de Peso en «0–3 años», lectura de la última medida, selector, nota, lista o tabla, caja del registro |
   | B | Pestaña «Talla» |
   | C | Una cuenta sin medidas |
   | D | Quitar la tabla elegida (`UPDATE children SET growth_reference_sex = NULL`) |
   | E | Cuenta gratuita y «Ver la gráfica» |
   | F | Sesión de una Cuidadora |
   | G1 / G2 | «+ Anotar medida»; fecha futura y un peso de 116 |

4. Mide con las herramientas del navegador los tamaños de `research.md` R3 (SVG de 316×264 y 854×380, tarjetas, tipografías) con una tolerancia de ±2 px.
5. Anota cada diferencia que quede en `referencia/desviaciones.md`, con su motivo.

## 3. Comportamiento

- ‹ › recorren las 8 medidas y en los extremos quedan atenuados y deshabilitados.
- Tocar la gráfica cerca de un punto lo elige.
- «Hasta 10 años» muestra la referencia completa; al volver a «0–3 años» la medida elegida se conserva.
- Con `WHO_GROWTH_REFERENCE_ENABLED` apagada solo se ven los puntos, con la frase de la referencia apagada.
