---
name: "speckit-checklist"
description: "Generate a custom checklist for the current feature based on user requirements."
argument-hint: "Domain or focus area for the checklist"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/checklist.md"
user-invocable: true
disable-model-invocation: false
---


## Propósito de la Checklist: "Pruebas Unitarias para el Español"

**CONCEPTO CRÍTICO**: Las checklists son **PRUEBAS UNITARIAS PARA LA REDACCIÓN DE REQUISITOS** - validan la calidad, claridad y completitud de los requisitos en un dominio dado.

**NO son para verificación/pruebas**:

- ❌ NO "Verificar que el botón responde correctamente al clic"
- ❌ NO "Probar que el manejo de errores funciona"
- ❌ NO "Confirmar que la API devuelve 200"
- ❌ NO comprobar si el código/la implementación coincide con la especificación

**SÍ para validación de calidad de requisitos**:

- ✅ "¿Están definidos los requisitos de jerarquía visual para todos los tipos de tarjeta?" (completitud)
- ✅ "¿Está 'presentación destacada' cuantificada con tamaño/posición específicos?" (claridad)
- ✅ "¿Son los requisitos de estado hover consistentes en todos los elementos interactivos?" (consistencia)
- ✅ "¿Están definidos los requisitos de accesibilidad para la navegación por teclado?" (cobertura)
- ✅ "¿La especificación define qué pasa cuando la imagen del logo falla al cargar?" (casos límite)

**Metáfora**: Si tu especificación es código escrito en español, la checklist es su suite de pruebas unitarias. Estás probando si los requisitos están bien escritos, completos, no ambiguos y listos para implementación - NO si la implementación funciona.

**Propiedad y ciclo de vida de las casillas**:

- Las checklists personalizadas generadas por este comando son artefactos de revisión de calidad de requisitos, propiedad del revisor.
- `[x]` significa que el revisor determinó que el criterio de calidad de requisitos está satisfecho.
- `[x]` NO significa que el trabajo de implementación esté completo.
- Este comando genera o agrega ítems a la checklist; NO DEBE marcar los ítems generados como `[x]`.
- Un agente puede ayudar a evaluar los ítems solo cuando el revisor lo solicite explícitamente.
- `checklists/requirements.md` es una checklist de calidad de especificación integrada y separada, mantenida por `/speckit-specify` y `/speckit-clarify`; no trates esa excepción como aplicable a las checklists personalizadas generadas aquí.

## Entrada del Usuario

```text
$ARGUMENTS
```

DEBES considerar la entrada del usuario antes de continuar (si no está vacía).

## Verificaciones Previas a la Ejecución

**Verificar hooks de extensión (antes de la generación de la checklist)**:
- Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.before_checklist`
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

    Wait for the result of the hook command before proceeding to the Execution Steps.
    ```
    Después de emitir el bloque anterior DEBES invocar realmente el hook y esperar a que termine antes de continuar. Ejecútalo de la misma forma en que tú mismo ejecutarías el comando en este agente/sesión (la invocación puede diferir del id literal `{command}` mostrado arriba, p. ej. un agente en modo skills lo ejecuta como `/skill:speckit-...` o `$speckit-...`). Emitir solo el bloque no ejecuta el hook.
- Si no hay hooks registrados o `.specify/extensions.yml` no existe, omite en silencio

## Pasos de Ejecución

1. **Configuración**: Ejecuta `.specify/scripts/bash/check-prerequisites.sh --json --template checklist-template` desde la raíz del repositorio y analiza el JSON para FEATURE_DIR, la lista AVAILABLE_DOCS y TEMPLATE_CONTENT.
   - Todas las rutas de archivo deben ser absolutas.
   - Para comillas simples en argumentos como "I'm Groot", usa sintaxis de escape: p. ej. 'I'\''m Groot' (o comillas dobles si es posible: "I'm Groot").

2. **SI EXISTE**: Carga `.specify/memory/constitution.md` para conocer los principios y restricciones de gobernanza del proyecto.

