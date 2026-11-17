# Plan de Implementación: Primer uso guiado

**Rama**: `feature/071-primer-uso-guiado` | **Fecha**: 2026-11-16 | **Especificación**: [spec.md](spec.md)

**Entrada**: Especificación de la funcionalidad desde `specs/071-primer-uso-guiado/spec.md`

## Resumen

Tras el registro, el inicio muestra «Antes de empezar» como **ventana** (hoja en el teléfono, diálogo de 600 px en la web, solo se cierra con «Entendido», misma confirmación de la spec 010) y, después, la tarjeta **«Primeros pasos»** entre el saludo y «Tu día»: (1) registrar la primera consulta, (2) instalar la app, (3) activar los recordatorios, en cualquier orden y marcados solo cuando de verdad pasaron. «Ahora no» se guarda **por cuenta** (columna nueva en `accounts` y un `PUT`), la condición del paso 1 llega en la respuesta de la cuenta (la consulta más antigua), y los pasos 2 y 3 y «completa» se leen y guardan **en el dispositivo**. Sin cambios en el resto del inicio. Diseño: `referencia/Primer uso guiado PediTrack.dc.html` (estados A0 y A–G).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend), TypeScript + React 19 (frontend PWA).

**Dependencias Principales**: chi, pgx v5, Clerk (sesión); React Router, TanStack Query 5, Tailwind v4, `vite-plugin-pwa`. **Sin dependencias nuevas.**

**Almacenamiento**: PostgreSQL — migración `0038` (una columna en `accounts` y un índice en `consultations`); `localStorage` para «completa en este dispositivo».

**Pruebas**: `go test` (repositorio con Postgres real, handler, router), Vitest + Testing Library (lógica pura de pasos, ventana, tarjeta, `MoreLinks`, redacción), Playwright `e2e/primer-uso.spec.ts` a 390 y 1280 px con `scripts/e2e-local.sh`.

**Plataforma Objetivo**: PWA en iPhone (Safari), Android (Chrome) y navegadores de escritorio; API en Railway.

**Tipo de Proyecto**: aplicación web (backend + frontend).

**Objetivos de Rendimiento**: `/accounts/me` no debe notar la consulta nueva (un `EXISTS`/`LIMIT 1` sobre un índice); la guía aparece con la cuenta, sin otra petición ni parpadeo.

**Restricciones**: Principio I (sin consejos ni juicios), sin hablar del plan, dos diseños separados con `useIsDesktop`, 44 px mínimos y 4.5:1, accesible con teclado y lector de pantalla, sin conexión se comporta como el resto (spec 067).

**Escala/Alcance**: 1 endpoint nuevo, 1 campo nuevo en la cuenta, 1 migración, ~6 componentes nuevos en `features/firstUse/` y `shared/install/`, cambios en `WelcomeDisclaimer`, `HomePage`, `MoreLinks` y `main.tsx`.

## Verificación de la Constitución

| Principio | Cumple | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | Sí | La guía solo dice qué pasos hay y si ya pasaron; textos sin consejos de salud, probados con una lista prohibida (R11). El aviso conserva su texto. |
| II. Privacidad | Sí | El dato nuevo de la cuenta no es de salud; el doctor de la primera consulta solo viaja a su dueña. La instalación y los permisos se leen en el dispositivo y no se mandan al servidor. Nada nuevo en direcciones ni en `error_logs`. |
| III. Stack fijo | Sí | Go + Postgres + React PWA; sin librerías nuevas (diálogos a mano como los existentes). |
| IV. Freemium disciplinado | Sí | La guía no lee ni menciona el plan; el paso 1 usa la entrada de «Nueva consulta» que ya respeta la regla del plan gratuito (spec 030). |
| V. Simplicidad | Sí | Una columna en vez de una tabla; el paso 1 sale de la respuesta de la cuenta; se reutilizan el hook de recordatorios y el patrón de diálogos. |
| VI. Cobertura | Sí | Lógica de pasos pura y probada por combinaciones; backend con repositorio y handler; E2E del flujo crítico (ventana, guía, cerrar/reabrir, paso 1) a 390 y 1280 px. |

