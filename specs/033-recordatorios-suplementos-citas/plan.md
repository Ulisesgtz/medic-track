# Plan de Implementación: Rutinas de suplementos (parte 1 de la spec 033)

**Rama**: `feature/033-recordatorios-suplementos-citas` | **Fecha**: 2026-10-06 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Historias 1 a 3 de `specs/033-recordatorios-suplementos-citas/spec.md` (rutinas de suplementos de los hijos, compartidas con la familia, solo plan de pago).
Las partes 2 (próxima cita, historias 4–5) y 3 (rutinas personales, historia 6) se planean después en este mismo directorio.

## Resumen

Una **rutina de suplemento** es del padre, no del registro médico: se crea, se edita, se pausa y se finaliza. El plan agrega **tres tablas** (`supplement_routines`,
`supplement_doses`, `supplement_dose_reminders`) más una de silencios por persona (`supplement_muted`) y **no toca** `doses` ni `dose_reminders` (R1). Las tomas se **generan
con un horizonte que avanza** (14 días; el planificador de 30 s ya existente las extiende, R2) en la hora local que manda el cliente (R3). Pausar, editar y finalizar **borran
solo las tomas futuras sin marcar** (R4); lo pasado y lo marcado nunca se toca. El estado de la toma usa la regla de «sin registrar» de la 013 con la cadencia de la rutina (R5).
El **plan lo decide el servidor** bajo bloqueo de fila: crear, editar y reanudar piden plan de pago; pausar, finalizar, marcar, ver y «Tus avisos» no (R6). Los permisos usan los niveles
de la 032 con un resolvedor más, `access.OnRoutine` (R7). Los **avisos son por persona** con un segundo reclamo igual al de las tomas y un silencio por persona y rutina («Tus avisos»,
R8); «Tomada» desde el aviso sirve también para suplementos. **«Tomas de hoy»** del hijo mezcla ambas fuentes (R9). El frontend gana la sección «Suplementos», el formulario en página,
el detalle y el diálogo de finalizar, **del mock entregado** (`referencia/suplementos-decisiones.md`), con sus dos diseños. Una migración (`0019`), sin dependencias nuevas. El modelo
deja `child_id` nulo permitido para las rutinas personales de la parte 3 (R12).

## Contexto Técnico

**Lenguaje/Versión**: Go (backend) y TypeScript + React 19 (frontend). **Dependencias**: ninguna nueva.
**Almacenamiento**: PostgreSQL; migración `0019` (rutinas, tomas, recordatorios por persona, silencios).
**Pruebas**: `go test ./... -cover` (>90 %, con `DATABASE_URL`), Vitest + Testing Library (>90 %), Playwright a 390 y 1280 px con **dos sesiones** (Tutor y Cuidador).
**Plataforma Objetivo**: PWA (móvil y escritorio) + API en Railway; Clerk de desarrollo en las E2E.
**Tipo de Proyecto**: aplicación web (backend Go + frontend React).
**Objetivos de Rendimiento**: una marca visible para las demás personas en < 1 min con la app abierta (refresco de 60 s ya existente); el reclamo de avisos sigue siendo una
consulta indexada; el horizonte no agrega consultas al camino de lectura.
**Restricciones**: toda respuesta por `*httpx.Responder`; **cada ruta con su nivel de acceso y su fila por rol en `router_test.go`**; el nombre y la nota de la rutina **nunca** en
direcciones ni en `error_logs`; Swagger regenerado; dos diseños (móvil/web) sin mezclar; textos del Principio I (nada sugiere suplementos, dosis ni horarios); el plan lo decide el servidor.
**Escala/Alcance**: hasta 10 rutinas activas por hijo, hasta 6 horas por rutina, sin correo saliente.

## Verificación de la Constitución

*Antes de la investigación y de nuevo tras el diseño:*

- **I (registra, nunca interpreta)**: la app guarda y recuerda lo que el padre escribió; placeholders sin ejemplos de suplementos («Como lo llaman en casa»), frase fija «PediTrack guarda lo
  que escribas tal cual», ningún catálogo, dosis ni sugerencia; la vista previa de horas es aritmética de lo capturado; «sin registrar» sin rojo ni ámbar. ✅
- **II (privacidad)**: nombre y nota solo en cuerpos JSON; el aviso genérico no lleva rutina, hijo ni doctor; se actualiza «Antes de empezar» (se sube la versión); nada sensible en `error_logs`. ✅
- **III (stack)**: Go + React PWA + PostgreSQL. ✅
- **IV (freemium disciplinado)**: crear/editar es una **función** de pago; si la cuenta deja de pagar **nada se oculta**, se sigue marcando y **los avisos ya creados siguen** (FR-020). ✅
- **V (simplicidad)**: sin generalizar `doses` (R1); sin dependencias; se difieren la cita y lo personal; la preferencia «Tus avisos» es una tabla de silencios, no un sistema de notificaciones. ✅
  *(Complejidad inherente: la generación de tomas y las transiciones de la rutina.)*
