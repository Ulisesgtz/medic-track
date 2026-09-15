---
name: "speckit-converge"
description: "Assess the current codebase against the feature's spec, plan, and tasks, then append any remaining unbuilt work as new tasks to tasks.md so implement can complete it."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/converge.md"
user-invocable: true
disable-model-invocation: false
---


## Entrada del Usuario

```text
$ARGUMENTS
```

DEBES considerar la entrada del usuario antes de continuar (si no está vacía).

## Verificaciones Previas a la Ejecución

**Verificar hooks de extensión (antes de la convergencia)**:

- Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.before_converge`
- Si el YAML no puede analizarse o es inválido, no lo omitas en silencio: informa al usuario que `.specify/extensions.yml` no pudo leerse (incluye el error del parser) y que no se verificó ningún hook, incluyendo cualquier hook obligatorio (`optional: false`) registrado ahí, y luego continúa normalmente
- Filtra los hooks donde `enabled` sea explícitamente `false`. Trata los hooks sin el campo `enabled` como habilitados por defecto.
- Para cada hook restante, NO intentes interpretar ni evaluar las expresiones `condition` del hook:
  - Si el hook no tiene campo `condition`, o está vacío/nulo, trátalo como ejecutable
  - Si el hook define un `condition` no vacío, omite el hook y deja la evaluación de la condición a la implementación del HookExecutor
- Al construir invocaciones de comando a partir de nombres de hooks, reemplaza los puntos (`.`) por guiones (`-`). Por ejemplo, `speckit.git.commit` → `/speckit-git-commit`.
- Para cada hook ejecutable, produce la siguiente salida según su bandera `optional`:
  - **Hook opcional** (`optional: true`):

    ```text
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

  - **Hook obligatorio** (`optional: false`):

    ```text
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Goal.
    ```
    Después de emitir el bloque anterior DEBES invocar realmente el hook y esperar a que termine antes de continuar. Ejecútalo de la misma forma en que tú mismo ejecutarías el comando en este agente/sesión (la invocación puede diferir del id literal `{command}` mostrado arriba, p. ej. un agente en modo skills lo ejecuta como `/skill:speckit-...` o `$speckit-...`). Emitir solo el bloque no ejecuta el hook.

- Si no hay hooks registrados o `.specify/extensions.yml` no existe, omite en silencio

## Objetivo

Cerrar la brecha entre lo que exigen la especificación, el plan y las tareas de una funcionalidad y lo que
actualmente implementa la base de código. Lee `spec.md`, `plan.md` y `tasks.md` como la **única
fuente de intención** (con la constitución como restricciones rectoras), evalúa el estado
actual del código, determina qué requisitos, criterios de aceptación, decisiones del plan y
tareas existentes están incumplidos, incompletos o solo parcialmente satisfechos, y **agrega cada pieza
de trabajo pendiente como una tarea nueva y trazable** al final de `tasks.md` para que
`/speckit-implement` pueda completarla. Este comando DEBE ejecutarse solo después de que
`/speckit-implement` se haya ejecutado sobre el `tasks.md` actual, y después de que `/speckit-tasks` haya producido un `tasks.md` completo.

Esto **no** es una herramienta de diff y **no** rastrea cambios. Evalúa el estado presente
del código en relación con los artefactos de la funcionalidad — sin git, sin comparación de ramas, sin historial.

## Restricciones Operativas

**SOLO AGREGAR, NUNCA REESCRIBIR**: La **única** escritura del comando es agregar una nueva
sección `## Fase N: Convergencia` a `tasks.md`. NO DEBE:

- modificar `spec.md` o `plan.md` de ninguna forma;
- reescribir, renumerar, reordenar o eliminar ninguna tarea existente (incluyendo tareas de una
  fase de Convergencia anterior);
- modificar, crear o eliminar ningún código de la aplicación — completar las tareas agregadas es
  responsabilidad de `/speckit-implement`.

Cuando la base de código ya satisface todo, el comando DEBE dejar `tasks.md`
**sin cambios, byte por byte** (sin encabezado de Convergencia vacío) y reportar un resultado limpio.

**Autoridad de la Constitución**: La constitución del proyecto (`.specify/memory/constitution.md`) es
**no negociable**. El código que viola un principio MUST es el hallazgo de mayor severidad y
produce una tarea de remediación correspondiente. Si la constitución es una plantilla sin completar,
omite las verificaciones de constitución con elegancia en lugar de fallar.

## Pasos de Ejecución

### 1. Inicializar el Contexto de Convergencia

Ejecuta `.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks` una vez desde la raíz del repositorio y analiza el JSON para FEATURE_DIR y AVAILABLE_DOCS. Deriva las rutas absolutas:

