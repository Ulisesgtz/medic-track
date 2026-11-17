# Tareas: Primer uso guiado

**Entrada**: `specs/071-primer-uso-guiado/`: spec.md, plan.md, research.md (R1–R12), data-model.md, contracts/first-use-guide.md, quickstart.md y el diseño `referencia/Primer uso guiado PediTrack.dc.html` (estados A0 y A–G, decisiones 1–11).

**Pruebas**: obligatorias (constitución, Principio VI). Más del 90 % de cobertura en lo nuevo del backend y en `features/firstUse/` y `shared/install/`. Las E2E corren a 390 y 1280 px con `scripts/e2e-local.sh` antes de subir.

**Rama**: `feature/071-primer-uso-guiado`. Commit solo cuando el dueño lo pida.

**Reglas que valen para todas las tareas**:
- La guía **nunca** menciona planes, límites ni precios, ni da consejos de salud (FR-025, FR-026). Textos neutrales, sin rojo ni ámbar de alarma, sin felicitaciones; todos en `features/firstUse/firstUseText.ts`.
- **Construir el mock tal cual**: estructura, textos, tamaños y colores de `referencia/`; lo que no se pueda, a `referencia/desviaciones.md` con su motivo.
- Dos diseños con `useIsDesktop`, sin clases responsivas que mezclen ambos (FR-028). 44 px mínimos, texto ≥ 13 px, 4.5:1, ningún estado solo por color (FR-029).
- El resto del inicio **no cambia** (FR-027).
- Toda ruta nueva va en `backend/internal/server/router.go` con su fila en `router_test.go`; las respuestas por `*httpx.Responder`.
- Código en inglés, documentación en español.

## Formato: `[ID] [P?] [Historia] Descripción`

---

## Fase 1: Configuración

- [X] T001 Crear `backend/migrations/0038_first_use_guide.sql` (data-model.md): `ALTER TABLE accounts ADD COLUMN first_use_guide_dismissed_at timestamptz NULL;` y `CREATE INDEX consultations_account_created ON consultations (account_id, created_at, id);`, con el comentario en inglés de qué significa `NULL`. Aplicarla en la base local de desarrollo y anotar en la tarea que el dueño debe aplicarla en DEV **antes** de desplegar el backend. *(Hecho: aplicada en la base local; **el dueño ya la aplicó en DEV** — 2026-11-16.)*
- [X] T002 [P] Crear `frontend/src/features/firstUse/firstUseText.ts` con **todos** los textos del mock (título «Primeros pasos», subtítulos «Tres/Dos pasos, en el orden que quieras.», «Ahora no», títulos y descripciones de los tres pasos en sus variantes teléfono/web/hecho/bloqueado/rechazado, los tres pasos de Safari, los tres de ajustes del teléfono y los tres de la computadora, «Ya los activé», «Ir al paso 2», «Opcional», «Ver consulta», «Tu navegador te pedirá permiso.», «Si prefieres no recibirlos, la app funciona igual.», la despedida, el aviso al cerrar, la fila «Primeros pasos · Ver guía», «¿De quién es la consulta?» y el texto para abrir PediTrack en Safari).

---

## Fase 2: Fundamental (bloquea todas las historias)

