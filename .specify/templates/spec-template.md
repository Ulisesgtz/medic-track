# Especificación de Funcionalidad: [NOMBRE DE LA FUNCIONALIDAD]

**Rama de la Funcionalidad**: `[###-nombre-funcionalidad]`

**Creado**: [FECHA]

**Estado**: Borrador

**Entrada**: Descripción del usuario: "$ARGUMENTS"

## Escenarios de Usuario y Pruebas *(obligatorio)*

<!--
  IMPORTANTE: Las historias de usuario deben estar PRIORIZADAS como recorridos de usuario ordenados por importancia.
  Cada historia/recorrido de usuario debe ser INDEPENDIENTEMENTE COMPROBABLE - es decir, si implementas solo UNA de ellas,
  debes seguir teniendo un MVP (Producto Mínimo Viable) viable que aporte valor.

  Asigna prioridades (P1, P2, P3, etc.) a cada historia, donde P1 es la más crítica.
  Piensa en cada historia como una porción independiente de funcionalidad que puede ser:
  - Desarrollada de forma independiente
  - Probada de forma independiente
  - Desplegada de forma independiente
  - Demostrada a los usuarios de forma independiente
-->

### Historia de Usuario 1 - [Título Breve] (Prioridad: P1)

[Describe este recorrido de usuario en lenguaje sencillo]

**Por qué esta prioridad**: [Explica el valor y por qué tiene este nivel de prioridad]

**Prueba Independiente**: [Describe cómo puede probarse de forma independiente - p. ej., "Se puede probar por completo mediante [acción específica] y aporta [valor específico]"]

**Escenarios de Aceptación**:

1. **Dado** [estado inicial], **Cuando** [acción], **Entonces** [resultado esperado]
2. **Dado** [estado inicial], **Cuando** [acción], **Entonces** [resultado esperado]

---

### Historia de Usuario 2 - [Título Breve] (Prioridad: P2)

[Describe este recorrido de usuario en lenguaje sencillo]

**Por qué esta prioridad**: [Explica el valor y por qué tiene este nivel de prioridad]

**Prueba Independiente**: [Describe cómo puede probarse de forma independiente]

**Escenarios de Aceptación**:

1. **Dado** [estado inicial], **Cuando** [acción], **Entonces** [resultado esperado]

---

### Historia de Usuario 3 - [Título Breve] (Prioridad: P3)

[Describe este recorrido de usuario en lenguaje sencillo]

**Por qué esta prioridad**: [Explica el valor y por qué tiene este nivel de prioridad]

**Prueba Independiente**: [Describe cómo puede probarse de forma independiente]

**Escenarios de Aceptación**:

1. **Dado** [estado inicial], **Cuando** [acción], **Entonces** [resultado esperado]

---

[Agrega más historias de usuario según sea necesario, cada una con una prioridad asignada]

### Casos Límite

<!--
  ACCIÓN REQUERIDA: El contenido de esta sección son marcadores de posición.
  Complétalos con los casos límite correctos.
-->

- ¿Qué sucede cuando [condición límite]?
- ¿Cómo maneja el sistema [escenario de error]?

## Requisitos *(obligatorio)*

<!--
  ACCIÓN REQUERIDA: El contenido de esta sección son marcadores de posición.
  Complétalos con los requisitos funcionales correctos.
-->

### Requisitos Funcionales

- **FR-001**: El sistema DEBE [capacidad específica, p. ej., "permitir a los usuarios crear cuentas"]
- **FR-002**: El sistema DEBE [capacidad específica, p. ej., "validar direcciones de correo electrónico"]
- **FR-003**: Los usuarios DEBEN poder [interacción clave, p. ej., "restablecer su contraseña"]
- **FR-004**: El sistema DEBE [requisito de datos, p. ej., "persistir las preferencias del usuario"]
- **FR-005**: El sistema DEBE [comportamiento, p. ej., "registrar todos los eventos de seguridad"]

*Ejemplo de cómo marcar requisitos poco claros:*

- **FR-006**: El sistema DEBE autenticar usuarios mediante [NEEDS CLARIFICATION: método de autenticación no especificado - ¿correo/contraseña, SSO, OAuth?]
- **FR-007**: El sistema DEBE conservar los datos del usuario durante [NEEDS CLARIFICATION: periodo de retención no especificado]

### Entidades Clave *(incluir si la funcionalidad involucra datos)*

- **[Entidad 1]**: [Qué representa, atributos clave sin detalles de implementación]
- **[Entidad 2]**: [Qué representa, relaciones con otras entidades]

## Criterios de Éxito *(obligatorio)*

<!--
  ACCIÓN REQUERIDA: Define criterios de éxito medibles.
  Deben ser independientes de la tecnología y medibles.
-->

### Resultados Medibles

- **SC-001**: [Métrica medible, p. ej., "Los usuarios pueden completar la creación de cuenta en menos de 2 minutos"]
- **SC-002**: [Métrica medible, p. ej., "El sistema soporta 1000 usuarios concurrentes sin degradación"]
- **SC-003**: [Métrica de satisfacción del usuario, p. ej., "El 90% de los usuarios completa la tarea principal con éxito en el primer intento"]
- **SC-004**: [Métrica de negocio, p. ej., "Reducir los tickets de soporte relacionados con [X] en un 50%"]

## Supuestos

<!--
  ACCIÓN REQUERIDA: El contenido de esta sección son marcadores de posición.
  Complétalos con los supuestos correctos, basados en los valores predeterminados
  razonables elegidos cuando la descripción de la funcionalidad no especificaba ciertos detalles.
-->

- [Supuesto sobre los usuarios objetivo, p. ej., "Los usuarios cuentan con conexión a internet estable"]
- [Supuesto sobre los límites del alcance, p. ej., "El soporte móvil queda fuera de alcance para la v1"]
- [Supuesto sobre datos/entorno, p. ej., "Se reutilizará el sistema de autenticación existente"]
- [Dependencia de un sistema/servicio existente, p. ej., "Requiere acceso a la API de perfil de usuario existente"]