3. **Aclarar la intención (dinámico)**: Deriva hasta TRES preguntas de aclaración contextuales iniciales (sin catálogo predefinido). DEBEN:
   - Generarse a partir de la redacción del usuario + señales extraídas de spec/plan/tasks
   - Preguntar únicamente sobre información que cambie materialmente el contenido de la checklist
   - Omitirse individualmente si ya son inequívocas en `$ARGUMENTS`
   - Preferir precisión sobre amplitud

   Algoritmo de generación:
   1. Extrae señales: palabras clave del dominio de la funcionalidad (p. ej., auth, latencia, UX, API), indicadores de riesgo ("crítico", "debe", "cumplimiento"), pistas de interesados ("QA", "revisión", "equipo de seguridad") y entregables explícitos ("a11y", "rollback", "contratos").
   2. Agrupa las señales en áreas de enfoque candidatas (máximo 4) ordenadas por relevancia.
   3. Identifica la audiencia y el momento probables (autor, revisor, QA, release) si no son explícitos.
   4. Detecta dimensiones faltantes: amplitud de alcance, profundidad/rigor, énfasis en riesgo, límites de exclusión, criterios de aceptación medibles.
   5. Formula preguntas elegidas de estos arquetipos:
      - Refinamiento de alcance (p. ej., "¿Debería incluir esto los puntos de integración con X y Y o limitarse a la corrección del módulo local?")
      - Priorización de riesgo (p. ej., "¿Cuál de estas posibles áreas de riesgo debería recibir controles de gate obligatorios?")
      - Calibración de profundidad (p. ej., "¿Es esto una lista ligera de sanity pre-commit o un gate formal de release?")
      - Encuadre de audiencia (p. ej., "¿Será usada solo por el autor o también por pares durante la revisión de PR?")
      - Exclusión de límites (p. ej., "¿Deberíamos excluir explícitamente los ítems de ajuste de rendimiento en esta ronda?")
      - Brecha de clase de escenario (p. ej., "No se detectaron flujos de recuperación—¿están en alcance las rutas de rollback / falla parcial?")

   Reglas de formato de preguntas:
   - Si presentas opciones, genera una tabla compacta con columnas: Opción | Candidata | Por Qué Importa
   - Limita a un máximo de opciones A–E; omite la tabla si una respuesta libre es más clara
   - Nunca le pidas al usuario que repita lo que ya dijo
   - Evita categorías especulativas (sin alucinar). Si tienes dudas, pregunta explícitamente: "Confirma si X pertenece al alcance."

   Valores predeterminados cuando la interacción es imposible:
   - Profundidad: Estándar
   - Audiencia: Revisor (PR) si es relacionado con código; Autor en otro caso
   - Enfoque: Los 2 clusters de mayor relevancia

   Muestra las preguntas (etiqueta Q1/Q2/Q3). Después de las respuestas: si ≥2 clases de escenario (Alterno / Excepción / Recuperación / dominio No Funcional) siguen sin estar claras, PUEDES hacer hasta DOS preguntas de seguimiento más específicas (Q4/Q5) con una justificación de una línea cada una (p. ej., "Riesgo de ruta de recuperación sin resolver"). No superes cinco preguntas en total. Omite la escalación si el usuario declina explícitamente más preguntas.

4. **Entender la solicitud del usuario**: Combina `$ARGUMENTS` + respuestas de aclaración:
   - Deriva el tema de la checklist (p. ej., seguridad, revisión, despliegue, ux)
   - Consolida los ítems imprescindibles explícitos mencionados por el usuario
   - Mapea las selecciones de enfoque al esqueleto de categorías
   - Infiere cualquier contexto faltante desde spec/plan/tasks (NO alucines)

5. **Cargar el contexto de la funcionalidad**: Lee desde FEATURE_DIR:
   - spec.md: Requisitos y alcance de la funcionalidad
   - plan.md (si existe): Detalles técnicos, dependencias
   - tasks.md (si existe): Tareas de implementación

   **Estrategia de Carga de Contexto**:
   - Carga solo las porciones necesarias relevantes a las áreas de enfoque activas (evita volcar el archivo completo)
   - Prefiere resumir las secciones largas en viñetas concisas de escenario/requisito
   - Usa divulgación progresiva: agrega recuperación adicional solo si se detectan brechas
   - Si los documentos fuente son extensos, genera ítems de resumen intermedios en lugar de incrustar texto en bruto

