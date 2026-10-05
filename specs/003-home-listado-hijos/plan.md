# Plan de Implementación: Home Page — Listado de Hijos

**Rama**: `003-home-listado-hijos` | **Fecha**: 2026-09-16 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/003-home-listado-hijos/spec.md`

## Resumen

Después de crear su cuenta (o al volver en una visita posterior), el padre/tutor llega a una home page que lista sus hijos como tarjetas (nombre + edad en meses/años). Desde ahí puede agregar un hijo nuevo mediante un modal que reutiliza el formulario ya construido en feature 001, respetando el límite freemium existente. Como hoy no existe ningún endpoint para **leer** una cuenta ni para **agregar un hijo a una cuenta ya creada** (feature 001 solo expone `POST /accounts`, que crea todo junto), esta funcionalidad agrega dos endpoints nuevos al backend además del trabajo de frontend. La "sesión" es el `account_id` guardado en el navegador tras el registro — sin autenticación real, por diseño explícito de esta fase.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend), TypeScript + React 18 + Vite (frontend) — stack existente, sin cambios

**Dependencias Principales**: Backend: `chi`, `pgx/v5`, `google/uuid` (todas ya en uso, sin dependencias nuevas). Frontend: React Router (ya en uso para `/signup`), TanStack Query (ya en uso), Tailwind (ya en uso) — sin dependencias nuevas.

**Almacenamiento**: PostgreSQL — sin cambios de esquema (reutiliza las tablas `accounts`/`children` de feature 001, sin migración nueva). El "account_id guardado en el navegador" es `localStorage`, del lado del cliente únicamente (no es una tabla ni un esquema nuevo).

**Pruebas**: `go test` + `testify` (backend, patrón table-driven ya establecido); Vitest + Testing Library (componentes/hooks de frontend); Playwright E2E para el flujo crítico completo (crear cuenta → llegar a home → ver hijo listado → agregar un segundo hijo → ver pop-up freemium), por Principio VI — este flujo cae dentro del alcance MVP explícito de la constitución ("perfiles de niños").

**Plataforma Objetivo**: Misma PWA existente (mobile-first, responsive), mismo backend HTTP

**Tipo de Proyecto**: Aplicación web (Opción 2) — extiende tanto `backend/` como `frontend/`

**Objetivos de Rendimiento**: Listado de hijos visible en menos de 2s tras abrir la home (SC-001 de spec.md)

**Restricciones**: Ningún dato nuevo de salud/médico se introduce en esta funcionalidad (solo nombre/edad, ya capturados en feature 001). El `account_id` funciona como un identificador de acceso de facto (sin login real) — ver nota de Privacidad en Verificación de la Constitución.

**Escala/Alcance**: Un padre ve solo los hijos de su propia cuenta; sin límite de hijos distinto al ya impuesto por el plan (freemium ya construido).

## Verificación de la Constitución

*GATE: Debe aprobarse antes de la investigación de la Fase 0. Volver a verificar tras el diseño de la Fase 1.*

- **Principio I (Registra, Nunca Interpreta)**: No aplica — esta funcionalidad solo lista nombre/edad, no interpreta ni opina sobre ningún dato de salud. ✅ Cumple.
- **Principio II (Privacidad)**: `GET /accounts/{accountId}` no tiene autenticación real — cualquiera que obtenga un `account_id` (UUID de 122 bits, no adivinable en la práctica) puede ver el listado de hijos de esa cuenta. Esto es una continuación deliberada de la misma postura ya aceptada en feature 001/002 (sin login todavía, documentado explícitamente en los Supuestos de spec.md) — no se introduce ningún riesgo nuevo, pero se deja registrado aquí para cuando se diseñe la autenticación real (ver `BACKLOG.md`). No se expone ningún dato médico/de salud en esta funcionalidad, solo nombre y fecha de nacimiento (mismos datos que ya expone `POST /accounts`). ✅ Cumple, con nota.
- **Principio III (Stack Tecnológico Fijo)**: Go + React + PostgreSQL, sin dependencias nuevas. ✅ Cumple.
- **Principio IV (Freemium Disciplinado)**: Reutiliza el límite ya construido (1 hijo gratis) sin modificarlo. ✅ Cumple.
- **Principio V (Simplicidad y MVP Real)**: Esta funcionalidad **sí forma parte del alcance MVP explícito** de la constitución ("perfiles de niños") — a diferencia de la feature 002 (log de errores), no requiere ninguna excepción/justificación en Seguimiento de Complejidad.
- **Principio VI (Cobertura de Pruebas Obligatoria)**: Los dos endpoints nuevos del backend y todos los componentes/hooks nuevos del frontend DEBEN tener cobertura >90%. El flujo completo (crear cuenta → home → listar hijo → agregar hijo → límite freemium) DEBE tener cobertura Playwright E2E, por caer dentro del alcance MVP de "perfiles de niños".

**Resultado**: Aprobado. Sin excepciones que requieran Seguimiento de Complejidad.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/003-home-listado-hijos/
├── plan.md                          # Este archivo
├── research.md                      # Fase 0
├── data-model.md                    # Fase 1
├── contracts/
│   ├── get-account.md               # Fase 1 — GET /accounts/{accountId}
│   └── post-account-children.md     # Fase 1 — POST /accounts/{accountId}/children
├── quickstart.md                    # Fase 1
└── tasks.md                         # Fase 2 (/speckit-tasks)
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── internal/account/
│   ├── model.go            # sin cambios de esquema
│   ├── errors.go           # + ErrAccountNotFound
│   ├── repository.go       # + GetByID(ctx, id), + CreateChild(ctx, accountID, child) — extraído del loop de Create
│   ├── service.go          # + GetAccount(ctx, id), + AddChild(ctx, accountID, input) — reutiliza validateChildFields extraído de validateCreateAccountInput
│   └── handler.go          # + GetAccount (GET /accounts/{accountId}), + AddChild (POST /accounts/{accountId}/children) — ambos usan *httpx.Responder, por la regla de backend/CLAUDE.md
└── cmd/api/main.go         # + 2 rutas nuevas

frontend/
├── src/shared/
│   └── age.ts                        # NUEVO — computeAge(birthDate): meses si <2 años, años completos después (Aclaraciones de spec.md)
├── src/features/account-signup/
│   ├── AccountSignupForm.tsx         # al crear la cuenta: guarda account_id (useAccountSession) y navega a /home, en vez de solo mostrar el mensaje inline
│   └── ChildFieldset.tsx             # REUTILIZADO tal cual desde features/home (sin duplicar el formulario de hijo)
└── src/features/home/                # NUEVO
    ├── HomePage.tsx                  # contenedor: sin cuenta / vacío / listado
    ├── ChildCard.tsx                 # nombre + edad (usa shared/age.ts)
    ├── AddChildModal.tsx             # modal sobre la home, reutiliza ChildFieldset
    ├── useAccountSession.ts          # localStorage: get/set/clear account_id (con try/catch por modo privado)
    ├── api.ts                        # fetchAccount(accountId), addChild(accountId, payload)
    └── types.ts
```

**Decisión de Estructura**: Se extiende `internal/account` (no se crea un paquete nuevo) porque `GetByID`/`AddChild` operan sobre las mismas entidades y reglas de negocio (freemium, validación de nombre) ya implementadas ahí — crear un paquete separado duplicaría esa lógica. En frontend, `features/home/` es una carpeta nueva por convención de "estructura por feature", pero reutiliza `ChildFieldset` de `features/account-signup/` directamente (import cruzado deliberado) en vez de duplicar el formulario de hijo — es el mismo formulario, con el mismo comportamiento de validación.
