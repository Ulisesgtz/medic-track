# Contrato de UI — Spec 076

Del mock `../referencia/Crecimiento mayor de la curva PediTrack.dc.html` (A, A2, B, B2, C, D; teléfono 390 y web 1280, dos
diseños con `useIsDesktop`). Detalle en `../research.md` R3. Textos nuevos en `growthText.ts` (prueba de redacción: nada de «ya
no», «fuera de rango», «excede»).

- **ChartCard por pestaña**: eje hasta `limits[i].maxMonths`; puntos = los del servidor; nota fija en el cuadro de notas
  (entre la de referencia y la del pediatra) si `later > 0` y hay puntos; lectura con «Medida n de N en la gráfica de peso|talla»
  en esa pestaña; ‹ › `disabled` en los extremos.
- **Pestaña sin puntos y `later > 0`** (B): bloque celeste con la frase (con el nombre del hijo) y «Ir a Medidas anotadas ↓»
  (44 px, salta a la lista o la tabla); sin rangos, lectura, selector Niña/Niño ni nota del pediatra.
- **Ningún indicador con puntos y alguno con `later > 0`** (C): sin pestañas; título «Gráfica de crecimiento» y la frase de las
  dos curvas con el enlace.
- **Rangos**: hijo de más de 36 meses → inicial «Hasta N años»; «0–3 años» solo si hay puntos en 0–36 meses. Hasta 36 meses,
  la regla de la spec 065.
- Sin cambios: última medida, medidas anotadas, formulario, plan gratuito, vista de Cuidadora.
