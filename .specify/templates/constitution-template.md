# Constitución de [PROJECT_NAME]
<!-- Ejemplo: Constitución de Spec, Constitución de TaskFlow, etc. -->

## Principios Fundamentales

### [PRINCIPLE_1_NAME]
<!-- Ejemplo: I. Library-First -->
[PRINCIPLE_1_DESCRIPTION]
<!-- Ejemplo: Toda funcionalidad comienza como una librería independiente; las librerías deben ser autocontenidas, comprobables de forma independiente, documentadas; se requiere un propósito claro - no se permiten librerías solo organizativas -->

### [PRINCIPLE_2_NAME]
<!-- Ejemplo: II. CLI Interface -->
[PRINCIPLE_2_DESCRIPTION]
<!-- Ejemplo: Toda librería expone su funcionalidad mediante CLI; protocolo de texto entrada/salida: stdin/args → stdout, errores → stderr; soporte para formatos JSON y legibles por humanos -->

### [PRINCIPLE_3_NAME]
<!-- Ejemplo: III. Test-First (NO NEGOCIABLE) -->
[PRINCIPLE_3_DESCRIPTION]
<!-- Ejemplo: TDD obligatorio: Pruebas escritas → Aprobadas por el usuario → Las pruebas fallan → Entonces se implementa; el ciclo Rojo-Verde-Refactor se aplica estrictamente -->

### [PRINCIPLE_4_NAME]
<!-- Ejemplo: IV. Integration Testing -->
[PRINCIPLE_4_DESCRIPTION]
<!-- Ejemplo: Áreas que requieren pruebas de integración: pruebas de contrato de nuevas librerías, cambios de contrato, comunicación entre servicios, esquemas compartidos -->

### [PRINCIPLE_5_NAME]
<!-- Ejemplo: V. Observability, VI. Versioning & Breaking Changes, VII. Simplicity -->
[PRINCIPLE_5_DESCRIPTION]
<!-- Ejemplo: La E/S de texto garantiza la depurabilidad; se requiere logging estructurado; o bien: formato MAJOR.MINOR.BUILD; o bien: empezar simple, principios YAGNI -->

## [SECTION_2_NAME]
<!-- Ejemplo: Restricciones Adicionales, Requisitos de Seguridad, Estándares de Rendimiento, etc. -->

[SECTION_2_CONTENT]
<!-- Ejemplo: requisitos del stack tecnológico, estándares de cumplimiento, políticas de despliegue, etc. -->

## [SECTION_3_NAME]
<!-- Ejemplo: Flujo de Trabajo de Desarrollo, Proceso de Revisión, Quality Gates, etc. -->

[SECTION_3_CONTENT]
<!-- Ejemplo: requisitos de revisión de código, gates de pruebas, proceso de aprobación de despliegue, etc. -->

## Gobernanza
<!-- Ejemplo: La constitución tiene precedencia sobre cualquier otra práctica; las enmiendas requieren documentación, aprobación, plan de migración -->

[GOVERNANCE_RULES]
<!-- Ejemplo: Todos los PRs/revisiones deben verificar el cumplimiento; la complejidad debe justificarse; usar [GUIDANCE_FILE] como guía de desarrollo en tiempo de ejecución -->

**Versión**: [CONSTITUTION_VERSION] | **Ratificada**: [RATIFICATION_DATE] | **Última Modificación**: [LAST_AMENDED_DATE]
<!-- Ejemplo: Versión: 2.1.1 | Ratificada: 2025-06-13 | Última Modificación: 2025-07-16 -->
