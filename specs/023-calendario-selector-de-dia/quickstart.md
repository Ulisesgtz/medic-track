# Quickstart: validar el calendario como selector de día

## 1. Automatizado
```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx eslint src && npx vitest run --coverage
cd frontend && npx playwright test e2e/calendario-tratamiento.spec.ts e2e/recorrer-tratamiento.spec.ts
```
Cobertura >90 %; el E2E corre a 390 y 1280 px (necesita el backend y los datos de Clerk de desarrollo).

## 2. A mano (túnel o `npm run dev`)
1. Crea una consulta con Amoxicilina (7 días) y Paracetamol (3 días), ambos cada 8 h desde las 00:00.
2. Abre el detalle: el calendario tiene hoy elegido y **no hay** lista «Tomas de hoy» bajo el calendario; cada tarjeta dice
   «Tomas de hoy» y muestra sus chips en Mañana/Tarde/Noche.
3. Toca el día 5: Amoxicilina muestra «Tomas del 5 de …» con sus chips; Paracetamol dice «Este día no tiene tomas.».
4. En ese día marca una toma de Amoxicilina: el chip, el punto de ese día en el calendario y la barra de progreso se
   actualizan, y el día 5 sigue elegido.
5. Cambia de mes con las flechas: el día elegido y las tarjetas no cambian.
6. Finaliza el tratamiento de Amoxicilina el día 1 y toca el día 3: sus tomas se ven canceladas (antes no se alcanzaban).
7. En el teléfono, tocar un día no desplaza la pantalla; al bajar, cada tarjeta dice a qué día corresponde.
8. Una consulta de hace semanas (tratamiento terminado) abre en su **primer** día.
