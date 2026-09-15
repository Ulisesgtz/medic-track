---
name: "speckit-analyze"
description: "Perform a non-destructive cross-artifact consistency and quality analysis across spec.md, plan.md, and tasks.md after task generation."
argument-hint: "Optional focus areas for analysis"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/analyze.md"
user-invocable: true
disable-model-invocation: false
---


## Entrada del Usuario

```text
$ARGUMENTS
```

DEBES considerar la entrada del usuario antes de continuar (si no está vacía).

## Verificaciones Previas a la Ejecución

**Verificar hooks de extensión (antes del análisis)**:
- Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.before_analyze`
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

    Wait for the result of the hook command before proceeding to the Goal.
    ```
    Después de emitir el bloque anterior DEBES invocar realmente el hook y esperar a que termine antes de continuar. Ejecútalo de la misma forma en que tú mismo ejecutarías el comando en este agente/sesión (la invocación puede diferir del id literal `{command}` mostrado arriba, p. ej. un agente en modo skills lo ejecuta como `/skill:speckit-...` o `$speckit-...`). Emitir solo el bloque no ejecuta el hook.
- Si no hay hooks registrados o `.specify/extensions.yml` no existe, omite en silencio

## Objetivo

Identificar inconsistencias, duplicaciones, ambigüedades e ítems subespecificados a través de los tres artefactos principales (`spec.md`, `plan.md`, `tasks.md`) antes de la implementación. Este comando DEBE ejecutarse solo después de que `/speckit-tasks` haya producido con éxito un `tasks.md` completo.

## Restricciones Operativas

**ESTRICTAMENTE DE SOLO LECTURA**: NO modifiques ningún archivo. Genera un reporte de análisis estructurado. Ofrece un plan de remediación opcional (el usuario debe aprobarlo explícitamente antes de invocar manualmente cualquier comando de edición de seguimiento).

**Autoridad de la Constitución**: La constitución del proyecto (`.specify/memory/constitution.md`) es **no negociable** dentro de este alcance de análisis. Los conflictos con la constitución son automáticamente CRÍTICOS y requieren ajustar la especificación, el plan o las tareas — no diluir, reinterpretar ni ignorar en silencio el principio. Si un principio en sí necesita cambiar, eso debe ocurrir en una actualización explícita y separada de la constitución, fuera de `/speckit-analyze`.

## Pasos de Ejecución

### 1. Inicializar el Contexto de Análisis

Ejecuta `.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks` una vez desde la raíz del repositorio y analiza el JSON para FEATURE_DIR y AVAILABLE_DOCS. Deriva las rutas absolutas:

- SPEC = FEATURE_DIR/spec.md
- PLAN = FEATURE_DIR/plan.md
- TASKS = FEATURE_DIR/tasks.md

Aborta con un mensaje de error si falta algún archivo obligatorio (indica al usuario que ejecute el comando prerrequisito faltante).
Para comillas simples en argumentos como "I'm Groot", usa sintaxis de escape: p. ej. 'I'\''m Groot' (o comillas dobles si es posible: "I'm Groot").

### 2. Cargar los Artefactos (Divulgación Progresiva)

Carga solo el contexto mínimo necesario de cada artefacto:

**De spec.md:**

- Resumen/Contexto
- Requisitos Funcionales
- Criterios de Éxito (resultados medibles — p. ej., rendimiento, seguridad, disponibilidad, éxito del usuario, impacto de negocio)
- Historias de Usuario
- Casos Límite (si están presentes)

**De plan.md:**

- Decisiones de arquitectura/stack
- Referencias al Modelo de Datos
- Fases
- Restricciones técnicas

**De tasks.md:**

- IDs de tarea
- Descripciones
- Agrupación por fase
- Marcadores de paralelización [P]
- Rutas de archivo referenciadas

**De la constitución:**

- Carga `.specify/memory/constitution.md` para la validación de principios

### 3. Construir Modelos Semánticos

Crea representaciones internas (no incluyas los artefactos en bruto en la salida):