- **VI (pruebas)**: tabla de periodicidades, carreras, avisos por persona, matriz rol × ruta, privacidad, E2E con dos sesiones. ✅
- **Inmutabilidad de las consultas (spec 004)**: no se toca; las rutinas no son registro médico, por eso se pueden editar. ✅

Re-evaluación tras el diseño: sin violaciones que justificar.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/033-recordatorios-suplementos-citas/
├── spec.md                       # historias, requisitos, criterios (aclarada)
├── plan.md                       # Este archivo (parte 1)
├── research.md                   # R1–R13
├── data-model.md                 # migración 0019
├── quickstart.md                 # guía de validación de la parte 1
├── contracts/routines.md         # API de rutinas
├── referencia/suplementos-decisiones.md   # decisiones y desviaciones del mock de Claude Design
├── checklists/requirements.md
└── tasks.md                      # lo crea /speckit-tasks
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── migrations/0019_create_supplement_routines.sql
├── internal/supplement/                 # NUEVO
│   ├── model.go  errors.go              # Routine, Dose, Period, Status, errores de dominio
│   ├── schedule.go                      # generador de tomas (puro): periodicidades, hora local, fin, horizonte
│   ├── status.go                        # estado de la toma (R5), puro
│   ├── repository.go                    # CRUD, tope y plan bajo bloqueo, pausar/reanudar/editar/finalizar, marcas con autor, silencios
│   ├── service.go  validate.go          # reglas del formulario y del plan
│   ├── handler.go                       # rutas de contracts/routines.md (Swagger)
│   └── horizon.go                       # extiende las rutinas activas (lo llama el planificador)
├── internal/access/                     # + OnRoutine
├── internal/authmw/                     # (sin cambio: RequireAccess ya recibe cualquier AccessCheck)
├── internal/consultation/               # overview: agrega las tomas de suplemento (kind, routineId)
├── internal/reminder/                   # ClaimDueSupplementDoses, silencios, payload con routineId, «Tomada» también de suplemento
└── internal/server/router.go            # rutas nuevas con su nivel + router_test.go por rol

frontend/src/features/supplements/       # NUEVO
├── types.ts  api.ts  scheduleText.ts    # formas, endpoints, «Todos los días · 08:00», vista previa de horas (puro)
├── useRoutines.ts  useRoutine.ts  useRoutineMutations.ts
├── SupplementsSection.tsx  RoutineCard.tsx  RoutineForm.tsx  RoutineFormPage.tsx
├── RoutineDetailPage.tsx  RoutineCalendar.tsx  FinishRoutineDialog.tsx  MyRemindersToggle.tsx
└── (pruebas junto a cada archivo)
frontend/src/features/consultations/     # ChildDetailPage: sección; TodayDoses*: chip «SUPLEMENTO» y el PATCH de suplemento
frontend/src/features/reminders/         # notification.ts: routineId → /suplementos/:id
frontend/src/App.tsx                     # tres rutas
frontend/e2e/suplementos.spec.ts  suplementos-recordatorios.spec.ts
```

**Decisión de Estructura**: aplicación web existente (backend Go + frontend React); un paquete de dominio nuevo (`internal/supplement`) y un feature nuevo (`features/supplements`), reutilizando
`access`, `reminder` y la regla de plan del servidor.

## Orden de entrega dentro de la parte 1

1. Migración + generador + estado de la toma (puros y probados).
2. Repositorio y servicio: crear/ver/marcar con plan y tope bajo bloqueo; rutas y matriz por rol.
3. Pausar, reanudar, editar, finalizar; horizonte en el planificador.
4. Avisos por persona + «Tus avisos» + «Tomada»; overview con tomas de suplemento.
5. Frontend: sección, tarjeta y «Tomas de hoy»; formulario; detalle y calendario; diálogo; «Tus avisos»; plan y tope.
6. E2E a 390 y 1280 px, documentación (`CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `DEPLOY.md`), aviso «Antes de empezar» y `CurrentDisclaimerVersion`.

## Seguimiento de Complejidad

Sin violaciones de la constitución que justificar. Dos puntos a vigilar: (a) la **duplicación controlada** del reclamo de avisos (medicamentos y suplementos) para no tocar la llave primaria de
`dose_reminders`; si en una parte futura se unifica, es una migración propia; (b) la diferencia horaria **fija** por rutina (R3), que un viaje obliga a editar.
