---
name: "speckit-constitution"
description: "Create or update the project constitution from interactive or provided principle inputs."
argument-hint: "Principles or values for the project constitution"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/constitution.md"
user-invocable: true
disable-model-invocation: false
---


## Entrada del Usuario

```text
$ARGUMENTS
```

DEBES considerar la entrada del usuario antes de continuar (si no está vacía).

## Guardia de Alcance

El trabajo propio de este comando se limita a actualizar la propia constitución del proyecto. Las plantillas
y comandos dependientes leen la constitución en tiempo de ejecución y no se modifican aquí.

- Clasifica cada parte de la entrada del usuario como contenido de la constitución o como una intención
  separada, no relacionada con la gobernanza.
- Si la entrada incluye solicitudes de implementación de funcionalidades, generación de código, refactorización, construcción o
  despliegue, NO DEBES ejecutarlas. Extráelas como intenciones diferidas en su lugar.
- NO DEBES crear, modificar o eliminar archivos fuente de la aplicación, rutas de funcionalidad,
  componentes, pruebas, archivos de despliegue u otros artefactos no relacionados con el flujo de trabajo
  de la constitución.
- Si no está claro si una instrucción es contenido de la constitución, pide una aclaración antes de
  hacer cambios.
- Después de completar la actualización de la constitución, incluye una sección `Próximos Pasos` para cada
  intención diferida. Lista la intención original y sugiere el comando de Spec Kit de seguimiento apropiado, como
  `/speckit-specify`, sin invocarlo.
- Si no hay intenciones no relacionadas con la gobernanza, omite la sección `Próximos Pasos`.

## Verificaciones Previas a la Ejecución

**Verificar hooks de extensión (antes de actualizar la constitución)**:
- Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.before_constitution`
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

Estás actualizando la constitución del proyecto en `.specify/memory/constitution.md`. El esqueleto de
constitución activo se resuelve en tiempo de ejecución a partir de `constitution-template` a través del stack de
resolución de presets/plantillas de Spec Kit.

Sigue este flujo de ejecución:

1. Ejecuta `.specify/scripts/bash/resolve-template.sh constitution-template --json` desde la raíz del repositorio y analiza `TEMPLATE_CONTENT` como la plantilla activa.
   - El resolvedor compartido aplica las anulaciones del proyecto, componiendo las capas de preset y las capas
     de extensión antes de recurrir a la plantilla central. DEBE tener éxito antes de continuar.
   - Si falla, detente y reporta el error de resolución; no continúes con una sola capa de plantilla
     contribuyente.
   - Si `.specify/memory/constitution.md` existe, cárgalo como la fuente de los valores y enmiendas
     actuales específicos del proyecto. Preserva la información que siga aplicando al usar el esqueleto
     recién resuelto.
   - Si no existe, usa la plantilla resuelta como el documento inicial.
   - No escribas de vuelta en ninguna capa de plantilla versionada.
   - Identifica cada token de marcador de posición con la forma `[IDENTIFICADOR_EN_MAYUSCULAS]`.
   **IMPORTANTE**: El usuario podría requerir menos o más principios que los usados en la plantilla. Si se especifica un número, respétalo - sigue la plantilla general. Actualizarás el documento en consecuencia.

2. Recolecta/deriva los valores para los marcadores de posición:
   - Si la entrada del usuario (conversación) proporciona un valor, úsalo.
   - Si no, infiere a partir del contexto existente del repositorio (README, documentación, versiones previas de la constitución si están incrustadas).
   - Para las fechas de gobernanza: `RATIFICATION_DATE` es la fecha de adopción original (si se desconoce, pregunta o márcala como TODO), `LAST_AMENDED_DATE` es hoy si se hacen cambios, o de lo contrario se mantiene la anterior.
   - `CONSTITUTION_VERSION` debe incrementarse según las reglas de versionado semántico:
     - MAJOR: Eliminaciones o redefiniciones de gobernanza/principios incompatibles hacia atrás.
     - MINOR: Nuevo principio/sección agregado o guía existente ampliada materialmente.
     - PATCH: Aclaraciones, redacción, correcciones de errores tipográficos, refinamientos no semánticos.
   - Si el tipo de incremento de versión es ambiguo, propón un razonamiento antes de finalizarlo.

3. Redacta el contenido actualizado de la constitución usando la plantilla resuelta como la estructura requerida:
   - Reemplaza cada marcador de posición con texto concreto (sin tokens entre corchetes restantes, excepto los espacios de plantilla retenidos intencionalmente que el proyecto haya optado por no definir todavía—justifica explícitamente cualquiera que quede).
   - Preserva la jerarquía de encabezados; los comentarios pueden eliminarse una vez reemplazados salvo que aún aporten una guía aclaratoria.
   - Asegura que cada sección de Principio tenga: una línea de nombre sucinta, un párrafo (o lista de viñetas) que capture las reglas no negociables, y una justificación explícita si no es obvia.
   - Asegura que la sección de Gobernanza liste el procedimiento de enmienda, la política de versionado y las expectativas de revisión de cumplimiento.

4. Produce un Reporte de Impacto de Sincronización como un comentario HTML al inicio del archivo de la constitución después de la actualización.
   Este reporte es material de trabajo temporal para la revisión humana de la enmienda, no contenido de
   gobernanza; se espera que se elimine antes de hacer commit del archivo de constitución enmendado.
   - Cambio de versión: anterior → nueva
   - Lista de principios modificados (título anterior → título nuevo si se renombró)
   - Secciones agregadas
   - Secciones eliminadas
   - TODOs de seguimiento si algún marcador de posición se difirió intencionalmente.

5. Validación antes de la salida final:
   - No quedan tokens entre corchetes sin explicar.
   - La línea de versión coincide con el reporte.
   - Las fechas en formato ISO YYYY-MM-DD.
   - Los principios son declarativos, comprobables y están libres de lenguaje vago ("debería" → reemplazar con MUST/SHOULD y su justificación cuando sea apropiado).

6. Escribe la constitución completada de vuelta en `.specify/memory/constitution.md` (sobrescribiendo).

7. Muestra un resumen final al usuario con:
   - La nueva versión y la justificación del incremento.
   - Cualquier marcador de posición TODO o ítem diferido que requiera seguimiento manual.
   - Mensaje de commit sugerido (p. ej., `docs: amend constitution to vX.Y.Z (principle additions + governance update)`).
   - Una sección `Próximos Pasos` para cualquier intención diferida no relacionada con la gobernanza.

Requisitos de Formato y Estilo:

- Usa los encabezados Markdown exactamente como en la plantilla (no bajes/subas de nivel).
- Envuelve las líneas de justificación largas para mantener la legibilidad (<100 caracteres idealmente) pero no lo fuerces con saltos incómodos.
- Mantén una sola línea en blanco entre secciones.
- Evita los espacios en blanco al final de línea.

Si el usuario proporciona actualizaciones parciales (p. ej., solo la revisión de un principio), aun así realiza los pasos de validación y decisión de versión.

Si falta información crítica (p. ej., la fecha de ratificación es realmente desconocida), inserta `TODO(<NOMBRE_DEL_CAMPO>): explicación` e inclúyelo en el Reporte de Impacto de Sincronización bajo los ítems diferidos.

Escribe únicamente `.specify/memory/constitution.md`; no crees ni modifiques los archivos fuente de la plantilla.

## Verificaciones Posteriores a la Ejecución

**Verificar hooks de extensión (después de actualizar la constitución)**:
Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.after_constitution`
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