- SPEC = FEATURE_DIR/spec.md
- PLAN = FEATURE_DIR/plan.md
- TASKS = FEATURE_DIR/tasks.md
- CONSTITUTION = `.specify/memory/constitution.md` (si está presente)
Si falta `spec.md`, `plan.md` o `tasks.md`, DETENTE con un mensaje claro y accionable que nombre el
comando prerrequisito a ejecutar (`/speckit-specify` si falta la especificación, `/speckit-plan` si falta el plan,
`/speckit-tasks` si faltan las tareas). No produzcas una salida parcial.
Para comillas simples en argumentos como "I'm Groot", usa sintaxis de escape: p. ej. 'I'\''m Groot' (o comillas dobles si es posible: "I'm Groot").

### 2. Cargar los Artefactos (Divulgación Progresiva)

Carga solo el contexto mínimo necesario de cada artefacto:

**De spec.md:**

- Requisitos Funcionales (FR-###)
- Criterios de Éxito (SC-###) — incluye solo los ítems que requieran trabajo construible; excluye
  las métricas de resultado posteriores al lanzamiento y los KPIs de negocio
- Historias de Usuario y sus Escenarios de Aceptación
- Casos Límite (si están presentes)

**De plan.md:**

- Decisiones de arquitectura/stack y decisiones técnicas
- Referencias al Modelo de Datos
- Fases y puntos de contacto nombrados (archivos/componentes que el plan indica que se crearán o editarán)
- Restricciones técnicas

**De tasks.md:**

- IDs de tarea (para calcular el siguiente ID y la siguiente fase)
- Descripciones, agrupación por fase y rutas de archivo referenciadas

**De la constitución (si no es una plantilla sin completar):**

- Nombres de principios y declaraciones normativas MUST/SHOULD

### 3. Construir el Inventario de Intención

Crea un modelo interno (no repitas los artefactos en bruto):

- **Inventario de requisitos**: una clave estable por cada FR-### / SC-### / escenario de aceptación
  de historia de usuario (p. ej. `US1/AC2`), más las decisiones del plan y los principios de la
  constitución que imponen obligaciones construibles.
- **Mapa de alcance del código**: a partir de las rutas de archivo nombradas en `plan.md` y `tasks.md`, más una
  búsqueda por palabras clave de los conceptos que describe cada requisito, deriva el conjunto de archivos
  y componentes fuente en alcance para la evaluación. Limita la evaluación a estos — NO infieras
  alcance más allá de lo que definen los artefactos.

### 4. Evaluar la Base de Código y Clasificar los Hallazgos

Para cada ítem del inventario de intención, inspecciona el código actual en alcance y produce un
`Hallazgo` solo donde haya una brecha. Clasifica cada hallazgo por **tipo de brecha**:

- **`missing` (faltante)**: el trabajo requerido está completamente ausente del código.
- **`partial` (parcial)**: el trabajo existe pero aún no satisface por completo el requisito /
  criterio de aceptación / decisión del plan.
- **`contradicts` (contradice)**: el código hace algo que entra en conflicto con la intención declarada o con
  un principio MUST de la constitución.
- **`unrequested` (no solicitado)**: el código contiene trabajo no requerido por la especificación, el plan o las tareas
  (mostrado para conocimiento — converge no elimina código, solo agrega una tarea para
  revisar/justificar o eliminarlo).

Cada `Hallazgo` registra: un id estable, la `source-ref` a la que se traza, el `gap-type`, una
severidad, y una breve descripción legible con la evidencia (el archivo/área observada).

**Casos límite:**

- **Poco o ningún código todavía**: trata todo el alcance especificado como trabajo pendiente `missing`
  en lugar de fallar.
- **No queda nada pendiente**: produce cero hallazgos y sigue la rama convergida en el Paso 7.

### 5. Asignar Severidad

- **CRÍTICO**: viola un principio MUST de la constitución, o una brecha `missing`/`contradicts`
  que bloquea la funcionalidad base de una historia de usuario P1.
- **ALTO**: una brecha `missing` o `partial` en un requisito funcional central o criterio de
  aceptación.
- **MEDIO**: una brecha `partial` en un requisito secundario, o una adición `unrequested` con
  justificación poco clara.
- **BAJO**: brechas parciales menores, pulido, o adiciones `unrequested` de bajo riesgo.

### 6. Presentar el Resumen de Hallazgos en la Sesión

Antes de agregar nada, muestra un resumen compacto y graduado por severidad (sin escrituras de archivo todavía):

## Hallazgos de Convergencia

| ID | Tipo de Brecha | Severidad | Fuente | Evidencia | Trabajo Pendiente |
|----|----------|----------|--------|----------|----------------|
| F1 | missing  | ALTO     | FR-008 | Ejemplo: no se detectó protección de solo-agregar en path/to/module.py al escribir tasks.md | Agregar la protección de solo-agregar |

**Métricas de resumen:**

- Requisitos / criterios de aceptación verificados
- Decisiones del plan verificadas
- Principios de la constitución verificados (o "omitido — plantilla")
- Hallazgos por tipo de brecha (missing / partial / contradicts / unrequested)
- Hallazgos por severidad

### 7. Agregar las Tareas de Convergencia (o reportar convergido)

**Si hay uno o más hallazgos accionables** (resultado `tasks_appended`):

Agrega al **final** de `tasks.md`, según el contrato de agregado:

1. Escanea todos los IDs de tarea existentes; sea `M` el máximo. Determina el siguiente número de fase `N`
   (fase existente más alta + 1).
2. Escribe un único encabezado de sección nuevo `## Fase N: Convergencia`.
3. Emite un ítem de checklist por cada hallazgo accionable, ordenando primero CRÍTICO/ALTO, asignando
   IDs con relleno de ceros `T{M+1:03d}, T{M+2:03d}, …`:

   ```markdown
   - [ ] T042 <descripción imperativa> según <source-ref> (<gap-type>)
   ```

   `<source-ref>` traza la tarea a su origen: p. ej. `FR-003`, `SC-002`,
   `US1/AC2`, `plan: decisión de almacenamiento`, `Constitución II`.

   `<gap-type>` es uno de `missing`, `partial`, `contradicts`, `unrequested`.

   Las tareas de violación de constitución DEBEN emitirse primero y describirse como
   `CRÍTICO`.
4. Nunca reutilices ni renumeres los IDs existentes. Si ya existe una fase de Convergencia
   previa, agrega una nueva, numerada por separado, debajo de ella — no toques la anterior.

**Si no hay hallazgos accionables** (resultado `converged`):

- NO modifiques `tasks.md` en absoluto — sin encabezado de fase vacío.
- Reporta: **"✅ Convergido — la implementación satisface la especificación, el plan y las tareas."**
- Incluye los conteos de resumen de lo que se verificó.

### 8. Proporcionar los Próximos Pasos (Traspaso)

- En `tasks_appended`: indica cuántas tareas se agregaron bajo qué fase, y recomienda
  ejecutar `/speckit-implement` para completarlas; anota que una ejecución de convergencia
  posterior encontrará menos o ningún ítem pendiente.
- En `converged`: recomienda continuar con la revisión / abrir un PR. No se necesita otro pase
  de implementación para el alcance especificado de esta funcionalidad.

### 9. Verificar hooks de extensión

Después de producir el resultado, verifica si `.specify/extensions.yml` existe en la raíz del proyecto.

- Si existe, léelo y busca entradas bajo la clave `hooks.after_converge`
- Si el YAML no puede analizarse o es inválido, no lo omitas en silencio: informa al usuario que `.specify/extensions.yml` no pudo leerse (incluye el error del parser) y que no se verificó ningún hook, incluyendo cualquier hook obligatorio (`optional: false`) registrado ahí, y luego continúa normalmente
- Filtra los hooks donde `enabled` sea explícitamente `false`. Trata los hooks sin el campo `enabled` como habilitados por defecto.
- Para cada hook restante, NO intentes interpretar ni evaluar las expresiones `condition` del hook:
  - Si el hook no tiene campo `condition`, o está vacío/nulo, trátalo como ejecutable
  - Si el hook define un `condition` no vacío, omite el hook y deja la evaluación de la condición a la implementación del HookExecutor
- Reporta el resultado de la convergencia (`converged` o `tasks_appended`) en la sesión antes de listar
  ningún hook, para que los usuarios puedan decidir si ejecutar comandos opcionales de seguimiento.
- Al construir invocaciones de comando a partir de nombres de hooks, reemplaza los puntos (`.`) por guiones (`-`). Por ejemplo, `speckit.git.commit` → `/speckit-git-commit`.
- Para cada hook ejecutable, produce la siguiente salida según su bandera `optional`:
  - **Hook opcional** (`optional: true`):

    ```text
    ## Extension Hooks

    **Optional Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```

  - **Hook obligatorio** (`optional: false`):

    ```text
    ## Extension Hooks

    **Automatic Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    Después de emitir el bloque anterior DEBES invocar realmente el hook y esperar a que termine antes de continuar. Ejecútalo de la misma forma en que tú mismo ejecutarías el comando en este agente/sesión (la invocación puede diferir del id literal `{command}` mostrado arriba, p. ej. un agente en modo skills lo ejecuta como `/skill:speckit-...` o `$speckit-...`). Emitir solo el bloque no ejecuta el hook.

- Si no hay hooks registrados o `.specify/extensions.yml` no existe, omite en silencio