6. **Generar la checklist** - Usa TEMPLATE_CONTENT como plantilla estructural y crea "Pruebas Unitarias para Requisitos":
   - Crea el directorio `FEATURE_DIR/checklists/` si no existe
   - Genera un nombre de archivo único para la checklist:
     - Usa un nombre corto y descriptivo basado en el dominio (p. ej., `ux.md`, `api.md`, `security.md`)
     - Formato: `[dominio].md`
   - Comportamiento de manejo de archivos:
     - Si el archivo NO existe: Crea uno nuevo y numera los ítems comenzando en CHK001
     - Si el archivo existe: Agrega los ítems nuevos al archivo existente, continuando desde el último ID CHK (p. ej., si el último ítem es CHK015, comienza los nuevos en CHK016)
   - Nunca elimines ni reemplaces el contenido existente de la checklist - siempre preserva y agrega
   - Deja cada ítem recién generado sin marcar (`[ ]`); el estado de la casilla pertenece al revisor

   **PRINCIPIO CENTRAL - Probar los Requisitos, No la Implementación**:
   Todo ítem de la checklist DEBE evaluar los REQUISITOS EN SÍ MISMOS en cuanto a:
   - **Completitud**: ¿Están presentes todos los requisitos necesarios?
   - **Claridad**: ¿Son los requisitos no ambiguos y específicos?
   - **Consistencia**: ¿Se alinean los requisitos entre sí?
   - **Medibilidad**: ¿Pueden los requisitos verificarse objetivamente?
   - **Cobertura**: ¿Están cubiertos todos los escenarios/casos límite?

   **Estructura de Categorías** - Agrupa los ítems por dimensiones de calidad de requisitos:
   - **Completitud de Requisitos** (¿Están documentados todos los requisitos necesarios?)
   - **Claridad de Requisitos** (¿Son los requisitos específicos y no ambiguos?)
   - **Consistencia de Requisitos** (¿Se alinean los requisitos sin conflictos?)
   - **Calidad de los Criterios de Aceptación** (¿Son medibles los criterios de éxito?)
   - **Cobertura de Escenarios** (¿Están cubiertos todos los flujos/casos?)
   - **Cobertura de Casos Límite** (¿Están definidas las condiciones límite?)
   - **Requisitos No Funcionales** (Rendimiento, Seguridad, Accesibilidad, etc. - ¿están especificados?)
   - **Dependencias y Supuestos** (¿Están documentados y validados?)
   - **Ambigüedades y Conflictos** (¿Qué necesita aclaración?)

   **CÓMO ESCRIBIR ÍTEMS DE CHECKLIST - "Pruebas Unitarias para el Español"**:

   ❌ **INCORRECTO** (Probando la implementación):
   - "Verificar que la página de aterrizaje muestra 3 tarjetas de episodio"
   - "Probar que los estados hover funcionan en escritorio"
   - "Confirmar que el clic en el logo navega al inicio"

   ✅ **CORRECTO** (Probando la calidad de los requisitos):
   - "¿Están especificados el número y la disposición exactos de los episodios destacados?" [Completitud]
   - "¿Está 'presentación destacada' cuantificada con tamaño/posición específicos?" [Claridad]
   - "¿Son consistentes los requisitos de estado hover en todos los elementos interactivos?" [Consistencia]
   - "¿Están definidos los requisitos de navegación por teclado para toda la UI interactiva?" [Cobertura]
   - "¿Está especificado el comportamiento de respaldo cuando la imagen del logo falla al cargar?" [Casos Límite]
   - "¿Están definidos los estados de carga para los datos asíncronos de episodios?" [Completitud]
   - "¿Define la especificación la jerarquía visual para elementos de UI en competencia?" [Claridad]

   **ESTRUCTURA DEL ÍTEM**:
   Cada ítem debe seguir este patrón:
   - Formato de pregunta sobre la calidad del requisito
   - Enfocado en lo que está ESCRITO (o no escrito) en la especificación/plan
   - Incluir la dimensión de calidad entre corchetes [Completitud/Claridad/Consistencia/etc.]
   - Referenciar la sección de la especificación `[Spec §X.Y]` al verificar requisitos existentes
   - Usar el marcador `[Gap]` al verificar requisitos faltantes

   **EJEMPLOS POR DIMENSIÓN DE CALIDAD**:

   Completitud:
   - "¿Están definidos los requisitos de manejo de errores para todos los modos de falla de la API? [Gap]"
   - "¿Están especificados los requisitos de accesibilidad para todos los elementos interactivos? [Completitud]"
   - "¿Están definidos los requisitos de breakpoint móvil para diseños responsivos? [Gap]"

   Claridad:
   - "¿Está 'carga rápida' cuantificada con umbrales de tiempo específicos? [Claridad, Spec §NFR-2]"
   - "¿Están explícitamente definidos los criterios de selección de 'episodios relacionados'? [Claridad, Spec §FR-5]"
   - "¿Está 'destacado' definido con propiedades visuales medibles? [Ambigüedad, Spec §FR-4]"

   Consistencia:
   - "¿Se alinean los requisitos de navegación entre todas las páginas? [Consistencia, Spec §FR-10]"
   - "¿Son consistentes los requisitos de componentes de tarjeta entre la página de aterrizaje y la de detalle? [Consistencia]"

   Cobertura:
   - "¿Están definidos los requisitos para escenarios de estado vacío (sin episodios)? [Cobertura, Caso Límite]"
   - "¿Están cubiertos los escenarios de interacción concurrente de usuarios? [Cobertura, Gap]"
   - "¿Están especificados los requisitos para fallas de carga parcial de datos? [Cobertura, Flujo de Excepción]"

   Medibilidad:
   - "¿Son medibles/comprobables los requisitos de jerarquía visual? [Criterios de Aceptación, Spec §FR-1]"
   - "¿Puede verificarse objetivamente el 'peso visual equilibrado'? [Medibilidad, Spec §FR-2]"

   **Clasificación y Cobertura de Escenarios** (Enfoque en Calidad de Requisitos):
   - Verifica si existen requisitos para: escenarios Primarios, Alternos, de Excepción/Error, de Recuperación, No Funcionales
   - Para cada clase de escenario, pregunta: "¿Son los requisitos de [tipo de escenario] completos, claros y consistentes?"
   - Si falta una clase de escenario: "¿Están los requisitos de [tipo de escenario] intencionalmente excluidos o faltantes? [Gap]"
   - Incluye resiliencia/rollback cuando ocurra mutación de estado: "¿Están definidos los requisitos de rollback para fallas de migración? [Gap]"

   **Requisitos de Trazabilidad**:
   - MÍNIMO: ≥80% de los ítems DEBEN incluir al menos una referencia de trazabilidad
   - Cada ítem debe referenciar: la sección de la especificación `[Spec §X.Y]`, o usar los marcadores: `[Gap]`, `[Ambigüedad]`, `[Conflicto]`, `[Supuesto]`
   - Si no existe un sistema de IDs: "¿Está establecido un esquema de ID de requisito y criterio de aceptación? [Trazabilidad]"

   **Sacar a la Luz y Resolver Problemas** (Problemas de Calidad de Requisitos):
   Haz preguntas sobre los requisitos mismos:
   - Ambigüedades: "¿Está el término 'rápido' cuantificado con métricas específicas? [Ambigüedad, Spec §NFR-1]"
   - Conflictos: "¿Entran en conflicto los requisitos de navegación entre §FR-10 y §FR-10a? [Conflicto]"
   - Supuestos: "¿Está validado el supuesto de una 'API de podcast siempre disponible'? [Supuesto]"
   - Dependencias: "¿Están documentados los requisitos de la API externa de podcast? [Dependencia, Gap]"
   - Definiciones faltantes: "¿Está definida 'jerarquía visual' con criterios medibles? [Gap]"

   **Consolidación de Contenido**:
   - Límite blando: Si los ítems candidatos en bruto superan 40, prioriza por riesgo/impacto
   - Fusiona los casi duplicados que verifican el mismo aspecto del requisito
   - Si hay >5 casos límite de bajo impacto, crea un solo ítem: "¿Están cubiertos en los requisitos los casos límite X, Y, Z? [Cobertura]"

   **🚫 ABSOLUTAMENTE PROHIBIDO** - Esto convierte la checklist en una prueba de implementación, no de requisitos:
   - ❌ Cualquier ítem que empiece con "Verificar", "Probar", "Confirmar", "Comprobar" + comportamiento de implementación
   - ❌ Referencias a ejecución de código, acciones de usuario, comportamiento del sistema
   - ❌ "Se muestra correctamente", "funciona bien", "funciona según lo esperado"
   - ❌ "Clic", "navegar", "renderizar", "cargar", "ejecutar"
   - ❌ Casos de prueba, planes de prueba, procedimientos de QA
   - ❌ Detalles de implementación (frameworks, APIs, algoritmos)

   **✅ PATRONES REQUERIDOS** - Estos sí prueban la calidad de los requisitos:
   - ✅ "¿Están [tipo de requisito] definidos/especificados/documentados para [escenario]?"
   - ✅ "¿Está [término vago] cuantificado/aclarado con criterios específicos?"
   - ✅ "¿Son consistentes los requisitos entre [sección A] y [sección B]?"
   - ✅ "¿Puede [requisito] medirse/verificarse objetivamente?"
   - ✅ "¿Están cubiertos [casos límite/escenarios] en los requisitos?"
   - ✅ "¿Define la especificación [aspecto faltante]?"

