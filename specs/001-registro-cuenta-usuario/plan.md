# Plan de Implementación: Registro de Cuenta de Usuario y Perfiles de Hijos

**Rama**: `feature/001-registro-cuenta-usuario` | **Fecha**: 2026-09-15 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/001-registro-cuenta-usuario/spec.md`

**Nota**: Esta plantilla es completada por el comando `/speckit-plan`; su definición describe el flujo de ejecución.

## Resumen

Formulario web (PWA) de creación de cuenta para padres/tutores de PediTrack: captura datos del tutor (nombre, apellido, correo obligatorios; país/estado opcionales vía catálogo) y permite agregar dinámicamente cero o más hijos (nombre, apellido, fecha de nacimiento obligatorios; talla/peso opcionales). Aplica la regla freemium (1 hijo gratis por cuenta) mostrando un banner de upgrade al intentar agregar un segundo hijo, sin perder datos ya capturados. No incluye autenticación real (solo se guarda el correo como dato) ni interpretación médica de los datos — solo captura y persistencia.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.23+ (backend) · TypeScript 5.x + React 18 (frontend)

**Dependencias Principales**: Backend: `net/http` de la librería estándar + router `chi` (ligero, idiomático, sin imponer un framework pesado — alineado con Principio V de simplicidad); `pgx` como driver de PostgreSQL. Frontend: React Hook Form (manejo de arreglo dinámico de hijos con validación por campo); TanStack Query (mutación de guardado); Tailwind (estilos).

**Almacenamiento**: PostgreSQL (Principio III de la constitución)

**Pruebas**: Backend: `go test` con tests table-driven + `testify/assert` para aserciones, coverage vía `go test -cover` (meta >90%, Principio VI). Frontend: Vitest + Testing Library para componentes/hooks (coverage >90%); Playwright para el flujo E2E completo de creación de cuenta (Principio VI).

**Plataforma Objetivo**: Web — PWA responsive (desktop y móvil) servida por el frontend React; backend Go como servicio HTTP en contenedor Linux.

**Tipo de Proyecto**: Aplicación web (frontend + backend separados) — Opción 2 de la estructura estándar.

**Objetivos de Rendimiento**: Guardado de cuenta con respuesta p95 < 500ms bajo carga normal (sin escala masiva esperada en esta fase). Interacciones de UI (agregar/quitar bloque de hijo) deben sentirse instantáneas (<100ms, sin llamada al servidor).

**Restricciones**: Debe funcionar correctamente como PWA instalada en iOS/Android (Principio III); catálogo de país/estado debe cargar sin bloquear la interacción del resto del formulario; no requiere soporte offline en esta fase (el registro necesita conexión).

**Escala/Alcance**: MVP — un único formulario/endpoint de creación. Sin expectativa de alta concurrencia en esta fase; diseño no debe sobre-construir para escala hipotética (Principio V).

## Verificación de la Constitución

*GATE: Debe aprobarse antes de la investigación de la Fase 0. Volver a verificar tras el diseño de la Fase 1.*

| Principio | Verificación | Estado |
|---|---|---|
| I. Registra, Nunca Interpreta | El plan no incluye cálculo ni interpretación de percentiles OMS ni ningún dato médico — talla/peso/fecha de nacimiento se almacenan tal cual (FR-008 del spec). | ✅ PASA |
| II. Privacidad y Protección de Datos | Solo se capturan los campos listados en el spec (sin datos de salud sensibles ni identificación oficial); no hay venta/compartición de datos. Pendiente de otra tarea: aviso de privacidad LFPDPPP visible en el formulario (fuera de alcance de este plan, se recomienda como follow-up). | ✅ PASA (con nota de seguimiento) |
| III. Stack Tecnológico Fijo | Go + React (PWA) + PostgreSQL, tal como se define en Contexto Técnico. | ✅ PASA |
| IV. Freemium Disciplinado | El límite de 1 hijo gratis se aplica por perfiles (cantidad de hijos), no por uso — consistente con FR-007 del spec. | ✅ PASA |
| V. Simplicidad y MVP Real | Alcance limitado a Create; sin sobre-ingeniería (un solo endpoint, sin microservicios ni colas innecesarias). | ✅ PASA |
| VI. Cobertura de Pruebas Obligatoria | Se planean pruebas unitarias (Go + Vitest) con meta >90% y un test E2E Playwright del flujo completo (ver quickstart.md). | ✅ PASA (a verificar en `/speckit-tasks` e implementación) |

No hay violaciones que requieran la sección de Seguimiento de Complejidad.

**Re-verificación post-diseño (Fase 1)**: revisado tras generar `data-model.md` y `contracts/` — el modelo de datos no introduce campos médicos interpretados (Principio I), el límite freemium se valida en servidor además de cliente por seguridad (Principio III/skill `backend-security-coder`), y la estructura de carpetas propuesta no agrega complejidad no justificada (Principio V). Sin cambios de estado; todos los gates siguen en ✅ PASA.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/001-registro-cuenta-usuario/
├── plan.md              # Este archivo (salida del comando /speckit-plan)
├── research.md          # Salida de la Fase 0 (comando /speckit-plan)
├── data-model.md        # Salida de la Fase 1 (comando /speckit-plan)
├── quickstart.md        # Salida de la Fase 1 (comando /speckit-plan)
├── contracts/           # Salida de la Fase 1 (comando /speckit-plan)
└── tasks.md             # Salida de la Fase 2 (comando /speckit-tasks - NO creado por /speckit-plan)
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── cmd/
│   └── api/                      # entrypoint del servicio HTTP
├── internal/
│   ├── account/                  # dominio Cuenta+Hijo: modelos, validación, reglas freemium
│   │   ├── handler.go            # HTTP handler POST /accounts
│   │   ├── service.go            # lógica de negocio (incluye regla freemium FR-007)
│   │   ├── repository.go         # acceso a PostgreSQL (pgx)
│   │   └── *_test.go             # tests table-driven junto al código
│   └── catalog/                  # catálogo de países/estados (lectura)
│       ├── handler.go
│       └── *_test.go
└── migrations/                   # migraciones SQL (tablas accounts, children, countries, states)

frontend/
├── src/
│   ├── features/
│   │   └── account-signup/       # feature de creación de cuenta (por-feature, no por-tipo)
│   │       ├── AccountSignupForm.tsx
│   │       ├── ChildFieldset.tsx
│   │       ├── FreemiumBanner.tsx
│   │       ├── useAccountSignup.ts   # hook con TanStack Query (mutación de guardado)
│   │       └── *.test.tsx        # Vitest + Testing Library
│   └── shared/
│       └── catalog/              # hook/servicio de catálogo país/estado
└── e2e/
    └── account-signup.spec.ts    # Playwright: flujo completo de creación de cuenta
```

**Decisión de Estructura**: Opción 2 (aplicación web con frontend y backend separados), reflejando el Principio III de la constitución. El backend organiza el dominio por feature (`internal/account`, `internal/catalog`) en vez de por capa técnica genérica, y el frontend agrupa por feature (`features/account-signup`) según la convención ya fijada en "Convenciones de Código — React" de la constitución.

## Seguimiento de Complejidad

*No aplica — la Verificación de la Constitución no registró violaciones.*
