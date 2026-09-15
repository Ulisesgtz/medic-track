---
name: "speckit-clarify"
description: "Identify underspecified areas in the current feature spec by asking up to 5 highly targeted clarification questions and encoding answers back into the spec."
argument-hint: "Optional areas to clarify in the spec"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/clarify.md"
user-invocable: true
disable-model-invocation: false
---


## Entrada del Usuario

```text
$ARGUMENTS
```

DEBES considerar la entrada del usuario antes de continuar (si no está vacía).

## Verificaciones Previas a la Ejecución

**Verificar hooks de extensión (antes de la aclaración)**:
- Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.before_clarify`
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

Objetivo: Detectar y reducir la ambigüedad o los puntos de decisión faltantes en la especificación de la funcionalidad activa, y registrar las aclaraciones directamente en el archivo de especificación.

Nota: Se espera que este flujo de aclaración se ejecute (y se complete) ANTES de invocar `/speckit-plan`. Si el usuario indica explícitamente que va a omitir la aclaración (p. ej., un spike exploratorio), puedes continuar, pero debes advertir que el riesgo de retrabajo posterior aumenta.

Pasos de ejecución:

1. Ejecuta `.specify/scripts/bash/check-prerequisites.sh --json --paths-only` desde la raíz del repositorio **una vez** (modo combinado `--json --paths-only` / `-Json -PathsOnly`). Analiza los campos mínimos del JSON:
   - `FEATURE_DIR`
   - `FEATURE_SPEC`
   - (Opcionalmente captura `IMPL_PLAN`, `TASKS` para futuros flujos encadenados.)
   - Si falla el análisis del JSON, aborta e indica al usuario que vuelva a ejecutar `/speckit-specify` o que verifique el entorno de la rama de la funcionalidad.
   - Para comillas simples en argumentos como "I'm Groot", usa sintaxis de escape: p. ej. 'I'\''m Groot' (o comillas dobles si es posible: "I'm Groot").

2. **SI EXISTE**: Carga `.specify/memory/constitution.md` para conocer los principios y restricciones de gobernanza del proyecto.

3. Carga el archivo de especificación actual. Realiza un escaneo estructurado de ambigüedad y cobertura usando esta taxonomía. Para cada categoría, marca el estado: Claro / Parcial / Faltante. Produce un mapa de cobertura interno usado para priorización (no muestres el mapa en bruto a menos que no se vaya a hacer ninguna pregunta).

   Alcance y Comportamiento Funcional:
   - Objetivos y criterios de éxito principales del usuario
   - Declaraciones explícitas de fuera de alcance
   - Diferenciación de roles/personas de usuario

   Dominio y Modelo de Datos:
   - Entidades, atributos, relaciones
   - Reglas de identidad y unicidad
   - Transiciones de ciclo de vida/estado
   - Supuestos de volumen de datos/escala

   Interacción y Flujo de UX:
   - Recorridos/secuencias de usuario críticos
   - Estados de error/vacío/carga
   - Notas de accesibilidad o localización

   Atributos de Calidad No Funcionales:
   - Rendimiento (objetivos de latencia, throughput)
   - Escalabilidad (horizontal/vertical, límites)
   - Confiabilidad y disponibilidad (uptime, expectativas de recuperación)
   - Observabilidad (señales de logging, métricas, trazas)
   - Seguridad y privacidad (autenticación/autorización, protección de datos, supuestos de amenazas)
   - Restricciones de cumplimiento/regulatorias (si las hay)

   Integración y Dependencias Externas:
   - Servicios/APIs externos y modos de falla
   - Formatos de importación/exportación de datos
   - Supuestos de protocolo/versionado

   Casos Límite y Manejo de Fallas:
   - Escenarios negativos
   - Limitación de tasa / throttling
   - Resolución de conflictos (p. ej., ediciones concurrentes)

   Restricciones y Compensaciones:
   - Restricciones técnicas (lenguaje, almacenamiento, hosting)
   - Compensaciones explícitas o alternativas rechazadas

   Terminología y Consistencia:
   - Términos canónicos del glosario
   - Sinónimos evitados / términos obsoletos

   Señales de Finalización:
   - Comprobabilidad de los criterios de aceptación
   - Indicadores medibles de estilo "Definición de Terminado"

   Misceláneo / Marcadores de Posición:
   - Marcadores TODO / decisiones sin resolver
   - Adjetivos ambiguos ("robusto", "intuitivo") sin cuantificar

   Para cada categoría con estado Parcial o Faltante, agrega una oportunidad de pregunta candidata salvo que:
   - La aclaración no cambiaría materialmente la implementación ni la estrategia de validación
   - Sea mejor diferir la información a la fase de planificación (anótalo internamente)

4. Genera (internamente) una cola priorizada de preguntas de aclaración candidatas (máximo 5). NO las muestres todas de una vez. Aplica estas restricciones:
    - Máximo de 5 preguntas en total durante toda la sesión.
    - Cada pregunta debe poder responderse CON:
       - Una selección corta de opción múltiple (2 a 5 opciones distintas y mutuamente excluyentes), O
       - Una respuesta de una palabra / frase corta (restringe explícitamente: "Responde en <=5 palabras").
    - Incluye solo preguntas cuyas respuestas impacten materialmente la arquitectura, el modelado de datos, la descomposición de tareas, el diseño de pruebas, el comportamiento de UX, la preparación operativa o la validación de cumplimiento.
    - Garantiza un balance de cobertura por categoría: intenta cubrir primero las categorías sin resolver de mayor impacto; evita hacer dos preguntas de bajo impacto cuando un área de alto impacto (p. ej., postura de seguridad) sigue sin resolver.
    - Excluye preguntas ya respondidas, preferencias estilísticas triviales, o detalles de ejecución a nivel de plan (salvo que bloqueen la corrección).
    - Favorece las aclaraciones que reduzcan el riesgo de retrabajo posterior o eviten pruebas de aceptación desalineadas.
    - Si quedan más de 5 categorías sin resolver, selecciona las 5 principales por heurística (Impacto * Incertidumbre).

5. Bucle secuencial de preguntas (interactivo):
    - Presenta EXACTAMENTE UNA pregunta a la vez.
    - **Calidad de redacción de la pregunta (aplica a cada pregunta, de opción múltiple o de respuesta corta):**
       - Comienza con `**Pregunta:**` seguido de una interrogativa completa que termine en `?`. El texto de la pregunta antes del `?` debe tener sentido por sí solo.
       - NUNCA uses una etiqueta de tema, un encabezado de sección o un id de requisito como la pregunta misma. Por ejemplo, `Matriz de dispositivo/runtime de aceptación (FR-023)` es INVÁLIDO — es una etiqueta, no una pregunta.
       - Después del `?`, el único sufijo permitido es un id opcional de requisito/pregunta entre paréntesis. Formato exacto: `**Pregunta:** <interrogativa>?` o `**Pregunta:** <interrogativa>? (FR-023)`. Nunca pongas el id antes del `?`, y nunca uses el id (solo o con una etiqueta de tema) como todo el enunciado.
       - Inmediatamente después de la línea de la pregunta, agrega una oración en lenguaje llano de "Por qué importa" (lo que está en juego para la aceptación o el envío) antes de la recomendación/opciones.
       - Usa un lenguaje cotidiano; introduce jerga solo si se define en la misma oración. Autoverificación: un lector que no conozca Spec Kit debe poder responder solo a partir de la línea de la pregunta. Ser conciso está bien; ser críptico no.
    - Para preguntas de opción múltiple:
       - **Analiza todas las opciones** y determina la **opción más adecuada** basándote en:
          - Mejores prácticas para el tipo de proyecto
          - Patrones comunes en implementaciones similares
          - Reducción de riesgo (seguridad, rendimiento, mantenibilidad)
          - Alineación con cualquier objetivo o restricción de proyecto explícita y visible en la especificación
       - Presenta tu **opción recomendada de forma destacada** al inicio con un razonamiento claro (1-2 oraciones explicando por qué es la mejor elección).
       - Formatea como: `**Recomendado:** Opción [X] - <razonamiento>`
       - Luego presenta todas las opciones como una tabla Markdown:

       | Opción | Descripción |
       |--------|-------------|
       | A | <descripción de la Opción A> |
       | B | <descripción de la Opción B> |
       | C | <descripción de la Opción C> (agrega D/E según sea necesario hasta 5) |
       | Corta | Proporciona una respuesta corta distinta (<=5 palabras) (Inclúyela solo si una alternativa libre es apropiada) |

       - Después de la tabla, agrega: `Puedes responder con la letra de la opción (p. ej., "A"), aceptar la recomendación diciendo "sí" o "recomendada", o dar tu propia respuesta corta.`
    - Para el estilo de respuesta corta (sin opciones discretas significativas):
       - Proporciona tu **respuesta sugerida** basada en mejores prácticas y contexto.
       - Formatea como: `**Sugerido:** <respuesta propuesta> - <breve razonamiento>`
       - Luego muestra: `Formato: Respuesta corta (<=5 palabras). Puedes aceptar la sugerencia diciendo "sí" o "sugerido", o dar tu propia respuesta.`
    - Después de que el usuario responda:
       - Si el usuario responde "sí", "recomendada" o "sugerido", usa tu recomendación/sugerencia previamente declarada como respuesta.
       - En caso contrario, valida que la respuesta corresponda a una opción o cumpla la restricción de <=5 palabras.
       - Si es ambigua, pide una rápida desambiguación (el conteo sigue perteneciendo a la misma pregunta; no avances).
       - Una vez satisfactoria, regístrala en memoria de trabajo (aún no la escribas en disco) y pasa a la siguiente pregunta en cola.
    - Deja de hacer preguntas cuando:
       - Todas las ambigüedades críticas se resuelvan temprano (los ítems restantes en cola dejan de ser necesarios), O
       - El usuario indique que ha terminado ("listo", "bien", "no más"), O
       - Llegues a 5 preguntas realizadas.
    - Nunca reveles las preguntas en cola por adelantado.
    - Si no existen preguntas válidas al inicio, reporta de inmediato que no hay ambigüedades críticas.

6. Integración después de CADA respuesta aceptada (enfoque de actualización incremental):
    - Mantén una representación en memoria de la especificación (cargada una vez al inicio) más el contenido del archivo en bruto.
    - Para la primera respuesta integrada en esta sesión:
       - Asegúrate de que exista una sección `## Aclaraciones` (créala justo después de la sección contextual/de resumen de más alto nivel según la plantilla de especificación si falta).
       - Debajo, crea (si no existe) un subencabezado `### Sesión AAAA-MM-DD` para hoy.
    - Agrega una línea de viñeta inmediatamente después de la aceptación: `- Q: <pregunta> → A: <respuesta final>`.
    - Luego aplica de inmediato la aclaración a la(s) sección(es) más apropiada(s):
       - Ambigüedad funcional → Actualiza o agrega una viñeta en Requisitos Funcionales.
       - Interacción de usuario / distinción de actores → Actualiza las Historias de Usuario o la subsección de Actores (si existe) con el rol, restricción o escenario aclarado.
       - Forma de datos / entidades → Actualiza el Modelo de Datos (agrega campos, tipos, relaciones) preservando el orden; anota las restricciones agregadas de forma sucinta.
       - Restricción no funcional → Agrega/modifica criterios medibles en Criterios de Éxito > Resultados Medibles (convierte el adjetivo vago en una métrica u objetivo explícito).
       - Caso límite / flujo negativo → Agrega una nueva viñeta bajo Casos Límite / Manejo de Errores (o crea esa subsección si la plantilla ofrece un marcador de posición para ello).
       - Conflicto de terminología → Normaliza el término en toda la especificación; conserva el original solo si es necesario agregando `(anteriormente referido como "X")` una vez.
    - Si la aclaración invalida una afirmación ambigua anterior, reemplaza esa afirmación en lugar de duplicarla; no dejes texto contradictorio obsoleto.
    - Guarda el archivo de especificación DESPUÉS de cada integración para minimizar el riesgo de pérdida de contexto (sobrescritura atómica).
    - Preserva el formato: no reordenes secciones no relacionadas; mantén intacta la jerarquía de encabezados.
    - Mantén cada aclaración insertada mínima y comprobable (evita divagar narrativamente).