7. **Referencia de Estructura**: Genera la checklist siguiendo la plantilla canónica en `.specify/templates/checklist-template.md` para el título, la sección de metadatos, los encabezados de categoría, la nota de propiedad, la sección de notas y el formato de ID. Si la plantilla no está disponible, usa: título H1, líneas de metadatos de propósito/creación, una nota de propiedad explicando que `[x]` significa aprobación del revisor sobre la calidad del requisito, secciones `##` de categoría que contengan líneas `- [ ] CHK### <ítem de requisito>` con IDs incrementales globales comenzando en CHK001, y notas indicando que `/speckit-implement` lee el estado de la checklist pero no modifica los marcadores.

8. **Reporte**: Muestra la ruta completa al archivo de checklist, el conteo de ítems y resume si la ejecución creó un archivo nuevo o agregó a uno existente. Resume:
   - Áreas de enfoque seleccionadas
   - Nivel de profundidad
   - Actor/momento
   - Cualquier ítem imprescindible explícito especificado por el usuario que se haya incorporado

**Importante**: Cada invocación del comando `/speckit-checklist` usa un nombre de archivo de checklist corto y descriptivo, y crea un archivo nuevo o agrega a uno existente. Esto permite:

- Varias checklists de distintos tipos (p. ej., `ux.md`, `test.md`, `security.md`)
- Nombres de archivo simples y memorables que indican el propósito de la checklist
- Fácil identificación y navegación en la carpeta `checklists/`

