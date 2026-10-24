# Guía de validación: Dispositivo del hijo (spec 047)

Prerrequisitos: base local con las migraciones hasta la `0029`, backend y frontend corriendo (ver `backend/CLAUDE.md` y `frontend/CLAUDE.md`), un Tutor con plan de pago y un hijo. Detalle de datos en [data-model.md](data-model.md), de rutas en [contracts/api.md](contracts/api.md).

## 1. Generar y canjear (US1)
1. Como Tutor, en la ficha del hijo: «Acceso del hijo» → nombre «Teléfono de Mateo» → «Crear liga». Se ve la liga una sola vez con su vencimiento y el aviso de responsabilidad del padre.
2. En una ventana privada (sin sesión) abre la liga: entra directo a «Tus tomas de hoy». No se pidió ningún dato.
3. Abre la misma liga otra vez: «esta liga ya no sirve». Pasa igual con una liga inventada.
4. Sin plan de pago, «Crear liga» muestra el aviso del plan y no crea nada.

## 2. El hijo ve y marca solo lo suyo (US2)
1. En la ventana del hijo marca una toma: queda «por Mateo, HH:MM». El Tutor la ve en menos de 1 minuto.
2. Marca desde el Tutor otra toma; en la ventana del hijo intenta quitarla: no puede. Quita la suya: sí.
3. Con la credencial del hijo (`Authorization: Device …`) llama a `/accounts/me`, `/family`, `/consultations/{id}`, la cartilla y `/children/{otro}/overview`: todo se rechaza (401/403) y no devuelve datos.

## 3. Quitar al instante (US3)
1. El Tutor ve la lista con nombre, desde cuándo y última vez; quita el dispositivo.
2. La ventana del hijo, en su siguiente petición (≤ 5 s), dice «Este acceso ya no está activo…».
3. Con 3 dispositivos, generar el cuarto pide quitar uno.
4. Un Cuidador ve la lista pero no tiene «Crear liga» ni «Quitar».

## 4. Avisos (US4)
1. En la vista del hijo, activa los avisos. Con una toma que vence (o con el reloj de pruebas) llega **un** aviso; si el Tutor ya la marcó, no llega.
2. Toca «Tomada» en el aviso: queda «por Mateo». Quita el dispositivo: el siguiente aviso ya no llega.

## 5. Plan caducado (US5)
Pon la cuenta dueña en `free` (`UPDATE accounts SET plan = 'free' …`): el hijo sigue marcando; «Crear liga» pide el plan. Vuelve a `paid` y funciona.

## Pruebas automáticas
```bash
cd backend && go test ./internal/childdevice ./internal/server ./internal/reminder ./internal/consultation ./internal/supplement -cover
cd frontend && npx vitest run src/features/childDevice --coverage && npx playwright test e2e/hijo.spec.ts
```
E2E con dos sesiones a 390 y 1280 px (Chromium).