7. Validación (realizada después de CADA escritura más un pase final):
   - La sección de Aclaraciones contiene exactamente una viñeta por cada respuesta aceptada (sin duplicados).
   - El total de preguntas realizadas (aceptadas) ≤ 5.
   - Las secciones actualizadas no contienen marcadores vagos persistentes que la nueva respuesta debía resolver.
   - No queda ninguna afirmación anterior contradictoria (escanea en busca de alternativas ahora inválidas que no se hayan eliminado).
   - La estructura Markdown es válida; los únicos encabezados nuevos permitidos son: `## Aclaraciones`, `### Sesión AAAA-MM-DD`.
   - Consistencia terminológica: se usa el mismo término canónico en todas las secciones actualizadas.

8. Escribe la especificación actualizada de vuelta en `FEATURE_SPEC`.

9. **Vuelve a validar la Checklist de Calidad de la Especificación** (si existe):
   - Verifica si `FEATURE_DIR/checklists/requirements.md` existe.
   - Si NO existe, omite este paso en silencio.
   - Si existe:
     1. Lee el archivo de checklist.
     2. Identifica todas las líneas de casillas de tipo GitHub — líneas que coincidan con `- [ ]`, `- [x]` o `- [X]` (sin distinguir mayúsculas/minúsculas, tolerante a espacios iniciales para ítems anidados) fuera de bloques de código. Ignora cualquier otro contenido (encabezados, notas, viñetas que no sean casillas, metadatos).
     3. Para cada línea de casilla, registra su estado actual del marcador (marcada o no marcada) y el texto del ítem en una lista "antes" (snapshot).
     4. Reevalúa cada ítem de la checklist contra la especificación **actualizada** (la versión recién guardada en el paso 7).
     5. Para cada ítem de la checklist, actualízalo solo si el estado marcado/no marcado realmente cambia:
        - Si el ítem ahora pasa y estaba sin marcar: cambia `[ ]` a `[x]`.
        - Si el ítem ahora falla y estaba marcado: cambia `[x]`/`[X]` a `[ ]`.
        - Si el estado no cambia: deja el marcador como está (preserva las mayúsculas/minúsculas existentes para evitar diffs cosméticos).
     6. Guarda el archivo de checklist actualizado. **Solo alterna la parte del marcador `[ ]`/`[x]` de las líneas de casilla cuyo estado haya cambiado.** El resto del contenido del archivo — encabezados, metadatos, notas, orden de líneas, espacios en blanco — debe permanecer sin cambios para evitar diffs ruidosos.
     7. Compara el snapshot "antes" con el estado actual para calcular tres listas para el Reporte de Finalización:
        - **Recién aprobados**: ítems que cambiaron de sin marcar a marcado.
        - **Regresiones**: ítems que cambiaron de marcado a sin marcar.
        - **Aún sin marcar**: ítems que permanecen sin marcar.
     8. Registra los conteos de aprobación antes/después como ítems de casilla marcados/total (p. ej., "12/16 → 15/16 ítems aprobados").

