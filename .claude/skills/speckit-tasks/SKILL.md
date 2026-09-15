---
name: "speckit-tasks"
description: "Generate an actionable, dependency-ordered tasks.md for the feature based on available design artifacts."
argument-hint: "Optional task generation constraints"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/tasks.md"
user-invocable: true
disable-model-invocation: false
---


## Entrada del Usuario

```text
$ARGUMENTS
```

DEBES considerar la entrada del usuario antes de continuar (si no está vacía).

## Verificaciones Previas a la Ejecución

**Verificar hooks de extensión (antes de la generación de tareas)**:
- Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.before_tasks`
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

1. **Configuración**: Ejecuta `.specify/scripts/bash/setup-tasks.sh --json` desde la raíz del repositorio y analiza FEATURE_DIR, TASKS_TEMPLATE_CONTENT, TASKS_TEMPLATE y la lista AVAILABLE_DOCS. `FEATURE_DIR` y `TASKS_TEMPLATE` deben ser rutas absolutas cuando se proporcionen. `AVAILABLE_DOCS` es una lista de nombres de documentos/rutas relativas disponibles bajo `FEATURE_DIR` (por ejemplo `research.md` o `contracts/`). Para comillas simples en argumentos como "I'm Groot", usa sintaxis de escape: p. ej. 'I'\''m Groot' (o comillas dobles si es posible: "I'm Groot").

2. **Cargar los documentos de diseño**: Lee desde FEATURE_DIR:
   - **Obligatorio**: plan.md (stack tecnológico, librerías, estructura), spec.md (historias de usuario con prioridades)
   - **Opcional**: data-model.md (entidades), contracts/ (contratos de interfaz), research.md (decisiones), quickstart.md (escenarios de prueba)
   - **SI EXISTE**: Carga `.specify/memory/constitution.md` para conocer los principios y restricciones de gobernanza del proyecto
   - Nota: No todos los proyectos tienen todos los documentos. Genera las tareas según lo que esté disponible.

3. **Ejecutar el flujo de generación de tareas**:
   - Carga plan.md y extrae el stack tecnológico, las librerías y la estructura del proyecto
   - Carga spec.md y extrae las historias de usuario con sus prioridades (P1, P2, P3, etc.)
   - Si existe data-model.md: Extrae las entidades y mapéalas a las historias de usuario
   - Si existe contracts/: Mapea los contratos de interfaz a las historias de usuario
   - Si existe research.md: Extrae las decisiones para las tareas de configuración
   - Genera las tareas organizadas por historia de usuario (ver las Reglas de Generación de Tareas abajo)
   - Genera el grafo de dependencias mostrando el orden de finalización de las historias de usuario
   - Crea ejemplos de ejecución en paralelo por historia de usuario
   - Valida la completitud de las tareas (cada historia de usuario tiene todas las tareas necesarias, comprobable de forma independiente)

4. **Generar tasks.md**: Usa TASKS_TEMPLATE_CONTENT (del JSON de salida de arriba) como estructura. Para compatibilidad con scripts de configuración más antiguos que omitan TASKS_TEMPLATE_CONTENT, lee en su lugar TASKS_TEMPLATE. Complétalo con:
   - Nombre correcto de la funcionalidad a partir de plan.md
   - Fase 1: Tareas de configuración (inicialización del proyecto)
   - Fase 2: Tareas fundamentales (prerrequisitos bloqueantes para todas las historias de usuario)
   - Fase 3+: Una fase por historia de usuario (en orden de prioridad según spec.md)
   - Cada fase incluye: objetivo de la historia, criterios de prueba independiente, pruebas (si se solicitan), tareas de implementación
   - Fase Final: Pulido y aspectos transversales
   - Todas las tareas deben seguir el formato de checklist estricto (ver las Reglas de Generación de Tareas abajo)
   - Rutas de archivo claras para cada tarea
   - Sección de Dependencias que muestre el orden de finalización de las historias
   - Ejemplos de ejecución en paralelo por historia
   - Sección de estrategia de implementación (MVP primero, entrega incremental)

## Hooks Obligatorios Posteriores a la Ejecución

**DEBES completar esta sección antes de reportar la finalización al usuario.**

Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si no existe, o no hay hooks registrados bajo `hooks.after_tasks`, pasa al Reporte de Finalización.
- Si existe, léelo y busca entradas bajo la clave `hooks.after_tasks`.
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

Muestra la ruta al tasks.md generado y un resumen:
- Total de tareas
- Total de tareas por historia de usuario
- Oportunidades de paralelización identificadas
- Criterios de prueba independiente para cada historia
- Alcance de MVP sugerido (típicamente solo la Historia de Usuario 1)
- Validación de formato: Confirma que TODAS las tareas siguen el formato de checklist (casilla, ID, etiquetas, rutas de archivo)

Contexto para la generación de tareas: $ARGUMENTS

El tasks.md debe ser inmediatamente ejecutable - cada tarea debe ser lo suficientemente específica para que un LLM pueda completarla sin contexto adicional.

## Reglas de Generación de Tareas

**CRÍTICO**: Las tareas DEBEN organizarse por historia de usuario para permitir la implementación y prueba independiente.

**Las pruebas son OPCIONALES**: Genera tareas de prueba solo si se solicitan explícitamente en la especificación de la funcionalidad o si el usuario solicita un enfoque TDD.

### Formato de Checklist (OBLIGATORIO)

Toda tarea DEBE seguir estrictamente este formato:

```text
- [ ] [TaskID] [P?] [Story?] Descripción con ruta de archivo
```

**Componentes del Formato**:

1. **Casilla**: SIEMPRE comienza con `- [ ]` (casilla markdown)
2. **ID de Tarea**: Número secuencial (T001, T002, T003...) en orden de ejecución
3. **Marcador [P]**: Inclúyelo SOLO si la tarea es paralelizable (archivos distintos, sin dependencias de tareas incompletas)
4. **Etiqueta [Story]**: OBLIGATORIA solo para las tareas de fase de historia de usuario
   - Formato: [US1], [US2], [US3], etc. (corresponde a las historias de usuario de spec.md)
   - Fase de Configuración: SIN etiqueta de historia
   - Fase Fundamental: SIN etiqueta de historia
   - Fases de Historia de Usuario: DEBEN tener etiqueta de historia
   - Fase de Pulido: SIN etiqueta de historia
5. **Descripción**: Acción clara con la ruta de archivo exacta

**Ejemplos**:

- ✅ CORRECTO: `- [ ] T001 Crear la estructura del proyecto según el plan de implementación`
- ✅ CORRECTO: `- [ ] T005 [P] Implementar el middleware de autenticación en src/middleware/auth.py`
- ✅ CORRECTO: `- [ ] T012 [P] [US1] Crear el modelo User en src/models/user.py`
- ✅ CORRECTO: `- [ ] T014 [US1] Implementar UserService en src/services/user_service.py`
- ❌ INCORRECTO: `- [ ] Crear el modelo User` (falta el ID y la etiqueta de historia)
- ❌ INCORRECTO: `T001 [US1] Crear modelo` (falta la casilla)
- ❌ INCORRECTO: `- [ ] [US1] Crear el modelo User` (falta el ID de tarea)
- ❌ INCORRECTO: `- [ ] T001 [US1] Crear modelo` (falta la ruta de archivo)

### Organización de las Tareas

1. **A partir de las Historias de Usuario (spec.md)** - ORGANIZACIÓN PRIMARIA:
   - Cada historia de usuario (P1, P2, P3...) obtiene su propia fase
   - Mapea todos los componentes relacionados a su historia:
     - Modelos necesarios para esa historia
     - Servicios necesarios para esa historia
     - Interfaces/UI necesarias para esa historia
     - Si se solicitan pruebas: Pruebas específicas para esa historia
   - Marca las dependencias entre historias (la mayoría de las historias deberían ser independientes)

2. **A partir de los Contratos**:
   - Mapea cada contrato de interfaz → a la historia de usuario a la que sirve
   - Si se solicitan pruebas: Cada contrato de interfaz → tarea de prueba de contrato [P] antes de la implementación en la fase de esa historia

3. **A partir del Modelo de Datos**:
   - Mapea cada entidad a la(s) historia(s) de usuario que la necesitan
   - Si la entidad sirve a varias historias: Colócala en la historia más temprana o en la fase de Configuración
   - Relaciones → tareas de la capa de servicio en la fase de historia apropiada
   - Para cada campo con restricciones en data-model.md (longitud máxima, nulable/obligatorio, valores enum, reglas de validación), cita la restricción textualmente en la descripción de la tarea para que no quede a discreción del momento de implementación

4. **A partir de Configuración/Infraestructura**:
   - Infraestructura compartida → Fase de Configuración (Fase 1)
   - Tareas fundamentales/bloqueantes → Fase Fundamental (Fase 2)
   - Configuración específica de la historia → dentro de la fase de esa historia

### Estructura de Fases

- **Fase 1**: Configuración (inicialización del proyecto)
- **Fase 2**: Fundamental (prerrequisitos bloqueantes - DEBE completarse antes de las historias de usuario)
- **Fase 3+**: Historias de Usuario en orden de prioridad (P1, P2, P3...)
  - Dentro de cada historia: Pruebas (si se solicitan) → Modelos → Servicios → Endpoints → Integración
  - Cada fase debe ser un incremento completo y comprobable de forma independiente
- **Fase Final**: Pulido y Aspectos Transversales

## Completado Cuando

- [ ] tasks.md generado con todas las fases, IDs de tarea y rutas de archivo
- [ ] Hooks de extensión despachados u omitidos según las reglas de Hooks Obligatorios Posteriores a la Ejecución
- [ ] Finalización reportada al usuario con el total de tareas, el desglose por historia y el alcance de MVP
