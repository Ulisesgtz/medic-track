# Plan de Implementación: Registro de Log de Errores del Backend

**Rama**: `002-registro-log-errores` | **Fecha**: 2026-09-16 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/002-registro-log-errores/spec.md`

## Resumen

Cada vez que el backend responde a un cliente con un error (4xx/5xx), el sistema DEBE quedar registrado automáticamente en una tabla `error_logs` de PostgreSQL — sin que cada handler tenga que invocarlo manualmente ni el registro pueda romper la respuesta de error original. El punto de enganche es el mecanismo compartido de respuestas de error (`internal/httpx`), que ya centraliza todas las respuestas de error de `account` y `catalog`. El enfoque técnico: convertir las funciones sueltas de `httpx` en un `Responder` inyectado explícitamente en cada handler (siguiendo la convención de DI vía constructores del proyecto), que captura automáticamente archivo/línea de origen con `runtime.Caller`, deriva el endpoint del patrón de ruta de `chi`, y registra la entrada en background (goroutine con timeout corto) para que una falla o lentitud del log nunca retrase ni rompa la respuesta al cliente.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend existente)

**Dependencias Principales**: `chi` (router, ya en uso — se usa `chi.RouteContext` para el patrón de ruta), `pgx/v5` (ya en uso), `google/uuid` (ya en uso); ninguna dependencia nueva — captura de archivo/línea vía `runtime.Caller` de la librería estándar.

**Almacenamiento**: PostgreSQL (misma base de datos del proyecto, nueva tabla `error_logs`, migración `0005`)

**Pruebas**: `go test` + `testify` (patrón table-driven ya establecido en `internal/account` e `internal/catalog`); repositorio probado contra Postgres real igual que los repositorios existentes.

**Plataforma Objetivo**: Servidor Linux (mismo backend HTTP existente, sin cambios de despliegue)

**Tipo de Proyecto**: Extensión de un servicio web backend existente (no agrega superficie pública nueva — ver Requisitos, FR-007/FR-008)

**Objetivos de Rendimiento**: Registrar una entrada de error no debe agregar más de 50ms perceptibles a la respuesta (SC-004) — se logra escribiendo el log en una goroutine en segundo plano, desacoplada de la respuesta HTTP que ya se está enviando.

**Restricciones**: Una falla al escribir el log NUNCA debe alterar ni retrasar la respuesta de error original (FR-005); el log NUNCA debe contener el correo electrónico del usuario (FR-004).

**Escala/Alcance**: Volumen de errores esperado bajo (etapa temprana del producto); sin política de retención/purga en este alcance (ver Aclaraciones en spec.md) — la tabla crece sin límite por ahora.

## Verificación de la Constitución

*GATE: Debe aprobarse antes de la investigación de la Fase 0. Volver a verificar tras el diseño de la Fase 1.*

- **Principio I (Registra, Nunca Interpreta)**: No aplica — esta funcionalidad no toca datos médicos ni opina sobre ellos; solo registra errores técnicos del propio backend. ✅ Cumple.
- **Principio II (Privacidad)**: Directamente relevante y ya resuelto en la spec — el log NUNCA guarda el correo electrónico, solo el `account_id` interno (FR-004), y no se retienen más datos de los necesarios para diagnóstico técnico. ✅ Cumple.
- **Principio III (Stack Tecnológico Fijo)**: Se implementa 100% en Go + PostgreSQL, sin dependencias ni servicios externos nuevos. ✅ Cumple.
- **Principio IV (Freemium Disciplinado)**: No aplica — no toca el modelo de planes/límites de cuenta.
- **Principio V (Simplicidad y MVP Real)**: Esta funcionalidad NO forma parte del alcance MVP original (login + perfiles + escaneo + timeline + recordatorios + gráfica). Se justifica como infraestructura operativa mínima (no una feature de producto) — ver **Seguimiento de Complejidad** abajo.
- **Principio VI (Cobertura de Pruebas Obligatoria)**: El nuevo paquete `internal/errorlog` y los cambios en `internal/httpx` DEBEN tener cobertura >90%, igual que el resto del backend; se valida con el mismo gate de CI ya existente. No se requieren pruebas E2E de Playwright nuevas porque esta funcionalidad no tiene superficie de UI (ver FR-007).

**Resultado**: Aprobado, con una excepción documentada (Principio V) — ver Seguimiento de Complejidad.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/002-registro-log-errores/
├── plan.md              # Este archivo (salida del comando /speckit-plan)
├── research.md          # Salida de la Fase 0 (comando /speckit-plan)
├── data-model.md         # Salida de la Fase 1 (comando /speckit-plan)
├── quickstart.md         # Salida de la Fase 1 (comando /speckit-plan)
└── tasks.md              # Salida de la Fase 2 (comando /speckit-tasks - NO creado por /speckit-plan)
```

No se genera `contracts/` — esta funcionalidad no expone ninguna interfaz pública nueva (ni endpoint HTTP ni UI); es un mecanismo interno enganchado a la capa de respuestas de error ya existente (ver FR-007/FR-008 en spec.md).

### Código Fuente (raíz del repositorio)

```text
backend/
├── internal/
│   ├── errorlog/                  # NUEVO paquete
│   │   ├── model.go                # struct Entry
│   │   ├── repository.go           # Repository.Create(ctx, *Entry)
│   │   └── repository_test.go
│   ├── httpx/                      # EXISTENTE — se convierte de funciones sueltas a un Responder
│   │   ├── json.go                 # Responder, NewResponder(recorder), WriteJSON, WriteJSONError
│   │   └── json_test.go
│   ├── account/
│   │   └── handler.go              # usa *httpx.Responder inyectado en vez de funciones de paquete
│   └── catalog/
│       └── handler.go              # ídem
├── cmd/api/main.go                 # wiring: crea errorlog.Repository + httpx.Responder, los pasa a los Handler
└── migrations/
    └── 0005_create_error_logs_table.sql   # NUEVA
```

**Decisión de Estructura**: Se añade el nuevo paquete `internal/errorlog` (modelo + repositorio, mismo patrón que `internal/account` e `internal/catalog`) y se refactoriza `internal/httpx` de funciones de paquete sueltas a un tipo `Responder` con inyección de dependencias explícita vía constructor (`httpx.NewResponder(recorder)`), consistente con la convención de DI del proyecto ("Inyección de dependencias: explícita vía constructores... evitar estado global"). `account.Handler` y `catalog.Handler` reciben el `*httpx.Responder` en su constructor en vez de llamar funciones de paquete directamente.

## Seguimiento de Complejidad

> **Completar SOLO si la Verificación de la Constitución tiene violaciones que deban justificarse**

| Violación | Por Qué Es Necesaria | Alternativa Más Simple Rechazada Porque |
|-----------|------------------------|------------------------------------------|
| Principio V (feature fuera del alcance MVP original) | Sin tienda de aplicaciones ni canal de reportes de usuario, hoy no hay NINGUNA visibilidad de errores en producción — un bug silencioso en un flujo de salud de menores (Principio I/II) podría pasar desapercibido indefinidamente. Es infraestructura operativa mínima, no una feature de producto que compita por prioridad con el roadmap MVP. | Esperar a tener más usuarios para justificarlo fue rechazado porque para entonces ya seríamos ciegos a los errores reales que esos usuarios están teniendo — el mismo problema que esta funcionalidad busca resolver. Se mantiene deliberadamente mínima (solo escritura, sin consulta ni digest) para no exceder el esfuerzo que amerita como infraestructura, no como producto (YAGNI aplicado al alcance de ESTA funcionalidad, no a construirla). |
