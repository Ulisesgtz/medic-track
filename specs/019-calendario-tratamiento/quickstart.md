# Guía de validación: Calendario del tratamiento

**Requisitos**: backend y frontend corriendo; una consulta con dos medicamentos (p. ej. Amoxicilina cada 8 h por 7 días
y Paracetamol cada 6 h por 3 días, ambos desde hoy).

## 1. Automatizado
```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx vitest run --coverage
npx playwright test e2e/calendario-tratamiento.spec.ts
```

## 2. A mano (390 y 1280 px)
1. Abre el detalle de la consulta: aparece **un** calendario sobre «Medicamentos», con la leyenda «1 Amoxicilina / 2
   Paracetamol». Hoy tiene anillo; 7 días llevan la marca 1 y los 3 primeros también la 2.
2. Toca el día 3: debajo aparecen sus tomas de los dos medicamentos, en orden de hora; marca una y mira cómo cambia la
   barra de progreso del medicamento, sin recargar.
3. Toca un día fuera del tratamiento: «Ese día no hay tomas.».
4. Con un tratamiento que cruza de mes, las flechas llevan al otro mes y no más allá.
5. Finaliza el tratamiento de Amoxicilina (spec 016): su marca termina en ese día.
6. Con 7 medicamentos los colores se repiten y los números siguen siendo 1–7.
7. A 390 px no hay desplazamiento horizontal.

## 3. Diseño
Capturas del calendario, el día elegido y la leyenda en 390 y 1280 px, con 1 y 3 medicamentos; se muestran al usuario
para aprobarlas (FR-010).
