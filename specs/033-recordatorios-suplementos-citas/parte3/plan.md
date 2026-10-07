# Plan: Rutinas personales (parte 3 de la spec 033, historia 6)

**Rama**: `feature/033c-rutinas-personales` · **Spec**: [../spec.md](../spec.md) (US6, FR-015, FR-016, FR-017) · **Diseño**: [../referencia/rutinas-personales-decisiones.md](../referencia/rutinas-personales-decisiones.md) y el mock `Rutinas Personales PediTrack.dc.html`.

## Resumen

La persona de la cuenta crea rutinas de suplemento **para sí misma**. Es la misma tabla `supplement_routines` con `child_id` nulo (la parte 1 ya
dejó la puerta abierta): `account_id` y `created_by_account_id` son **la propia persona**. Mismas tomas, calendario, progreso, pausar / editar /
finalizar y «Tus avisos», pero **nadie más las ve y los avisos llegan solo a su dueña**. Sin pantallas de push nuevas.

## Decisiones

- **Acceso**: una rutina sin hijo es `Full` para su cuenta dueña y `None` para cualquier otra persona (la pareja, un Tutor, un Cuidador). Sale en
  `access.onRoutineQuery` (hoy un `JOIN children` la deja en `None`). Las rutas `/routines/{id}/…` de la parte 1 sirven igual.
- **Plan** (decisión del dueño): el de **su propia cuenta**; si no es de pago, vale el de **una familia de pago a la que pertenece como
  integrante activo**. Se calcula en cada petición (`routineSelect` devuelve `paid`/`free` con esa regla para rutinas sin hijo). Crear, editar y
  reanudar piden plan; ver, marcar, pausar, finalizar y «Tus avisos», nunca. Lo ya creado sigue generando tomas y avisos (FR-020).
- **Tope**: 10 activas **por persona** (aparte del de cada hijo); pausar o finalizar libera; reanudar también lo cuenta.
- **Rutas nuevas** (solo la dueña, `ownsAccount`): `GET /accounts/{accountId}/routines?from&to` (lista con tomas de la ventana, progreso, tope,
  plan efectivo y `noticeSeen`), `POST /accounts/{accountId}/routines` (crear), `POST /accounts/{accountId}/routines/notice-seen` («Entendido»,
  idempotente). Todo por el `Responder`.
- **Aviso de primera vez por cuenta**: tabla nueva `personal_routine_notices (account_id PK, seen_at)` (migración `0021`), sin tocar `accounts`.
- **Avisos**: `ClaimDueSupplementDoses` junta la rama personal (solo la dueña; sin nombre de hijo). «Tomada» del aviso marca la toma personal si el
  dispositivo es de la dueña. Un aviso personal no lleva `child`.
- **Frontend**: `features/supplements/` ganan el modo personal (mismas piezas con textos propios); bloque «Personal · Mis suplementos» en el
  inicio (ambos diseños), grupo «Personal» e «Inicio» en la barra lateral web, rutas `/mis-suplementos`, `/mis-suplementos/nueva`; el detalle y
  la edición reutilizan `/suplementos/:id` y `/suplementos/:id/editar`. `TomaChip` sin autor dice «a las HH:MM».
- **Texto legal**: la parte 1 ya subió `CurrentDisclaimerVersion`; esta parte no cambia el aviso «Antes de empezar» (el aviso de primera vez es
  propio de la sección).

## Verificación de la constitución

- **I (registra, nunca interpreta)**: sin sugerencias ni ejemplos de suplementos; frase fija «PediTrack guarda lo que escribas tal cual…».
- **II (privacidad)**: la rutina personal no se comparte; el push no lleva el nombre de la persona; nada de esto en `error_logs`.
- **IV (lo registrado nunca se oculta)**: un plan caducado no oculta ni detiene nada.
- **VI (pruebas)**: >90 % unitarias, E2E a 390 y 1280 px con dos sesiones (la pareja no la ve).