**Gate**: aprobado antes de la Fase 0 y de nuevo tras el diseño (sin violaciones).

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/071-primer-uso-guiado/
├── spec.md
├── plan.md                 # este archivo
├── research.md             # R1–R12
├── data-model.md           # migración 0038, estados y lógica de pasos
├── quickstart.md
├── contracts/
│   └── first-use-guide.md  # respuesta de la cuenta + PUT
├── checklists/requirements.md
├── referencia/Primer uso guiado PediTrack.dc.html
└── tasks.md                # /speckit-tasks
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── migrations/0038_first_use_guide.sql
├── internal/account/
│   ├── repository.go        # firstUseGuide(accountID): dismissed + consulta más antigua; SetFirstUseGuideDismissed
│   ├── service.go           # SetFirstUseGuide
│   ├── handler.go           # accountResponse.FirstUseGuide; PUT /accounts/{accountId}/first-use-guide
│   └── *_test.go
├── internal/server/router.go  # registrar la ruta con ownsAccount (no en AllowedWhilePending)
└── internal/dataexport/       # solo si exporta columnas de accounts por lista

frontend/src/
├── main.tsx                         # arrancar la escucha de beforeinstallprompt
├── shared/install/                  # platform(), isRunningInstalled(), installPrompt + useInstallPrompt
├── features/reminders/deviceSupport.ts  # usar shared/install para isInstalled/isIOS (sin duplicar)
├── features/home/
│   ├── WelcomeDisclaimer.tsx        # pasa a ventana (DisclaimerDialog), misma mutación
│   ├── HomePage.tsx                 # monta la ventana; FirstUseGuide entre Greeting y TuDia (ambos diseños)
│   ├── MoreLinks.tsx                # fila opcional «Primeros pasos · Ver guía» (web: 6 columnas)
│   └── types.ts                     # Account.firstUseGuide
├── features/firstUse/
│   ├── guideSteps.ts                # lógica pura: pasos, numeración, botón sólido, visibilidad
│   ├── useFirstUseGuide.ts          # junta cuenta + dispositivo + recordatorios; PUT con guardMutation
│   ├── FirstUseGuide.tsx            # tarjeta (phone / desktop), despedida y aviso al cerrar
│   ├── SafariInstallSteps.tsx       # dibujo de la barra de Safari + tres pasos
│   ├── ChildPickerDialog.tsx        # «¿De quién es la consulta?» con varios hijos
│   ├── firstUseText.ts              # todos los textos
│   ├── api.ts                       # setFirstUseGuide(accountId, dismissed)
│   └── *.test.ts(x)                 # lógica, componentes y redacción
└── e2e/primer-uso.spec.ts           # 390 y 1280 px
```

**Decisión de Estructura**: aplicación web existente (`backend/` + `frontend/`); la guía es un módulo nuevo `features/firstUse/` y la detección de instalación se junta en `shared/install/` porque hoy está repetida en tres lugares.

## Orden sugerido

1. Migración `0038` (aplicar en DEV antes del backend) → backend (repositorio, servicio, handler, ruta, Swagger, pruebas).
2. `shared/install/` y la lógica pura `guideSteps` con sus pruebas.
3. La ventana «Antes de empezar» (US3) — también desbloquea las E2E que entran al inicio de una cuenta nueva.
4. La tarjeta y el paso 1 (US1), los pasos 2 y 3 (US2), cerrar y reabrir (US4).
5. Comparar con el mock a 390 y 1280 px, listar desviaciones en `referencia/desviaciones.md`, E2E con `scripts/e2e-local.sh`, actualizar `CLAUDE.md`, `backend/CLAUDE.md` y `frontend/CLAUDE.md`.

## Pendientes y riesgos

- **Confirmar con el dueño**: una persona invitada que solo ve hijos compartidos no ve la guía (R4).
- **E2E existentes**: la ventana tapa el inicio de una cuenta que no confirmó el aviso; revisar los helpers que crean cuentas (R12).
- **iPhone real**: la instalación y los avisos en iOS solo se prueban de verdad en un iPhone (pendiente del dueño, como en la spec 011).
- **Migración**: aplicar la `0038` en DEV antes del merge.

## Seguimiento de Complejidad

Sin violaciones de la constitución que justificar.
