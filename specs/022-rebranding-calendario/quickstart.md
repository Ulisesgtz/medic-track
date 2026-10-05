# Guía de validación: Rebranding de los colores del calendario

**Requisitos**: backend y frontend corriendo; una consulta con tres medicamentos de rangos distintos y alguna toma marcada.

## 1. Automatizado
```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage
npx playwright test e2e/calendario-tratamiento.spec.ts e2e/recorrer-tratamiento.spec.ts
```

## 2. Comparación con el diseño (obligatoria, regla de los mocks)
Abre `~/Downloads/Calendario PediTrack (standalone).html` a 430 px y a 1024 px y la app con los mismos datos al mismo ancho,
lado a lado. Revisa sección por sección: encabezado del mes y botones, días de la semana, pastillas con puntos (relleno =
todas dadas), día elegido (oscuro, aro cian), días fuera del tratamiento, leyenda, título «Tomas del …», filas y chips (130 /
160 px), y en la web la tarjeta «Cómo leer el calendario». Anota cada diferencia con su motivo (las 12 desviaciones de la spec).

## 3. A mano (390 y 1280 px)
1. Un día con tres medicamentos muestra tres puntos en su lugar (1.º, 2.º, 3.º); con un medicamento sin toma ese día, su lugar
   queda vacío.
2. Marca una toma: el punto de ese medicamento pasa a relleno cuando todas las de ese día están dadas; el chip pasa a verde.
3. Toca otro día: queda oscuro con aro cian y puntos cian; «Tomas del …» cambia.
4. Con 4 a 6 medicamentos, los puntos pasan a dos filas sin salirse de la pastilla; con 7, los colores se repiten.
5. A 390 px no hay desplazamiento horizontal.
6. Con VoiceOver/lector de pantalla, el nombre de cada día dice los medicamentos y si su dosis se dio.

## 4. Diseño
Las capturas de la comparación (mock | app) a 430 y 1024 px se muestran al usuario para aprobarlas.
