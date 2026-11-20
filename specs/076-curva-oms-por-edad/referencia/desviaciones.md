# Desviaciones de la app respecto al mock «Crecimiento mayor de la curva PediTrack» (spec 076)

Medido con una prueba temporal de Playwright (no subida) a 390 y 1280 px, con el mismo marco que el mock: la tarjeta de la gráfica,
cada hijo de ella y su alto. Teléfono: A, A2, B y C **iguales al píxel** en ancho y alto de cada parte (A 350×749, A2 350×657,
B 350×256); en C el título medía 27 px y el mock 22: se corrigió con `leading-[normal]`. Web: A 904×693 igual; A2 medía 655 contra
651 del mock (la etiqueta «Curvas de la OMS para» tenía interlineado 1.5): se corrigió con `leading-[normal]`; B 904×234 igual; C
medía 235 contra 229 (mismo título): corregido.

1. **«Quitar» sigue en rojo** (`red-700` del sistema visual) en «Medidas anotadas»; el mock lo dibuja en color de acción. Cambiarlo es
   decisión del dueño para todas las pantallas (decisión 11 del mock).
2. **Con las curvas de la OMS apagadas** (`WHO_GROWTH_REFERENCE_ENABLED` sin encender) el cuadro de notas del mock no existe en la
   app (no se dibuja la nota de referencia ni la del pediatra); la frase fija «La curva de peso de la OMS llega a los 10 años…»
   se dibuja entonces suelta, bajo la gráfica, para que se explique por qué las medidas de después no están dibujadas. El mock no
   dibuja ese estado.
3. **Rango «Todo»** (curvas apagadas): el mock solo muestra «Hasta 10 años»; sin curvas la app mantiene el rótulo «Todo» de la
   spec 065 (el eje termina en la edad de la curva o en la última medida dibujada).
4. **Datos de ejemplo del mock**: Sofía usa «Niña» sin tabla propia; la app lee la tabla elegida por la familia. La edad «10 años
   6 meses» y el «hace 12 días» del mock son de ejemplo.
5. **«0–3 años»** del mock A aparece con un punto en esos 36 meses; la app lo ofrece solo si hay puntos dibujados ahí (decisión 5),
   por eso en la medición con otros datos solo salía «Hasta 10 años».
6. **El contador «Medida n de N»** cuenta lo dibujado en el rango elegido (si el rango corto oculta puntos, N cuenta los visibles);
   el mock solo muestra el caso con todos los puntos en el rango.
7. **«Ir a Medidas anotadas ↓»** es un enlace real `href="#medidas"` pero con `preventDefault`: salta con `scrollIntoView` y pasa el
   foco a la sección (que lleva `tabIndex=-1`), para no cambiar la dirección que usa el enrutador.