- [X] T003 Backend, repositorio: en `backend/internal/account/repository.go` agregar `FirstUseGuide(ctx, accountID) (FirstUseGuide, error)` — `dismissed` desde `first_use_guide_dismissed_at IS NOT NULL` y `firstConsultation` = la consulta más antigua con `consultations.account_id = $1` `ORDER BY created_at, id LIMIT 1` (`id`, `doctor_name`, `child_id` nulo para la propia), `nil` si no hay — y `SetFirstUseGuideDismissed(ctx, accountID, dismissed bool)` (`now()` o `NULL`; `ErrAccountNotFound` si no existe la cuenta). Pruebas con Postgres real en `repository_test.go`: sin consultas, con consulta de un hijo, con consulta propia, con «solo registro», varias consultas (gana la más antigua), cerrar y reabrir, cuenta inexistente.
- [X] T004 Backend, respuesta de la cuenta: en `backend/internal/account/handler.go` agregar `FirstUseGuide *firstUseGuideResponse \`json:"firstUseGuide"\`` (`dismissed`, `firstConsultation {id, doctorName, childId}` o `null`) a `accountResponse` y llenarlo en `GetMe` y `GetAccount` (contracts §1). Pruebas en `handler_test.go` de los dos endpoints con y sin consulta.
- [X] T005 Backend, ruta: `PUT /accounts/{accountId}/first-use-guide` en `handler.go` + `service.go` (`SetFirstUseGuide`), cuerpo `{dismissed: bool}` obligatorio (400 `invalid_request` si falta o no es booleano), 404 con id malformado, responde 200 con el bloque actualizado e idempotente (contracts §2). Registrar en `backend/internal/server/router.go` con `ownsAccount` y su fila en `router_test.go`; **no** agregarla a `AllowedWhilePending` y dejar que `server/deletion_router_test.go` siga pasando. Anotación Swagger y regenerar `internal/docs`. Pruebas del handler y del servicio.
- [X] T006 [P] Backend, descarga de datos: revisar `backend/internal/dataexport/collect.go`; si exporta las columnas de `accounts` por lista explícita, agregar `first_use_guide_dismissed_at` con su prueba; si no, anotarlo en la tarea como revisado. *(Revisado: `collect.go` no exporta la tabla `accounts` —solo hijos, consultas, etc. y joins por nombre—, no hay columna que agregar.)*
- [X] T007 [P] Frontend, tipos y API: `Account.firstUseGuide` en `frontend/src/features/home/types.ts`; `setFirstUseGuide(accountId, dismissed, token)` en `frontend/src/features/firstUse/api.ts` (errores mapeados como `acceptDisclaimer`), con pruebas.
- [X] T008 [P] Frontend, instalación: crear `frontend/src/shared/install/` con `platform()` (`android` · `ios-safari` · `ios-other` · `desktop`; iPadOS por `maxTouchPoints`; CriOS/FxiOS/EdgiOS = `ios-other`), `isRunningInstalled()` (`display-mode: standalone` o `navigator.standalone`) y `installPrompt` (escucha `beforeinstallprompt` con `preventDefault`, guarda el evento, `canInstall()`, `promptInstall()`, escucha `appinstalled`) + hook `useInstallPrompt()`. Arrancar la escucha en `frontend/src/main.tsx`. Hacer que `features/reminders/deviceSupport.ts` y `features/childDevice/phone/ChildTodayPage.tsx` usen `isRunningInstalled`/`isIOS` de aquí en vez de sus copias, sin cambiar su comportamiento. Pruebas con `matchMedia`, `navigator` y eventos simulados.
- [X] T009 [P] Frontend, lógica pura: `frontend/src/features/firstUse/guideSteps.ts` con `guideSteps(input)` (data-model.md «Lógica de los pasos»: hecho/pendiente/bloqueado/no se muestra por plataforma, numeración 1..n, subtítulo de tres/dos/un paso, un solo botón sólido = el primer pendiente con botón no opcional ni bloqueado, `loading` sin botón) y `guideVisibility(input)` (`hidden` / `card` / `done-line` / `gone` y si va la fila de reabrir). Pruebas por tabla de **todas** las combinaciones de plataforma × instalada × puede instalar × estado de recordatorios × consulta, más las reglas de visibilidad (sin hijo propio, solo hijos compartidos, en pausa, aviso sin confirmar, cerrada, completa en el dispositivo).
- [X] T010 [P] Frontend, redacción: `frontend/src/features/firstUse/firstUseText.test.ts` aplica a todos los textos de `firstUseText.ts` la lista prohibida de `features/home/homeText.test.ts` más plan/precio («plan», «gratis», «pago», «precio», «MX$», «premium») y salud («recomend», «diagnóst»); las instrucciones de Safari y de ajustes van con su propia lista sin «toca» (research R11).

**Punto de control**: backend con la ruta y el campo nuevos y probado; lógica de pasos y detección de instalación probadas.

