---

description: "Plantilla de lista de tareas para la implementación de la funcionalidad"
---

# Tareas: [NOMBRE DE LA FUNCIONALIDAD]

**Entrada**: Documentos de diseño desde `/specs/[###-nombre-funcionalidad]/`

**Prerrequisitos**: plan.md (obligatorio), spec.md (obligatorio para las historias de usuario), research.md, data-model.md, contracts/

**Pruebas**: Los ejemplos a continuación incluyen tareas de prueba. Las pruebas son OPCIONALES - solo inclúyelas si se solicitan explícitamente en la especificación de la funcionalidad.

**Organización**: Las tareas se agrupan por historia de usuario para permitir la implementación y prueba independiente de cada historia.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: Se puede ejecutar en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: A qué historia de usuario pertenece la tarea (p. ej., US1, US2, US3)
- Incluye las rutas de archivo exactas en las descripciones

## Convenciones de Rutas

- **Proyecto único**: `src/`, `tests/` en la raíz del repositorio
- **Aplicación web**: `backend/src/`, `frontend/src/`
- **Móvil**: `api/src/`, `ios/src/` o `android/src/`
- Las rutas mostradas a continuación asumen un proyecto único - ajusta según la estructura de plan.md

<!--
  ============================================================================
  IMPORTANTE: Las tareas siguientes son TAREAS DE EJEMPLO solo con fines ilustrativos.

  El comando /speckit-tasks DEBE reemplazarlas con tareas reales basadas en:
  - Historias de usuario de spec.md (con sus prioridades P1, P2, P3...)
  - Requisitos de la funcionalidad de plan.md
  - Entidades de data-model.md
  - Endpoints de contracts/

  Las tareas DEBEN organizarse por historia de usuario para que cada historia pueda ser:
  - Implementada de forma independiente
  - Probada de forma independiente
  - Entregada como un incremento de MVP

  NO conserves estas tareas de ejemplo en el archivo tasks.md generado.
  ============================================================================
-->

## Fase 1: Configuración (Infraestructura Compartida)

**Propósito**: Inicialización del proyecto y estructura básica

- [ ] T001 Crear la estructura del proyecto según el plan de implementación
- [ ] T002 Inicializar el proyecto en [lenguaje] con las dependencias de [framework]
- [ ] T003 [P] Configurar las herramientas de linting y formateo

---

## Fase 2: Fundamental (Prerrequisitos Bloqueantes)

**Propósito**: Infraestructura central que DEBE estar completa antes de que se pueda implementar CUALQUIER historia de usuario

**⚠️ CRÍTICO**: No puede comenzar el trabajo de ninguna historia de usuario hasta que esta fase esté completa

Ejemplos de tareas fundamentales (ajustar según tu proyecto):

- [ ] T004 Configurar el esquema de base de datos y el framework de migraciones
- [ ] T005 [P] Implementar el framework de autenticación/autorización
- [ ] T006 [P] Configurar el enrutamiento de la API y la estructura de middleware
- [ ] T007 Crear los modelos/entidades base de los que dependen todas las historias
- [ ] T008 Configurar la infraestructura de manejo de errores y logging
- [ ] T009 Configurar la gestión de configuración de entorno

**Punto de Control**: Fundación lista - la implementación de historias de usuario puede comenzar ahora en paralelo

---

## Fase 3: Historia de Usuario 1 - [Título] (Prioridad: P1) 🎯 MVP

**Objetivo**: [Breve descripción de lo que entrega esta historia]

**Prueba Independiente**: [Cómo verificar que esta historia funciona por sí sola]

### Pruebas para la Historia de Usuario 1 (OPCIONAL - solo si se solicitan pruebas) ⚠️

> **NOTA: Escribe estas pruebas PRIMERO, asegúrate de que FALLEN antes de implementar**

- [ ] T010 [P] [US1] Prueba de contrato para [endpoint] en tests/contract/test_[nombre].py
- [ ] T011 [P] [US1] Prueba de integración para [recorrido de usuario] en tests/integration/test_[nombre].py

### Implementación de la Historia de Usuario 1