- **Inventario de requisitos**: Para cada Requisito Funcional (FR-###) y Criterio de Éxito (SC-###), registra una clave estable. Usa el identificador explícito FR-/SC- como clave primaria cuando esté presente, y opcionalmente deriva también un slug de frase imperativa para mayor legibilidad (p. ej., "El usuario puede subir un archivo" → `user-can-upload-file`). Incluye solo los Criterios de Éxito que requieran trabajo construible (p. ej., infraestructura de pruebas de carga, herramientas de auditoría de seguridad), y excluye las métricas de resultado posteriores al lanzamiento y los KPIs de negocio (p. ej., "Reducir los tickets de soporte en un 50%").
- **Inventario de historias/acciones de usuario**: Acciones de usuario discretas con criterios de aceptación
- **Mapeo de cobertura de tareas**: Mapea cada tarea a uno o más requisitos o historias (por inferencia mediante palabras clave / patrones de referencia explícitos como IDs o frases clave)
- **Conjunto de reglas de la constitución**: Extrae los nombres de los principios y las declaraciones normativas MUST/SHOULD

### 4. Pases de Detección (Análisis Eficiente en Tokens)

Enfócate en hallazgos de alta señal. Limita a 50 hallazgos en total; agrega el resto en un resumen de desbordamiento.

#### A. Detección de Duplicación

- Identifica requisitos casi duplicados
- Marca la redacción de menor calidad para consolidación

#### B. Detección de Ambigüedad

- Marca adjetivos vagos (rápido, escalable, seguro, intuitivo, robusto) sin criterios medibles
- Marca marcadores de posición sin resolver (TODO, TKTK, ???, `<placeholder>`, etc.)

#### C. Subespecificación

- Requisitos con verbos pero sin objeto o resultado medible
- Historias de usuario sin alineación de criterios de aceptación
- Tareas que referencian archivos o componentes no definidos en la especificación/plan

#### D. Alineación con la Constitución

- Cualquier requisito o elemento del plan que entre en conflicto con un principio MUST
- Secciones o gates de calidad obligatorios por la constitución que falten

#### E. Brechas de Cobertura

- Requisitos sin ninguna tarea asociada
- Tareas sin requisito/historia mapeada
- Criterios de Éxito que requieren trabajo construible (rendimiento, seguridad, disponibilidad) no reflejados en las tareas

#### F. Inconsistencia

- Desviación terminológica (mismo concepto nombrado de forma distinta entre archivos)
- Entidades de datos referenciadas en el plan pero ausentes en la especificación (o viceversa)
- Contradicciones en el orden de las tareas (p. ej., tareas de integración antes de tareas de configuración fundamentales sin nota de dependencia)
- Requisitos en conflicto (p. ej., uno requiere Next.js mientras otro especifica Vue)

### 5. Asignación de Severidad

Usa esta heurística para priorizar los hallazgos:

- **CRÍTICO**: Viola un MUST de la constitución, falta un artefacto central de la especificación, o un requisito sin ninguna cobertura que bloquea la funcionalidad base
- **ALTO**: Requisito duplicado o en conflicto, atributo de seguridad/rendimiento ambiguo, criterio de aceptación no comprobable
- **MEDIO**: Desviación terminológica, falta de cobertura de tareas no funcionales, caso límite subespecificado
- **BAJO**: Mejoras de estilo/redacción, redundancia menor que no afecta el orden de ejecución

### 6. Producir el Reporte de Análisis Compacto

Genera un reporte Markdown (sin escritura de archivos) con la siguiente estructura:

## Reporte de Análisis de la Especificación

| ID | Categoría | Severidad | Ubicación(es) | Resumen | Recomendación |
|----|----------|----------|-------------|---------|----------------|
| A1 | Duplicación | ALTO | spec.md:L120-134 | Dos requisitos similares ... | Fusionar la redacción; conservar la versión más clara |

(Agrega una fila por hallazgo, generando IDs estables con el prefijo de la categoría.)

**Tabla Resumen de Cobertura:**

| Clave del Requisito | ¿Tiene Tarea? | IDs de Tarea | Notas |
|-----------------|-----------|----------|-------|

**Problemas de Alineación con la Constitución:** (si los hay)

**Tareas sin Mapear:** (si las hay)

**Métricas:**

- Total de Requisitos
- Total de Tareas
- % de Cobertura (requisitos con >=1 tarea)
- Cantidad de Ambigüedades
- Cantidad de Duplicaciones
- Cantidad de Problemas Críticos

### 7. Proporcionar los Próximos Pasos

Al final del reporte, muestra un bloque compacto de Próximos Pasos:

- Si existen problemas CRÍTICOS: Recomienda resolverlos antes de `/speckit-implement`
- Si solo hay BAJO/MEDIO: El usuario puede continuar, pero ofrece sugerencias de mejora
- Proporciona sugerencias de comandos explícitas: p. ej., "Ejecutar /speckit-specify con un refinamiento", "Ejecutar /speckit-plan para ajustar la arquitectura", "Editar manualmente tasks.md para agregar cobertura de 'métricas-de-rendimiento'"

### 8. Ofrecer Remediación

Pregunta al usuario: "¿Quieres que sugiera ediciones de remediación concretas para los N principales problemas?" (NO las apliques automáticamente.)

### 9. Verificar hooks de extensión

Después de reportar, verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.after_analyze`
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

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Hook obligatorio** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    Después de emitir el bloque anterior DEBES invocar realmente el hook y esperar a que termine antes de continuar. Ejecútalo de la misma forma en que tú mismo ejecutarías el comando en este agente/sesión (la invocación puede diferir del id literal `{command}` mostrado arriba, p. ej. un agente en modo skills lo ejecuta como `/skill:speckit-...` o `$speckit-...`). Emitir solo el bloque no ejecuta el hook.
- Si no hay hooks registrados o `.specify/extensions.yml` no existe, omite en silencio

## Principios Operativos

### Eficiencia de Contexto

- **Tokens mínimos de alta señal**: Enfócate en hallazgos accionables, no en documentación exhaustiva
- **Divulgación progresiva**: Carga los artefactos de forma incremental; no vuelques todo el contenido en el análisis
- **Salida eficiente en tokens**: Limita la tabla de hallazgos a 50 filas; resume el excedente
- **Resultados deterministas**: Volver a ejecutar sin cambios debe producir IDs y conteos consistentes

### Guías de Análisis

- **NUNCA modifiques archivos** (este es un análisis de solo lectura)
- **NUNCA alucines secciones faltantes** (si están ausentes, repórtalo con precisión)
- **Prioriza las violaciones a la constitución** (siempre son CRÍTICAS)
- **Usa ejemplos en lugar de reglas exhaustivas** (cita instancias específicas, no patrones genéricos)
- **Reporta cero problemas con elegancia** (emite un reporte de éxito con estadísticas de cobertura)

## Contexto

$ARGUMENTS