Para evitar desorden, usa tipos descriptivos y elimina las checklists obsoletas cuando ya no se necesiten.

## Ejemplos de Tipos de Checklist e Ítems de Muestra

**Calidad de Requisitos de UX:** `ux.md`

Ítems de muestra (probando los requisitos, NO la implementación):

- "¿Están definidos los requisitos de jerarquía visual con criterios medibles? [Claridad, Spec §FR-1]"
- "¿Está explícitamente especificado el número y posicionamiento de los elementos de UI? [Completitud, Spec §FR-1]"
- "¿Están definidos de forma consistente los requisitos de estado de interacción (hover, focus, active)? [Consistencia]"
- "¿Están especificados los requisitos de accesibilidad para todos los elementos interactivos? [Cobertura, Gap]"
- "¿Está definido el comportamiento de respaldo cuando las imágenes fallan al cargar? [Caso Límite, Gap]"
- "¿Puede medirse objetivamente 'presentación destacada'? [Medibilidad, Spec §FR-4]"

**Calidad de Requisitos de API:** `api.md`

Ítems de muestra:

- "¿Están especificados los formatos de respuesta de error para todos los escenarios de falla? [Completitud]"
- "¿Están cuantificados los requisitos de limitación de tasa con umbrales específicos? [Claridad]"
- "¿Son consistentes los requisitos de autenticación en todos los endpoints? [Consistencia]"
- "¿Están definidos los requisitos de reintento/timeout para dependencias externas? [Cobertura, Gap]"
- "¿Está documentada la estrategia de versionado en los requisitos? [Gap]"