- [ ] T012 [P] [US1] Crear el modelo [Entidad1] en src/models/[entidad1].py
- [ ] T013 [P] [US1] Crear el modelo [Entidad2] en src/models/[entidad2].py
- [ ] T014 [US1] Implementar [Servicio] en src/services/[servicio].py (depende de T012, T013)
- [ ] T015 [US1] Implementar [endpoint/funcionalidad] en src/[ubicación]/[archivo].py
- [ ] T016 [US1] Agregar validación y manejo de errores
- [ ] T017 [US1] Agregar logging para las operaciones de la historia de usuario 1

**Punto de Control**: En este punto, la Historia de Usuario 1 debería estar completamente funcional y ser comprobable de forma independiente

---

## Fase 4: Historia de Usuario 2 - [Título] (Prioridad: P2)

**Objetivo**: [Breve descripción de lo que entrega esta historia]

**Prueba Independiente**: [Cómo verificar que esta historia funciona por sí sola]

### Pruebas para la Historia de Usuario 2 (OPCIONAL - solo si se solicitan pruebas) ⚠️

- [ ] T018 [P] [US2] Prueba de contrato para [endpoint] en tests/contract/test_[nombre].py
- [ ] T019 [P] [US2] Prueba de integración para [recorrido de usuario] en tests/integration/test_[nombre].py

### Implementación de la Historia de Usuario 2

- [ ] T020 [P] [US2] Crear el modelo [Entidad] en src/models/[entidad].py
- [ ] T021 [US2] Implementar [Servicio] en src/services/[servicio].py
- [ ] T022 [US2] Implementar [endpoint/funcionalidad] en src/[ubicación]/[archivo].py
- [ ] T023 [US2] Integrar con los componentes de la Historia de Usuario 1 (si es necesario)

**Punto de Control**: En este punto, las Historias de Usuario 1 Y 2 deberían funcionar ambas de forma independiente

---

## Fase 5: Historia de Usuario 3 - [Título] (Prioridad: P3)

**Objetivo**: [Breve descripción de lo que entrega esta historia]

**Prueba Independiente**: [Cómo verificar que esta historia funciona por sí sola]

### Pruebas para la Historia de Usuario 3 (OPCIONAL - solo si se solicitan pruebas) ⚠️

- [ ] T024 [P] [US3] Prueba de contrato para [endpoint] en tests/contract/test_[nombre].py
- [ ] T025 [P] [US3] Prueba de integración para [recorrido de usuario] en tests/integration/test_[nombre].py

### Implementación de la Historia de Usuario 3

- [ ] T026 [P] [US3] Crear el modelo [Entidad] en src/models/[entidad].py
- [ ] T027 [US3] Implementar [Servicio] en src/services/[servicio].py
- [ ] T028 [US3] Implementar [endpoint/funcionalidad] en src/[ubicación]/[archivo].py

**Punto de Control**: Todas las historias de usuario deberían ser ahora funcionales de forma independiente

---

[Agrega más fases de historias de usuario según sea necesario, siguiendo el mismo patrón]

---

## Fase N: Pulido y Aspectos Transversales

**Propósito**: Mejoras que afectan a varias historias de usuario

- [ ] TXXX [P] Actualizaciones de documentación en docs/
- [ ] TXXX Limpieza y refactorización de código
- [ ] TXXX Optimización de rendimiento en todas las historias
- [ ] TXXX [P] Pruebas unitarias adicionales (si se solicitan) en tests/unit/
- [ ] TXXX Endurecimiento de seguridad
- [ ] TXXX Ejecutar la validación de quickstart.md

---

## Dependencias y Orden de Ejecución

### Dependencias de Fase

- **Configuración (Fase 1)**: Sin dependencias - puede comenzar de inmediato
- **Fundamental (Fase 2)**: Depende de completar la Configuración - BLOQUEA todas las historias de usuario
- **Historias de Usuario (Fase 3+)**: Todas dependen de completar la fase Fundamental
  - Las historias de usuario pueden entonces avanzar en paralelo (si hay personal suficiente)
  - O de forma secuencial en orden de prioridad (P1 → P2 → P3)