Reglas de comportamiento:

- Si no se encuentran ambigüedades significativas (o todas las posibles preguntas serían de bajo impacto), responde: "No se detectaron ambigüedades críticas que merezcan una aclaración formal." y sugiere continuar.
- Si falta el archivo de especificación, indica al usuario que ejecute primero `/speckit-specify` (no crees una especificación nueva aquí).
- Nunca superes 5 preguntas realizadas en total (los reintentos de aclaración para una misma pregunta no cuentan como preguntas nuevas).
- Evita preguntas especulativas sobre el stack tecnológico salvo que su ausencia bloquee la claridad funcional.
- Respeta las señales de finalización temprana del usuario ("detente", "listo", "continúa").
- Si no se hace ninguna pregunta por cobertura completa, muestra un resumen compacto de cobertura (todas las categorías Claras) y luego sugiere avanzar.
- Si se alcanza la cuota con categorías de alto impacto sin resolver, márcalas explícitamente como Diferidas con su justificación.

Contexto para priorización: $ARGUMENTS

## Hooks Obligatorios Posteriores a la Ejecución

**DEBES completar esta sección antes de reportar la finalización al usuario.**

Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si no existe, o no hay hooks registrados bajo `hooks.after_clarify`, pasa al Reporte de Finalización.
- Si existe, léelo y busca entradas bajo la clave `hooks.after_clarify`.
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