**Calidad de Requisitos de Rendimiento:** `performance.md`

Ítems de muestra:

- "¿Están cuantificados los requisitos de rendimiento con métricas específicas? [Claridad]"
- "¿Están definidos los objetivos de rendimiento para todos los recorridos de usuario críticos? [Cobertura]"
- "¿Están especificados los requisitos de rendimiento bajo distintas condiciones de carga? [Completitud]"
- "¿Pueden medirse objetivamente los requisitos de rendimiento? [Medibilidad]"
- "¿Están definidos los requisitos de degradación para escenarios de alta carga? [Caso Límite, Gap]"

**Calidad de Requisitos de Seguridad:** `security.md`

Ítems de muestra:

- "¿Están especificados los requisitos de autenticación para todos los recursos protegidos? [Cobertura]"
- "¿Están definidos los requisitos de protección de datos para información sensible? [Completitud]"
- "¿Está documentado el modelo de amenazas y alineados los requisitos con él? [Trazabilidad]"
- "¿Son consistentes los requisitos de seguridad con las obligaciones de cumplimiento? [Consistencia]"
- "¿Están definidos los requisitos de respuesta ante fallas de seguridad/brechas? [Gap, Flujo de Excepción]"

## Antiejemplos: Qué NO Hacer

**❌ INCORRECTO - Esto prueba la implementación, no los requisitos:**

```markdown
- [ ] CHK001 - Verificar que la página de aterrizaje muestra 3 tarjetas de episodio [Spec §FR-001]
- [ ] CHK002 - Probar que los estados hover funcionan correctamente en escritorio [Spec §FR-003]
- [ ] CHK003 - Confirmar que el clic en el logo navega a la página de inicio [Spec §FR-010]
- [ ] CHK004 - Comprobar que la sección de episodios relacionados muestra de 3 a 5 ítems [Spec §FR-005]
```

**✅ CORRECTO - Esto prueba la calidad de los requisitos:**

```markdown
- [ ] CHK001 - ¿Están explícitamente especificados el número y la disposición de los episodios destacados? [Completitud, Spec §FR-001]
- [ ] CHK002 - ¿Están definidos de forma consistente los requisitos de estado hover para todos los elementos interactivos? [Consistencia, Spec §FR-003]
- [ ] CHK003 - ¿Son claros los requisitos de navegación para todos los elementos de marca clicables? [Claridad, Spec §FR-010]
- [ ] CHK004 - ¿Está documentado el criterio de selección de episodios relacionados? [Gap, Spec §FR-005]
- [ ] CHK005 - ¿Están definidos los requisitos de estado de carga para los datos asíncronos de episodios? [Gap]
- [ ] CHK006 - ¿Pueden medirse objetivamente los requisitos de "jerarquía visual"? [Medibilidad, Spec §FR-001]
```

**Diferencias Clave:**

- Incorrecto: Prueba si el sistema funciona correctamente
- Correcto: Prueba si los requisitos están escritos correctamente
- Incorrecto: Verificación del comportamiento
- Correcto: Validación de la calidad del requisito
- Incorrecto: "¿Hace X?"
- Correcto: "¿Está X claramente especificado?"

## Verificaciones Posteriores a la Ejecución

**Verificar hooks de extensión (después de la generación de la checklist)**:
Verifica si `.specify/extensions.yml` existe en la raíz del proyecto.
- Si existe, léelo y busca entradas bajo la clave `hooks.after_checklist`
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