---

## Fase 3: Historia de Usuario 3 – «Antes de empezar» como ventana (P2, va primero porque desbloquea el inicio)

**Objetivo**: el aviso es una ventana que solo se cierra con «Entendido» (estado A0).

**Prueba independiente**: cuenta sin el aviso confirmado → ventana en 390 y 1280 px; Escape y el fondo no la cierran; «Entendido» la cierra y no vuelve al recargar.

- [X] T011 [US3] Convertir `frontend/src/features/home/WelcomeDisclaimer.tsx` en una ventana (research R5): portal a `body`, hoja desde abajo con la rayita en el teléfono y diálogo centrado de 600 px en la web (`useIsDesktop`), fondo `rgba(4,37,43,0.55)`, título h2 «Antes de empezar» con `id` para `aria-labelledby`, `role="dialog"` `aria-modal="true"`, texto actual sin cambios desplazable dentro, «Entendido» sólido (`bg-confirmed`) fijo abajo, `useBodyScrollLock`, foco inicial en el título y Tab que no sale; **Escape y el fondo no cierran**. Misma mutación, `setQueryData` y error `role="alert"` dentro de la ventana; «Guardando…» mientras guarda.
- [X] T012 [US3] En `frontend/src/features/home/HomePage.tsx` montar la ventana fuera de la columna (ya no como primera tarjeta) en ambos diseños, y quitar el contenedor `empty:hidden` que la envolvía en el teléfono.
- [X] T013 [US3] Actualizar `WelcomeDisclaimer.test.tsx` y `HomePage.test.tsx`: es un diálogo con su título, Escape y clic en el fondo no la cierran, el foco empieza dentro y no sale, «Entendido» guarda la versión servida y cierra, el error deja la ventana abierta con el aviso, no aparece con el aviso confirmado.
- [X] T014 [US3] Revisar las E2E y sus helpers (`frontend/e2e/`) que entran al inicio de una cuenta que no confirmó el aviso: confirmarlo en el helper (o tocar «Entendido» donde la prueba es justo sobre el aviso). Correr las afectadas con `scripts/e2e-local.sh`.

**Punto de control**: el inicio de una cuenta nueva abre con la ventana y todas las E2E existentes siguen pasando.

---

## Fase 4: Historia de Usuario 1 – Saber qué hacer primero (P1) 🎯 MVP

**Objetivo**: la tarjeta «Primeros pasos» con el paso 1 y el elegir hijo (estados A, B, E, G).

**Prueba independiente**: cuenta nueva con un hijo → guía con los pasos pendientes → «Nueva consulta» → guardar → paso 1 hecho con «Ver consulta».

- [X] T015 [US1] `frontend/src/features/firstUse/useFirstUseGuide.ts`: junta la cuenta (`['accounts','me']`), `platform()`, `isRunningInstalled()`, `useInstallPrompt()`, el estado del hook de recordatorios existente y la marca de `localStorage` `peditrack.firstUse.done.<accountId>` (lectura y escritura en `try/catch`); devuelve los pasos y la visibilidad de `guideSteps`/`guideVisibility`. Escribe la marca al llegar a «todo hecho». Pruebas.
- [X] T016 [US1] `frontend/src/features/firstUse/FirstUseGuide.tsx` con dos diseños medidos del mock (teléfono: padding 18/18/4, título 18 px, pasos con círculo de 36 px; web: padding 22/24/4, título 20 px, círculo de 40 px y botones en una columna de 224 px a la derecha): encabezado con «Ahora no», cada paso con su círculo (número con contorno, check verde `role="img"` «Hecho», candado punteado), título, «Opcional», descripción, enlace y botón sólido o de contorno según `guideSteps`. Se monta en `HomePage.tsx` entre `Greeting` y `TuDia` en ambos diseños.
- [X] T017 [US1] Paso 1: con un hijo propio, el botón es la entrada de «Nueva consulta» de ese hijo (reutilizar `NewConsultationEntry` o su lógica, así respeta la spec 030 y la guía no habla del plan); con varios, abre `frontend/src/features/firstUse/ChildPickerDialog.tsx` («¿De quién es la consulta?», un botón por hijo propio, patrón de `ConfirmDialog`: hoja en el teléfono, centrado en la web, Escape y fondo cancelan, foco restaurado). Hecho: «Registraste la consulta con {doctor}.» y «Ver consulta» (`/consultations/:id`, o la ruta de la consulta propia si `childId` es nulo).
- [X] T018 [US1] Despedida (estado E): la línea verde `role="status"` «Los tres pasos están hechos. Esta guía ya no se mostrará.» (o «Los dos pasos…»), que se quita a los 8 s o al salir del inicio, y después nada en ese dispositivo.
- [X] T019 [US1] Pruebas de componente: estados A, B, E y G en ambos diseños, un solo botón sólido, elegir hijo con varios, consulta propia, nada de la guía sin hijo propio / con solo hijos compartidos / con la cuenta en pausa / con el aviso sin confirmar.