Reporta la finalización (después de que termine el bucle de preguntas o de una finalización temprana):
- Número de preguntas realizadas y respondidas.
- Ruta a la especificación actualizada.
- Secciones modificadas (lista de nombres).
- Estado de la checklist de calidad de la especificación (si `FEATURE_DIR/checklists/requirements.md` fue revalidada): muestra los conteos de aprobación antes/después (p. ej., "Checklist de Calidad de la Especificación: 12/16 → 15/16 ítems aprobados") y lista cualquier ítem que haya cambiado de estado — tanto los recién marcados (sin marcar → marcado) como cualquier regresión (marcado → sin marcar). Si quedan ítems sin marcar, lístalos como áreas que necesitan atención.
- Tabla resumen de cobertura que liste cada categoría de la taxonomía con Estado: Resuelto (era Parcial/Faltante y se abordó), Diferido (excede la cuota de preguntas o es más apto para la planificación), Claro (ya suficiente), Pendiente (aún Parcial/Faltante pero de bajo impacto).
- Si queda algún Pendiente o Diferido, recomienda si continuar con `/speckit-plan` o ejecutar `/speckit-clarify` de nuevo más adelante tras el plan.
- Comando sugerido a continuación.

## Completado Cuando

- [ ] Ambigüedades de la especificación identificadas y aclaraciones integradas en el archivo de especificación
- [ ] Checklist de calidad de la especificación revalidada contra la especificación actualizada (si existe `FEATURE_DIR/checklists/requirements.md`)
- [ ] Hooks de extensión despachados u omitidos según las reglas de Hooks Obligatorios Posteriores a la Ejecución
- [ ] Finalización reportada al usuario con las preguntas respondidas, las secciones modificadas, el estado de la checklist y el resumen de cobertura
