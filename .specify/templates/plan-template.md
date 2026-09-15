# Plan de Implementación: [FUNCIONALIDAD]

**Rama**: `[###-nombre-funcionalidad]` | **Fecha**: [FECHA] | **Especificación**: [enlace]

**Entrada**: Especificación de la funcionalidad desde `/specs/[###-nombre-funcionalidad]/spec.md`

**Nota**: Esta plantilla es completada por el comando `/speckit-plan`; su definición describe el flujo de ejecución.

## Resumen

[Extraer de la especificación de la funcionalidad: requisito principal + enfoque técnico a partir de la investigación]

## Contexto Técnico

<!--
  ACCIÓN REQUERIDA: Reemplaza el contenido de esta sección con los detalles técnicos
  del proyecto. La estructura aquí presentada tiene carácter orientativo para guiar
  el proceso iterativo.
-->

**Lenguaje/Versión**: [p. ej., Python 3.11, Swift 5.9, Rust 1.75 o NEEDS CLARIFICATION]

**Dependencias Principales**: [p. ej., FastAPI, UIKit, LLVM o NEEDS CLARIFICATION]

**Almacenamiento**: [si aplica, p. ej., PostgreSQL, CoreData, archivos o N/A]

**Pruebas**: [p. ej., pytest, XCTest, cargo test o NEEDS CLARIFICATION]

**Plataforma Objetivo**: [p. ej., servidor Linux, iOS 15+, WASM o NEEDS CLARIFICATION]

**Tipo de Proyecto**: [p. ej., library/cli/web-service/mobile-app/compiler/desktop-app o NEEDS CLARIFICATION]

**Objetivos de Rendimiento**: [específico del dominio, p. ej., 1000 req/s, 10k líneas/seg, 60 fps o NEEDS CLARIFICATION]

**Restricciones**: [específico del dominio, p. ej., <200ms p95, <100MB de memoria, capaz de operar sin conexión o NEEDS CLARIFICATION]

**Escala/Alcance**: [específico del dominio, p. ej., 10k usuarios, 1M LOC, 50 pantallas o NEEDS CLARIFICATION]

## Verificación de la Constitución

*GATE: Debe aprobarse antes de la investigación de la Fase 0. Volver a verificar tras el diseño de la Fase 1.*

[Gates determinados en función del archivo de la constitución]

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/[###-funcionalidad]/
├── plan.md              # Este archivo (salida del comando /speckit-plan)
├── research.md          # Salida de la Fase 0 (comando /speckit-plan)
├── data-model.md        # Salida de la Fase 1 (comando /speckit-plan)
├── quickstart.md        # Salida de la Fase 1 (comando /speckit-plan)
├── contracts/           # Salida de la Fase 1 (comando /speckit-plan)
└── tasks.md             # Salida de la Fase 2 (comando /speckit-tasks - NO creado por /speckit-plan)
```

### Código Fuente (raíz del repositorio)
<!--
  ACCIÓN REQUERIDA: Reemplaza el árbol de marcador de posición de abajo con la
  disposición concreta para esta funcionalidad. Elimina las opciones no usadas
  y expande la estructura elegida con rutas reales (p. ej., apps/admin,
  packages/algo). El plan entregado no debe incluir las etiquetas de Opción.
-->

```text
# [ELIMINAR SI NO SE USA] Opción 1: Proyecto único (PREDETERMINADA)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [ELIMINAR SI NO SE USA] Opción 2: Aplicación web (cuando se detecta "frontend" + "backend")
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [ELIMINAR SI NO SE USA] Opción 3: Móvil + API (cuando se detecta "iOS/Android")
api/
└── [igual que backend arriba]

ios/ o android/
└── [estructura específica de la plataforma: módulos de funcionalidad, flujos de UI, pruebas de plataforma]
```

**Decisión de Estructura**: [Documenta la estructura seleccionada y referencia los
directorios reales capturados arriba]

## Seguimiento de Complejidad

> **Completar SOLO si la Verificación de la Constitución tiene violaciones que deban justificarse**

| Violación | Por Qué Es Necesaria | Alternativa Más Simple Rechazada Porque |
|-----------|------------------------|------------------------------------------|
| [p. ej., 4.º proyecto] | [necesidad actual] | [por qué 3 proyectos son insuficientes] |
| [p. ej., patrón Repository] | [problema específico] | [por qué el acceso directo a BD es insuficiente] |