**Punto de control**: MVP — la guía aparece y el paso 1 funciona de punta a punta.

---

## Fase 5: Historia de Usuario 2 – Instalar y activar los avisos en cada dispositivo (P1)

**Objetivo**: pasos 2 y 3 por plataforma (estados C y D).

**Prueba independiente**: cada plataforma simulada muestra su paso 2 y su paso 3; con el permiso rechazado, las instrucciones y «Ya los activé».

- [X] T020 [P] [US2] `frontend/src/features/firstUse/SafariInstallSteps.tsx`: el dibujo de la barra de Safari del mock (SVG `role="img"` con su `aria-label`) y los tres pasos con su ícono (Compartir, «+», «Agregar») y la nota de que se marcará solo; reutilizar el arte de `features/childDevice/phone/installArt.tsx` si coincide, si no el SVG del mock.
- [X] T021 [US2] Paso 2 en `FirstUseGuide.tsx`: Android con `canInstall` → «Instalar» (`promptInstall()`); Android sin `canInstall` → instrucciones del menú del navegador; `ios-safari` → `SafariInstallSteps`; `ios-other` → abrir PediTrack en Safari; computadora con `canInstall` → «Opcional» y botón con contorno; computadora sin `canInstall` → no aparece y el subtítulo dice «Dos pasos…».
- [X] T022 [US2] Paso 3 en `FirstUseGuide.tsx`: «Activar recordatorios» con «Tu navegador te pedirá permiso.» llama la **misma** activación del hook de recordatorios (con la elección de detalle o genérico la primera vez); `ios-needs-install` → candado y «Ir al paso 2» (lleva el foco y la vista al paso 2); `denied` → los tres pasos de ajustes (teléfono o computadora), «Ya los activé» (lee `Notification.permission` y, si es `granted`, activa; si no, no cambia nada y no vuelve a pedir el permiso) y la nota; `unsupported`/`unavailable` → no aparece.
- [X] T023 [US2] Pruebas de componente de los estados C y D en ambos diseños y de cada rama de los pasos 2 y 3 (con `installPrompt` y el hook de recordatorios simulados).

**Punto de control**: los tres pasos funcionan en cada plataforma.

---

## Fase 6: Historia de Usuario 4 – Cerrar la guía y volver a abrirla (P2)

**Objetivo**: «Ahora no», el aviso, la fila y reabrir (estado F).

**Prueba independiente**: cerrar → aviso y fila; recargar → sigue cerrada; tocar la fila → vuelve.

- [X] T024 [US4] En `useFirstUseGuide.ts`: `dismiss()` y `reopen()` con `setFirstUseGuide` dentro de `guardMutation` (sin conexión: el aviso de «necesita conexión» de siempre y nada cambia); al responder, escribir el bloque en `['accounts','me']`.
- [X] T025 [US4] «Ahora no» oculta la tarjeta y muestra el aviso `role="status"` «Cerraste la guía. Puedes volver a abrirla en Primeros pasos, al final del inicio.» (fondo `ink`, 8 s), en ambos diseños como en el mock.
- [X] T026 [US4] `frontend/src/features/home/MoreLinks.tsx`: fila opcional «Primeros pasos · Ver guía» como primera (texto en `action`), solo cuando `guideVisibility` lo pide; en la web la franja pasa a `grid-cols-6` solo con esa fila. Tocarla llama `reopen()`.
- [X] T027 [US4] Pruebas: cerrar, aviso de 8 s, fila en ambos diseños, reabrir, sin conexión no cambia nada, la fila no aparece con la guía visible ni completa.