- **Pulido (Fase Final)**: Depende de que estén completas todas las historias de usuario deseadas

### Dependencias entre Historias de Usuario

- **Historia de Usuario 1 (P1)**: Puede comenzar tras la Fundamental (Fase 2) - Sin dependencias de otras historias
- **Historia de Usuario 2 (P2)**: Puede comenzar tras la Fundamental (Fase 2) - Puede integrarse con US1 pero debe poder probarse de forma independiente
- **Historia de Usuario 3 (P3)**: Puede comenzar tras la Fundamental (Fase 2) - Puede integrarse con US1/US2 pero debe poder probarse de forma independiente

### Dentro de Cada Historia de Usuario

- Las pruebas (si se incluyen) DEBEN escribirse y FALLAR antes de implementar
- Modelos antes que servicios
- Servicios antes que endpoints
- Implementación central antes que la integración
- Historia completa antes de pasar a la siguiente prioridad

### Oportunidades de Paralelización

- Todas las tareas de Configuración marcadas [P] pueden ejecutarse en paralelo
- Todas las tareas Fundamentales marcadas [P] pueden ejecutarse en paralelo (dentro de la Fase 2)
- Una vez completada la fase Fundamental, todas las historias de usuario pueden iniciar en paralelo (si la capacidad del equipo lo permite)
- Todas las pruebas de una historia de usuario marcadas [P] pueden ejecutarse en paralelo
- Los modelos dentro de una historia marcados [P] pueden ejecutarse en paralelo
- Distintas historias de usuario pueden trabajarse en paralelo por distintos miembros del equipo

---

## Ejemplo Paralelo: Historia de Usuario 1

```bash
# Lanzar juntas todas las pruebas de la Historia de Usuario 1 (si se solicitan pruebas):
Task: "Prueba de contrato para [endpoint] en tests/contract/test_[nombre].py"
Task: "Prueba de integración para [recorrido de usuario] en tests/integration/test_[nombre].py"

# Lanzar juntos todos los modelos de la Historia de Usuario 1:
Task: "Crear el modelo [Entidad1] en src/models/[entidad1].py"
Task: "Crear el modelo [Entidad2] en src/models/[entidad2].py"
```

---

## Estrategia de Implementación

### MVP Primero (Solo Historia de Usuario 1)

1. Completar la Fase 1: Configuración
2. Completar la Fase 2: Fundamental (CRÍTICO - bloquea todas las historias)
3. Completar la Fase 3: Historia de Usuario 1
4. **DETENERSE y VALIDAR**: Probar la Historia de Usuario 1 de forma independiente
5. Desplegar/demostrar si está lista

### Entrega Incremental

1. Completar Configuración + Fundamental → Fundación lista
2. Agregar Historia de Usuario 1 → Probar de forma independiente → Desplegar/Demostrar (¡MVP!)
3. Agregar Historia de Usuario 2 → Probar de forma independiente → Desplegar/Demostrar
4. Agregar Historia de Usuario 3 → Probar de forma independiente → Desplegar/Demostrar
5. Cada historia aporta valor sin romper las historias anteriores

### Estrategia de Equipo en Paralelo

Con varios desarrolladores:

1. El equipo completa Configuración + Fundamental en conjunto
2. Una vez completada la Fundamental:
   - Desarrollador A: Historia de Usuario 1
   - Desarrollador B: Historia de Usuario 2
   - Desarrollador C: Historia de Usuario 3
3. Las historias se completan e integran de forma independiente

---

## Notas

- Las tareas [P] = archivos distintos, sin dependencias
- La etiqueta [Historia] mapea la tarea a una historia de usuario específica para trazabilidad
- Cada historia de usuario debe poder completarse y probarse de forma independiente
- Verifica que las pruebas fallen antes de implementar
- Haz commit después de cada tarea o grupo lógico
- Detente en cualquier punto de control para validar la historia de forma independiente
- Evita: tareas vagas, conflictos en el mismo archivo, dependencias entre historias que rompan la independencia
