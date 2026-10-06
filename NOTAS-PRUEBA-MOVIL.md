# Notas de la prueba en el teléfono (2026-09-28)

Prueba en iPhone por el túnel (`DEPLOY.md`, "Prueba con túnel"). Cada nota: qué se vio, qué se pidió y su estado.

## 1. "Completa los campos faltantes" debe decir qué falta — hecho

- **Dónde**: Nueva consulta (móvil y web), al tocar "Guardar consulta" con campos vacíos. Hoy el aviso de arriba solo
  dice "Completa los campos faltantes." (`ConsultationForm.tsx`) y cada error queda bajo su campo, que en el teléfono
  puede estar fuera de la pantalla.
- **Pedido**: que el mismo aviso diga lo que falta, p. ej. "Falta: la foto de la receta, el nombre del medicamento".
- **Propuesta**: "Falta: la foto de la receta, el doctor, la fecha, el nombre del medicamento, la hora de la primera
  toma" — solo lo que realmente falte, en el orden del formulario; con varios medicamentos, "el nombre del
  medicamento 2". Se mantiene el foco en el primer campo que falta y los errores bajo cada campo.
- **Hecho**: `missingFields.ts` arma "Falta: …" con lo que realmente falta, en el orden del formulario; con varios
  medicamentos agrega "(medicamento N)". Pruebas unitarias y E2E (móvil y web) actualizadas.

## Resultado de los recordatorios en iPhone — funcionan

- App instalada en la pantalla de inicio, túnel HTTPS a la PC. Dispositivo registrado en el servicio de Apple, modo
  "Mostrar detalle". La toma de las 12:20 salió a las 12:20:21 y el aviso llegó al iPhone.
- Primer intento sin aviso: los recordatorios aún no estaban activados en el teléfono (ningún dispositivo registrado).
