---
name: "speckit-implement"
description: "Execute the implementation plan by processing and executing all tasks defined in tasks.md"
argument-hint: "Optional implementation guidance or task filter"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/implement.md"
user-invocable: true
disable-model-invocation: false
---


## Entrada del Usuario

```text
$ARGUMENTS
```

DEBES considerar la entrada del usuario antes de continuar (si no está vacía).

## Verificaciones Previas a la Ejecución

**Verificar hooks de extensión (antes de la implementación)**:
- Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.before_implement`
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

1. Ejecuta `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` desde la raíz del repositorio y analiza FEATURE_DIR y la lista AVAILABLE_DOCS. Todas las rutas deben ser absolutas. Para comillas simples en argumentos como "I'm Groot", usa sintaxis de escape: p. ej. 'I'\''m Groot' (o comillas dobles si es posible: "I'm Groot").

2. **Verificar el estado de las checklists** (si existe FEATURE_DIR/checklists/):
   - Trata los marcadores de la checklist como un gate de solo lectura: escanea el estado de las casillas, reporta el estado y pregunta antes de continuar cuando sea necesario; NO modifiques los archivos ni los marcadores de la checklist
   - `checklists/requirements.md` es la checklist de calidad de especificación integrada, mantenida por `/speckit-specify` y `/speckit-clarify`; las checklists personalizadas generadas por `/speckit-checklist` son artefactos de revisión de calidad de requisitos, propiedad del revisor
   - Para las checklists personalizadas, `[x]` significa que el revisor determinó que el criterio de calidad de requisitos está satisfecho; NO significa que el trabajo de implementación esté completo
   - Escanea todos los archivos de checklist en el directorio checklists/
   - Para cada checklist, cuenta:
     - Ítems totales: Todas las líneas que coincidan con `- [ ]` o `- [X]` o `- [x]`
     - Ítems marcados: Líneas que coincidan con `- [X]` o `- [x]`
     - Ítems sin marcar: Líneas que coincidan con `- [ ]`
   - Crea una tabla de estado:

     ```text
     | Checklist | Total | Marcados | Sin marcar | Estado |
     |-----------|-------|---------|-----------|--------|
     | ux.md     | 12    | 12      | 0         | ✓ APROBADA |
     | test.md   | 8     | 5       | 3         | ✗ FALLIDA |
     | security.md | 6   | 6       | 0         | ✓ APROBADA |
     ```

   - Calcula el estado general:
     - **APROBADA**: Todas las checklists tienen 0 ítems sin marcar
     - **FALLIDA**: Una o más checklists tienen ítems sin marcar

   - **Si alguna checklist tiene ítems sin marcar**:
     - Muestra la tabla con los conteos de ítems sin marcar
     - **DETENTE** y pregunta: "Algunas checklists tienen ítems sin marcar. ¿Quieres continuar con la implementación de todos modos? (sí/no)"
     - Espera la respuesta del usuario antes de continuar
     - Si el usuario dice "no" o "espera" o "detente", detén la ejecución
     - Si el usuario dice "sí" o "continúa" o "procede", pasa al paso 3

   - **Si todas las checklists están marcadas**:
     - Muestra la tabla indicando que todas las checklists pasaron
     - Continúa automáticamente al paso 3

3. Carga y analiza el contexto de implementación:
   - **OBLIGATORIO**: Lee tasks.md para la lista completa de tareas y el plan de ejecución
   - **OBLIGATORIO**: Lee plan.md para el stack tecnológico, la arquitectura y la estructura de archivos
   - **SI EXISTE**: Lee data-model.md para las entidades y relaciones
   - **SI EXISTE**: Lee contracts/ para las especificaciones de API y los requisitos de prueba
   - **SI EXISTE**: Lee research.md para las decisiones técnicas y restricciones
   - **SI EXISTE**: Lee .specify/memory/constitution.md para las restricciones de gobernanza
   - **SI EXISTE**: Lee quickstart.md para los escenarios de integración

4. **Verificación de Configuración del Proyecto**:
   - **OBLIGATORIO**: Crea/verifica los archivos de ignorados según la configuración real del proyecto:

   **Lógica de Detección y Creación**:
   - Verifica si el siguiente comando tiene éxito para determinar si el repositorio es un repositorio git (crea/verifica .gitignore si es así):

     ```sh
     git rev-parse --git-dir 2>/dev/null
     ```

   - Verifica si existe Dockerfile* o Docker está en plan.md → crea/verifica .dockerignore
   - Verifica si existe .eslintrc* → crea/verifica .eslintignore
   - Verifica si existe eslint.config.* → asegura que las entradas `ignores` de la config cubran los patrones requeridos
   - Verifica si existe .prettierrc* → crea/verifica .prettierignore
   - Verifica si existe .npmrc o package.json → crea/verifica .npmignore (si se publica)
   - Verifica si existen archivos terraform (*.tf) → crea/verifica .terraformignore
   - Verifica si se necesita .helmignore (hay charts de helm presentes) → crea/verifica .helmignore

   **Si el archivo de ignorados ya existe**: Verifica que contenga los patrones esenciales, agrega solo los patrones críticos que falten
   **Si falta el archivo de ignorados**: Créalo con el conjunto completo de patrones para la tecnología detectada

   **Patrones Comunes por Tecnología** (a partir del stack tecnológico en plan.md):
   - **Node.js/JavaScript/TypeScript**: `node_modules/`, `dist/`, `build/`, `*.log`, `.env*`
   - **Python**: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `dist/`, `*.egg-info/`
   - **Java**: `target/`, `*.class`, `*.jar`, `.gradle/`, `build/`
   - **C#/.NET**: `bin/`, `obj/`, `*.user`, `*.suo`, `packages/`
   - **Go**: `*.exe`, `*.test`, `vendor/`, `*.out`
   - **Ruby**: `.bundle/`, `log/`, `tmp/`, `*.gem`, `vendor/bundle/`
   - **PHP**: `vendor/`, `*.log`, `*.cache`, `*.env`
   - **Rust**: `target/`, `debug/`, `release/`, `*.rs.bk`, `*.rlib`, `*.prof*`, `.idea/`, `*.log`, `.env*`
   - **Kotlin**: `build/`, `out/`, `.gradle/`, `.idea/`, `*.class`, `*.jar`, `*.iml`, `*.log`, `.env*`
   - **C++**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.so`, `*.a`, `*.exe`, `*.dll`, `.idea/`, `*.log`, `.env*`
   - **C**: `build/`, `bin/`, `obj/`, `out/`, `*.o`, `*.a`, `*.so`, `*.exe`, `*.dll`, `autom4te.cache/`, `config.status`, `config.log`, `.idea/`, `*.log`, `.env*`
   - **Swift**: `.build/`, `DerivedData/`, `*.swiftpm/`, `Packages/`
   - **R**: `.Rproj.user/`, `.Rhistory`, `.RData`, `.Ruserdata`, `*.Rproj`, `packrat/`, `renv/`
   - **Universal**: `.DS_Store`, `Thumbs.db`, `*.tmp`, `*.swp`, `.vscode/`, `.idea/`

   **Patrones Específicos de Herramienta**:
   - **Docker**: `node_modules/`, `.git/`, `Dockerfile*`, `.dockerignore`, `*.log*`, `.env*`, `coverage/`
   - **ESLint**: `node_modules/`, `dist/`, `build/`, `coverage/`, `*.min.js`
   - **Prettier**: `node_modules/`, `dist/`, `build/`, `coverage/`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
   - **Terraform**: `.terraform/`, `*.tfstate*`, `*.tfvars`, `.terraform.lock.hcl`
   - **Kubernetes/k8s**: `*.secret.yaml`, `secrets/`, `.kube/`, `kubeconfig*`, `*.key`, `*.crt`