**Punto de control**: las cuatro historias funcionan por separado.

---

## Fase 7: Pulido y validación

- [X] T028 E2E `frontend/e2e/primer-uso.spec.ts` a 390 y 1280 px (research R12): cuenta nueva → ventana (Escape no cierra) → «Entendido» → guía → «Ahora no» → aviso y fila → recargar → sigue cerrada → reabrir → «Nueva consulta» → guardar → paso 1 hecho; en Chromium con el permiso de notificaciones concedido, el paso 3 queda hecho. Correr con `scripts/e2e-local.sh e2e/primer-uso.spec.ts` (y Firefox/WebKit con `E2E_PROJECT`).
- [X] T029 Comparar con el mock: renderizar los estados A0 y A–G a 390 y 1280 px, ponerlos lado a lado con `referencia/` sección por sección y escribir `referencia/desviaciones.md` con cada diferencia y su motivo.
- [X] T030 [P] Cobertura: `cd backend && go test ./... -cover` y `cd frontend && npx vitest run --coverage` por encima del 90 %.
- [X] T031 [P] Documentación: entrada de la spec 071 en `CLAUDE.md`; `backend/CLAUDE.md` (la ruta, el campo de la cuenta y la migración `0038` en la lista); `frontend/CLAUDE.md` (`features/firstUse/`, `shared/install/`, la ventana del aviso); `BACKLOG.md` (lo que quede fuera, p. ej. métricas de la guía y la guía para invitados si el dueño la quiere).
- [X] T032 Recorrer `quickstart.md` en local; dejar anotados para el dueño la `0038` en DEV y la prueba en un iPhone real (instalar desde Safari y activar los avisos).
  - *Anotado para el dueño (2026-11-16): (1) **probar en un iPhone real** — abrir PediTrack en Safari, seguir los tres pasos de «Compartir», abrirla desde el ícono (el paso 2 se marca solo) y activar los avisos; (2) actualizar el aviso de privacidad si hace falta; (3) la migración `0038` **ya está aplicada en DEV** por el dueño. El recorrido de `quickstart.md` se cubrió con `e2e/primer-uso.spec.ts` (Chromium, Firefox y WebKit, 390 y 1280 px) y con las medidas de `referencia/desviaciones.md`.*

---

## Dependencias y orden

- **Fase 1 → Fase 2** (T003–T005 necesitan T001; T009 y T010 necesitan T002).
- **Fase 3 (US3)** antes que las demás historias: la ventana cambia el inicio y las E2E existentes.
- **Fase 4 (US1)** necesita T004, T007, T008, T009. **Fase 5 (US2)** y **Fase 6 (US4)** necesitan la Fase 4 (la tarjeta) y pueden ir en paralelo entre sí (archivos distintos salvo `FirstUseGuide.tsx`: hacer T021–T022 y T025 uno tras otro).
- **Fase 7** al final.

## Paralelo

- Fase 2: T006, T007, T008, T009 y T010 en paralelo (archivos distintos) mientras T003→T004→T005 van en orden.
- Fase 5: T020 en paralelo con T024 y T026.
- Fase 7: T030 y T031 en paralelo.

## Estrategia

1. **MVP**: Fases 1–4 (ventana + guía con el paso 1) ya resuelven «no sé qué hacer primero».
2. Después la Fase 5 (instalar y avisos) y la Fase 6 (cerrar y reabrir).
3. Pulido, comparación con el mock y E2E antes de subir.

**Total**: 32 tareas — Configuración 2, Fundamental 8, US3 4, US1 5, US2 4, US4 4, Pulido 5.
