---
name: "speckit-specify"
description: "Create or update the feature specification from a natural language feature description."
argument-hint: "Describe the feature you want to specify"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/specify.md"
user-invocable: true
disable-model-invocation: false
---


## Entrada del Usuario

```text
$ARGUMENTS
```

DEBES considerar la entrada del usuario antes de continuar (si no está vacía).

## Verificaciones Previas a la Ejecución

**Verificar hooks de extensión (antes de la especificación)**:
- Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.before_specify`
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

El texto que el usuario escribió después de `/speckit-specify` en el mensaje que disparó el comando **es** la descripción de la funcionalidad. Asume que siempre tienes esa descripción disponible en esta conversación, incluso si `$ARGUMENTS` aparece literalmente abajo. No le pidas al usuario que la repita a menos que haya enviado un comando vacío.

Dada esa descripción de la funcionalidad, haz lo siguiente:

1. **Genera un nombre corto conciso** (2-4 palabras) para la funcionalidad:
   - Analiza la descripción de la funcionalidad y extrae las palabras clave más significativas
   - Crea un nombre corto de 2-4 palabras que capture la esencia de la funcionalidad
   - Usa el formato acción-sustantivo cuando sea posible (p. ej., "add-user-auth", "fix-payment-bug")
   - Preserva los términos técnicos y acrónimos (OAuth2, API, JWT, etc.)
   - Manténlo conciso pero lo suficientemente descriptivo para entender la funcionalidad de un vistazo
   - Ejemplos:
     - "Quiero agregar autenticación de usuarios" → "user-auth"
     - "Implementar integración de OAuth2 para la API" → "oauth2-api-integration"
     - "Crear un dashboard de analítica" → "analytics-dashboard"
     - "Corregir el bug de timeout en el procesamiento de pagos" → "fix-payment-timeout"

2. **Creación de la rama** (opcional, mediante hook):

   Si un hook `before_specify` se ejecutó con éxito en las Verificaciones Previas a la Ejecución de arriba, habrá creado/cambiado a una rama de git y producido un JSON con `BRANCH_NAME` y `FEATURE_NUM`. Toma nota de estos valores como referencia, pero el nombre de la rama NO determina el nombre del directorio de la especificación.

   Si el usuario proporcionó explícitamente `GIT_BRANCH_NAME`, pásalo al hook para que el script de rama use ese valor exacto como nombre de rama (sin pasar por la generación de prefijos/sufijos).

3. **Crea el directorio de la funcionalidad de la especificación**:

   Las especificaciones viven bajo el directorio predeterminado `specs/` salvo que el usuario proporcione explícitamente `SPECIFY_FEATURE_DIRECTORY`.

   **Orden de resolución para `SPECIFY_FEATURE_DIRECTORY`**:
   1. Si el usuario proporcionó explícitamente `SPECIFY_FEATURE_DIRECTORY` (p. ej., mediante variable de entorno, argumento o configuración), úsalo tal cual
   2. Si no, autogenéralo bajo `specs/`:
      - Verifica `.specify/init-options.json` para `feature_numbering` (preferido) o `branch_numbering` (obsoleto, solo migración — se eliminará en una versión futura)
      - Si es `"timestamp"`: el prefijo es `YYYYMMDD-HHMMSS` (marca de tiempo actual)
      - Si es `"sequential"` o está ausente: el prefijo es `NNN` (siguiente número de 3 dígitos disponible tras escanear los directorios existentes en `specs/`)
      - Construye el nombre del directorio: `<prefijo>-<nombre-corto>` (p. ej., `003-user-auth` o `20260319-143022-user-auth`)
      - Define `SPECIFY_FEATURE_DIRECTORY` como `specs/<nombre-directorio>`
      - Si se usó `branch_numbering` (y `feature_numbering` estaba ausente), emite una advertencia de una línea: "⚠️ `branch_numbering` en init-options.json está obsoleto. Renómbralo a `feature_numbering`."

   **Crea el directorio y el archivo de especificación**:
   - `mkdir -p SPECIFY_FEATURE_DIRECTORY`
   - Resuelve la plantilla `spec-template` activa mediante el stack de resolución de presets/plantillas de Spec Kit (equivalente a `specify preset resolve spec-template`)
   - Copia el archivo `spec-template` resuelto a `SPECIFY_FEATURE_DIRECTORY/spec.md` como punto de partida
   - Define `SPEC_FILE` como `SPECIFY_FEATURE_DIRECTORY/spec.md`
   - Persiste la ruta resuelta en `.specify/feature.json`:
     ```json
     {
       "feature_directory": "<directorio de funcionalidad resuelto>"
     }
     ```
     Escribe el valor real de la ruta del directorio resuelto (por ejemplo, `specs/003-user-auth`), no el literal `SPECIFY_FEATURE_DIRECTORY`.
     Esto permite que los comandos posteriores (`/speckit-plan`, `/speckit-tasks`, etc.) localicen el directorio de la funcionalidad sin depender de convenciones de nombres de rama de git.

   **IMPORTANTE**:
   - Solo debes crear una funcionalidad por invocación de `/speckit-specify`
   - El nombre del directorio de la especificación y el nombre de la rama de git son independientes — pueden ser el mismo, pero esa es decisión del usuario
   - El directorio y el archivo de especificación siempre los crea este comando, nunca el hook

4. Carga el archivo `spec-template` activo resuelto para entender las secciones requeridas.

5. **SI EXISTE**: Carga `.specify/memory/constitution.md` para conocer los principios y restricciones de gobernanza del proyecto.

6. Sigue este flujo de ejecución:
    1. Analiza la descripción del usuario a partir de los argumentos
       Si está vacía: ERROR "No se proporcionó descripción de la funcionalidad"
    2. Extrae los conceptos clave de la descripción
       Identifica: actores, acciones, datos, restricciones
    3. Para los aspectos poco claros:
       - Haz suposiciones informadas basadas en el contexto y en estándares de la industria
       - Marca con [NEEDS CLARIFICATION: pregunta específica] únicamente si:
         - La elección afecta significativamente el alcance de la funcionalidad o la experiencia del usuario
         - Existen varias interpretaciones razonables con implicaciones distintas
         - No existe un valor predeterminado razonable
       - **LÍMITE: Máximo 3 marcadores [NEEDS CLARIFICATION] en total**
       - Prioriza las aclaraciones por impacto: alcance > seguridad/privacidad > experiencia de usuario > detalles técnicos
    4. Completa la sección de Escenarios de Usuario y Pruebas
       Si no hay un flujo de usuario claro: ERROR "No se puede determinar los escenarios de usuario"
    5. Genera los Requisitos Funcionales
       Cada requisito debe ser comprobable
       Usa valores predeterminados razonables para los detalles no especificados (documenta los supuestos en la sección de Supuestos)
    6. Define los Criterios de Éxito
       Crea resultados medibles e independientes de la tecnología
       Incluye tanto métricas cuantitativas (tiempo, rendimiento, volumen) como medidas cualitativas (satisfacción del usuario, finalización de tareas)
       Cada criterio debe ser verificable sin conocer los detalles de implementación
    7. Identifica las Entidades Clave (si hay datos involucrados)
    8. Retorna: SUCCESS (especificación lista para la planificación)

7. Escribe la especificación en SPEC_FILE usando la estructura de la plantilla, reemplazando los marcadores de posición con detalles concretos derivados de la descripción de la funcionalidad (argumentos), preservando el orden y los encabezados de las secciones.

8. **Validación de Calidad de la Especificación**: Después de escribir la especificación inicial, valídala contra los criterios de calidad:

   a. **Crea la Checklist de Calidad de la Especificación**: Genera un archivo de checklist en `SPECIFY_FEATURE_DIRECTORY/checklists/requirements.md` usando la estructura de la plantilla de checklist con estos ítems de validación:

      ```markdown
      # Checklist de Calidad de la Especificación: [NOMBRE DE LA FUNCIONALIDAD]

      **Propósito**: Validar la completitud y calidad de la especificación antes de continuar con la planificación
      **Creado**: [FECHA]
      **Funcionalidad**: [Enlace a spec.md]

      ## Calidad del Contenido

      - [ ] Sin detalles de implementación (lenguajes, frameworks, APIs)
      - [ ] Enfocado en el valor para el usuario y las necesidades del negocio
      - [ ] Escrito para interesados no técnicos
      - [ ] Todas las secciones obligatorias completas

      ## Completitud de los Requisitos

      - [ ] No quedan marcadores [NEEDS CLARIFICATION]
      - [ ] Los requisitos son comprobables y no ambiguos
      - [ ] Los criterios de éxito son medibles
      - [ ] Los criterios de éxito son independientes de la tecnología (sin detalles de implementación)
      - [ ] Todos los escenarios de aceptación están definidos
      - [ ] Los casos límite están identificados
      - [ ] El alcance está claramente delimitado
      - [ ] Las dependencias y supuestos están identificados

      ## Preparación de la Funcionalidad

      - [ ] Todos los requisitos funcionales tienen criterios de aceptación claros
      - [ ] Los escenarios de usuario cubren los flujos principales
      - [ ] La funcionalidad cumple los resultados medibles definidos en los Criterios de Éxito
      - [ ] Ningún detalle de implementación se filtra en la especificación

      ## Notas

      - Los ítems marcados como incompletos requieren actualizar la especificación antes de `/speckit-clarify` o `/speckit-plan`
      ```

   b. **Ejecuta la Verificación de Validación**: Revisa la especificación contra cada ítem de la checklist:
      - Para cada ítem, determina si pasa o falla
      - Documenta los problemas específicos encontrados (cita las secciones relevantes de la especificación)

   c. **Maneja los Resultados de la Validación**:

      - **Si todos los ítems pasan**: Marca la checklist como completa y continúa a la sección de Hooks Obligatorios Posteriores a la Ejecución

      - **Si hay ítems que fallan (excluyendo [NEEDS CLARIFICATION])**:
        1. Lista los ítems que fallan y los problemas específicos
        2. Actualiza la especificación para resolver cada problema
        3. Vuelve a ejecutar la validación hasta que todos los ítems pasen (máximo 3 iteraciones)
        4. Si sigue fallando después de 3 iteraciones, documenta los problemas pendientes en las notas de la checklist y advierte al usuario

      - **Si quedan marcadores [NEEDS CLARIFICATION]**:
        1. Extrae todos los marcadores [NEEDS CLARIFICATION: ...] de la especificación
        2. **VERIFICACIÓN DE LÍMITE**: Si existen más de 3 marcadores, conserva solo los 3 más críticos (por impacto en alcance/seguridad/UX) y haz suposiciones informadas para el resto
        3. Para cada aclaración necesaria (máximo 3), presenta opciones al usuario con este formato:

           ```markdown
           ## Pregunta [N]: [Tema]

           **Contexto**: [Cita la sección relevante de la especificación]

           **Lo que necesitamos saber**: [Pregunta específica del marcador NEEDS CLARIFICATION]

           **Respuestas Sugeridas**:

           | Opción | Respuesta | Implicaciones |
           |--------|-----------|----------------|
           | A      | [Primera respuesta sugerida] | [Qué significa esto para la funcionalidad] |
           | B      | [Segunda respuesta sugerida] | [Qué significa esto para la funcionalidad] |
           | C      | [Tercera respuesta sugerida] | [Qué significa esto para la funcionalidad] |
           | Personalizada | Proporciona tu propia respuesta | [Explica cómo dar una respuesta personalizada] |

           **Tu elección**: _[Esperar respuesta del usuario]_
           ```

        4. **CRÍTICO - Formato de Tabla**: Asegúrate de que las tablas markdown estén correctamente formateadas:
           - Usa un espaciado consistente con las barras alineadas
           - Cada celda debe tener espacios alrededor del contenido: `| Contenido |` no `|Contenido|`
           - El separador del encabezado debe tener al menos 3 guiones: `|--------|`
           - Verifica que la tabla se muestre correctamente en la vista previa de markdown
        5. Numera las preguntas secuencialmente (Q1, Q2, Q3 - máximo 3 en total)
        6. Presenta todas las preguntas juntas antes de esperar respuestas
        7. Espera a que el usuario responda con sus elecciones para todas las preguntas (p. ej., "Q1: A, Q2: Personalizada - [detalles], Q3: B")
        8. Actualiza la especificación reemplazando cada marcador [NEEDS CLARIFICATION] con la respuesta elegida o proporcionada por el usuario
        9. Vuelve a ejecutar la validación una vez resueltas todas las aclaraciones

   d. **Actualiza la Checklist**: Después de cada iteración de validación, actualiza el archivo de checklist con el estado actual de aprobado/fallido

## Hooks Obligatorios Posteriores a la Ejecución

**DEBES completar esta sección antes de reportar la finalización al usuario.**

Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si no existe, o no hay hooks registrados bajo `hooks.after_specify`, pasa al Reporte de Finalización.
- Si existe, léelo y busca entradas bajo la clave `hooks.after_specify`.
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

Reporta la finalización al usuario con:
- `SPECIFY_FEATURE_DIRECTORY` — la ruta del directorio de la funcionalidad
- `SPEC_FILE` — la ruta del archivo de especificación
- Resumen de resultados de la checklist
- Preparación para la siguiente fase (`/speckit-clarify` o `/speckit-plan`)

**NOTA:** La creación de la rama la maneja el hook `before_specify` (extensión de git). La creación del directorio y el archivo de especificación siempre los maneja este comando central.

## Guías Rápidas

- Enfócate en **QUÉ** necesitan los usuarios y **POR QUÉ**.
- Evita el CÓMO implementarlo (sin stack tecnológico, APIs, estructura de código).
- Escrito para interesados de negocio, no para desarrolladores.
- NO crees ninguna checklist embebida en la especificación. Eso será un comando separado.

### Requisitos de Sección

- **Secciones obligatorias**: Deben completarse para cada funcionalidad
- **Secciones opcionales**: Inclúyelas solo cuando sean relevantes para la funcionalidad
- Cuando una sección no aplique, elimínala por completo (no la dejes como "N/A")

### Para la Generación con IA

Al crear esta especificación a partir de un prompt del usuario:

1. **Haz suposiciones informadas**: Usa el contexto, los estándares de la industria y los patrones comunes para llenar vacíos
2. **Documenta los supuestos**: Registra los valores predeterminados razonables en la sección de Supuestos
3. **Limita las aclaraciones**: Máximo 3 marcadores [NEEDS CLARIFICATION] - úsalos solo para decisiones críticas que:
   - Afecten significativamente el alcance de la funcionalidad o la experiencia del usuario
   - Tengan varias interpretaciones razonables con implicaciones distintas
   - Carezcan de un valor predeterminado razonable
4. **Prioriza las aclaraciones**: alcance > seguridad/privacidad > experiencia de usuario > detalles técnicos
5. **Piensa como un tester**: Todo requisito vago debería fallar el ítem de la checklist "comprobable y no ambiguo"
6. **Áreas comunes que necesitan aclaración** (solo si no existe un valor predeterminado razonable):
   - Alcance y límites de la funcionalidad (incluir/excluir casos de uso específicos)
   - Tipos de usuario y permisos (si son posibles varias interpretaciones conflictivas)
   - Requisitos de seguridad/cumplimiento (cuando sean legal o financieramente significativos)

**Ejemplos de valores predeterminados razonables** (no preguntes sobre esto):

- Retención de datos: Prácticas estándar de la industria para el dominio
- Objetivos de rendimiento: Expectativas estándar de app web/móvil salvo que se especifique
- Manejo de errores: Mensajes amigables para el usuario con fallbacks apropiados
- Método de autenticación: Basado en sesión estándar u OAuth2 para apps web
- Patrones de integración: Usa los patrones apropiados para el proyecto (REST/GraphQL para servicios web, llamadas a funciones para librerías, argumentos de CLI para herramientas, etc.)

### Guías de Criterios de Éxito

Los criterios de éxito deben ser:

1. **Medibles**: Incluir métricas específicas (tiempo, porcentaje, conteo, tasa)
2. **Independientes de la tecnología**: Sin mención de frameworks, lenguajes, bases de datos o herramientas
3. **Centrados en el usuario**: Describir resultados desde la perspectiva del usuario/negocio, no internos del sistema
4. **Verificables**: Que puedan probarse/validarse sin conocer los detalles de implementación

**Buenos ejemplos**:

- "Los usuarios pueden completar el checkout en menos de 3 minutos"
- "El sistema soporta 10,000 usuarios concurrentes"
- "El 95% de las búsquedas devuelve resultados en menos de 1 segundo"
- "La tasa de finalización de tareas mejora un 40%"

**Malos ejemplos** (enfocados en implementación):

- "El tiempo de respuesta de la API es menor a 200ms" (demasiado técnico, usar "Los usuarios ven resultados al instante")
- "La base de datos puede manejar 1000 TPS" (detalle de implementación, usar una métrica orientada al usuario)
- "Los componentes de React se renderizan eficientemente" (específico del framework)
- "La tasa de aciertos de la caché Redis es superior al 80%" (específico de la tecnología)

## Completado Cuando

- [ ] Especificación escrita en `SPEC_FILE` y validada contra la checklist de calidad
- [ ] Hooks de extensión despachados u omitidos según las reglas de Hooks Obligatorios Posteriores a la Ejecución
- [ ] Finalización reportada al usuario con el directorio de la funcionalidad, la ruta del archivo de especificación y los resultados de la checklist