5. Analiza la estructura de tasks.md y extrae:
   - **Fases de tarea**: Configuración, Pruebas, Núcleo, Integración, Pulido
   - **Dependencias de tarea**: Reglas de ejecución secuencial vs. paralela
   - **Detalles de tarea**: ID, descripción, rutas de archivo, marcadores de paralelización [P]
   - **Flujo de ejecución**: Orden y requisitos de dependencia

6. Ejecuta la implementación siguiendo el plan de tareas:
   - **Ejecución fase por fase**: Completa cada fase antes de pasar a la siguiente
   - **Respeta las dependencias**: Ejecuta las tareas secuenciales en orden, las tareas paralelas [P] pueden ejecutarse juntas
   - **Sigue el enfoque TDD**: Ejecuta las tareas de prueba antes de sus tareas de implementación correspondientes
   - **Coordinación basada en archivos**: Las tareas que afectan los mismos archivos deben ejecutarse secuencialmente
   - **Puntos de control de validación**: Verifica la finalización de cada fase antes de continuar

7. Reglas de ejecución de la implementación:
   - **Configuración primero**: Inicializa la estructura del proyecto, las dependencias, la configuración
   - **Pruebas antes que código**: Si necesitas escribir pruebas para contratos, entidades y escenarios de integración
   - **Desarrollo del núcleo**: Implementa modelos, servicios, comandos de CLI, endpoints
   - **Trabajo de integración**: Conexiones a base de datos, middleware, logging, servicios externos
   - **Pulido y validación**: Pruebas unitarias, optimización de rendimiento, documentación

8. Seguimiento de progreso y manejo de errores:
   - Reporta el progreso después de cada tarea completada
   - Detén la ejecución si alguna tarea no paralela falla
   - Para las tareas paralelas [P], continúa con las tareas exitosas, reporta las fallidas
   - Proporciona mensajes de error claros con contexto para depuración
   - Sugiere los próximos pasos si la implementación no puede continuar
   - **IMPORTANTE** Para las tareas completadas, asegúrate de marcar la tarea como [X] en el archivo de tareas.

9. Validación de finalización:
   - Verifica que todas las tareas requeridas estén completas
   - Comprueba que las funcionalidades implementadas coincidan con la especificación original
   - Valida que las pruebas pasen y la cobertura cumpla los requisitos
   - Confirma que la implementación sigue el plan técnico

Nota: Este comando asume que existe un desglose completo de tareas en tasks.md. Si las tareas están incompletas o faltan, sugiere ejecutar primero `/speckit-tasks` para regenerar la lista de tareas.

## Hooks Obligatorios Posteriores a la Ejecución

**DEBES completar esta sección antes de reportar la finalización al usuario.**

Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si no existe, o no hay hooks registrados bajo `hooks.after_implement`, pasa al Reporte de Finalización.
- Si existe, léelo y busca entradas bajo la clave `hooks.after_implement`.
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

Reporta el estado final con un resumen del trabajo completado.

## Completado Cuando

- [ ] Todas las tareas en tasks.md completadas y marcadas `[X]`
- [ ] Implementación validada contra la especificación, el plan y la cobertura de pruebas
- [ ] Hooks de extensión despachados u omitidos según las reglas de Hooks Obligatorios Posteriores a la Ejecución
- [ ] Finalización reportada al usuario con un resumen del trabajo completado
