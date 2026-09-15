---
name: "speckit-plan"
description: "Execute the implementation planning workflow using the plan template to generate design artifacts."
argument-hint: "Optional guidance for the planning phase"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/plan.md"
user-invocable: true
disable-model-invocation: false
---


## Entrada del Usuario

```text
$ARGUMENTS
```

DEBES considerar la entrada del usuario antes de continuar (si no está vacía).

## Verificaciones Previas a la Ejecución

**Verificar hooks de extensión (antes de la planificación)**:
- Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.before_plan`
- Si el YAML no puede analizarse o es inválido, no lo omitas en silencio: informa al usuario que `.specify/extensions.yml` no pudo leerse (incluye el error del parser) y que no se verificó ningún hook, incluyendo cualquier hook obligatorio (`optional: false`) registrado ahí, y luego continúa normalmente
- Filtra los hooks donde `enabled` sea explícitamente `false`. Trata los hooks sin el campo `enabled` como habilitados por defecto.
- Para cada hook restante, NO intentes interpretar ni evaluar las expresiones `condition` del hook:
  - Si el hook no tiene campo `condition`, o está vacío/nulo, trátalo como ejecutable
  - Si el hook define un `condition` no vacío, omite el hook y deja la evaluación de la condición a la implementación del HookExecutor
- Al construir invocaciones de comando a partir de nombres de hooks, reemplaza los puntos (`.`) por guiones (`-`). Por ejemplo, `speckit.git.commit` → `/speckit-git-commit`.
- Para cada hook ejecutable, produce la siguiente salida según su bandera `optional`:
  - **Hook opcional** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Hook obligatorio** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    Después de emitir el bloque anterior DEBES invocar realmente el hook y esperar a que termine antes de continuar. Ejecútalo de la misma forma en que tú mismo ejecutarías el comando en este agente/sesión (la invocación puede diferir del id literal `{command}` mostrado arriba, p. ej. un agente en modo skills lo ejecuta como `/skill:speckit-...` o `$speckit-...`). Emitir solo el bloque no ejecuta el hook.
- Si no hay hooks registrados o `.specify/extensions.yml` no existe, omite en silencio

## Esquema

1. **Configuración**: Ejecuta `.specify/scripts/bash/setup-plan.sh --json` desde la raíz del repositorio y analiza el JSON para FEATURE_SPEC, IMPL_PLAN, FEATURE_DIR, BRANCH. Para comillas simples en argumentos como "I'm Groot", usa sintaxis de escape: p. ej. 'I'\''m Groot' (o comillas dobles si es posible: "I'm Groot").

2. **Cargar contexto**: Lee FEATURE_SPEC y `.specify/memory/constitution.md`. Carga la plantilla IMPL_PLAN (ya copiada).

3. **Ejecutar el flujo de planificación**: Sigue la estructura de la plantilla IMPL_PLAN para:
   - Completar el Contexto Técnico (marca las incógnitas como "NEEDS CLARIFICATION")
   - Completar la sección de Verificación de la Constitución a partir de la constitución
   - Evaluar los gates (ERROR si hay violaciones injustificadas)
   - Fase 0: Generar research.md (resolver todos los NEEDS CLARIFICATION)
   - Fase 1: Generar data-model.md, contracts/, quickstart.md
   - Volver a evaluar la Verificación de la Constitución después del diseño

## Hooks Obligatorios Posteriores a la Ejecución

**DEBES completar esta sección antes de reportar la finalización al usuario.**

Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si no existe, o no hay hooks registrados bajo `hooks.after_plan`, pasa al Reporte de Finalización.
- Si existe, léelo y busca entradas bajo la clave `hooks.after_plan`.
- Si el YAML no puede analizarse o es inválido, no lo omitas en silencio: informa al usuario que `.specify/extensions.yml` no pudo leerse (incluye el error del parser) y que no se verificó ningún hook, incluyendo cualquier hook obligatorio (`optional: false`) registrado ahí, y luego continúa al Reporte de Finalización.
- Filtra los hooks donde `enabled` sea explícitamente `false`. Trata los hooks sin el campo `enabled` como habilitados por defecto.
- Para cada hook restante, NO intentes interpretar ni evaluar las expresiones `condition` del hook:
  - Si el hook no tiene campo `condition`, o está vacío/nulo, trátalo como ejecutable
  - Si el hook define un `condition` no vacío, omite el hook y deja la evaluación de la condición a la implementación del HookExecutor
- Al construir invocaciones de comando a partir de nombres de hooks, reemplaza los puntos (`.`) por guiones (`-`). Por ejemplo, `speckit.git.commit` → `/speckit-git-commit`.
- Para cada hook ejecutable, produce la siguiente salida según su bandera `optional`:
  - **Hook obligatorio** (`optional: false`) — **DEBES emitir `EXECUTE_COMMAND:` para cada hook obligatorio**:
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    Después de emitir el bloque anterior DEBES invocar realmente el hook y esperar a que termine antes de continuar. Ejecútalo de la misma forma en que tú mismo ejecutarías el comando en este agente/sesión (la invocación puede diferir del id literal `{command}` mostrado arriba, p. ej. un agente en modo skills lo ejecuta como `/skill:speckit-...` o `$speckit-...`). Emitir solo el bloque no ejecuta el hook.
  - **Hook opcional** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

## Reporte de Finalización

El comando termina después del diseño de la Fase 1. Reporta la rama, la ruta de IMPL_PLAN y los artefactos generados.

## Fases

### Fase 0: Esquema e Investigación

1. **Extraer incógnitas del Contexto Técnico** de arriba:
   - Por cada NEEDS CLARIFICATION → tarea de investigación
   - Por cada dependencia → tarea de mejores prácticas
   - Por cada integración → tarea de patrones

2. **Generar y despachar agentes de investigación**:

   ```text
   Para cada incógnita en el Contexto Técnico:
     Task: "Investigar {incógnita} para {contexto de la funcionalidad}"
   Para cada elección tecnológica:
     Task: "Encontrar mejores prácticas para {tecnología} en {dominio}"
   ```

3. **Consolidar los hallazgos** en `research.md` usando el formato:
   - Decisión: [qué se eligió]
   - Justificación: [por qué se eligió]
   - Alternativas consideradas: [qué más se evaluó]

**Salida**: research.md con todos los NEEDS CLARIFICATION resueltos

### Fase 1: Diseño y Contratos

**Prerrequisitos:** `research.md` completo

1. **Extraer entidades de la especificación de la funcionalidad** → `data-model.md`:
   - Nombre de la entidad, campos, relaciones
   - Reglas de validación a partir de los requisitos
   - Transiciones de estado si aplica

2. **Definir contratos de interfaz** (si el proyecto tiene interfaces externas) → `/contracts/`:
   - Identifica qué interfaces expone el proyecto a los usuarios o a otros sistemas
   - Documenta el formato de contrato apropiado para el tipo de proyecto
   - Ejemplos: APIs públicas para librerías, esquemas de comandos para herramientas CLI, endpoints para servicios web, gramáticas para parsers, contratos de UI para aplicaciones
   - Omite este paso si el proyecto es puramente interno (scripts de build, herramientas de un solo uso, etc.)

3. **Crear la guía de validación quickstart** → `quickstart.md`:
   - Documenta escenarios de validación ejecutables que demuestren que la funcionalidad funciona de extremo a extremo
   - Incluye prerrequisitos, comandos de configuración, comandos de prueba/ejecución y resultados esperados
   - Usa enlaces o referencias a los contratos y detalles del modelo de datos en lugar de duplicarlos
   - No incluyas código de implementación completo, cuerpos de modelo/servicio/controlador, migraciones ni suites de pruebas completas
   - Mantén este artefacto como una guía de validación/ejecución; los detalles de implementación pertenecen a `tasks.md` y a la fase de implementación

**Salida**: data-model.md, /contracts/*, quickstart.md

## Reglas Clave

- Usa rutas absolutas para las operaciones del sistema de archivos; usa rutas relativas al proyecto para las referencias en la documentación
- ERROR ante fallos de gate o aclaraciones sin resolver

## Completado Cuando

- [ ] Flujo de planificación ejecutado y artefactos de diseño generados
- [ ] Hooks de extensión despachados u omitidos según las reglas de Hooks Obligatorios Posteriores a la Ejecución
- [ ] Finalización reportada al usuario con la rama, la ruta del plan y los artefactos generados
