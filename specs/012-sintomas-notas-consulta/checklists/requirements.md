# Checklist de Calidad de la Especificación: Síntomas seleccionables y notas previas a la consulta

**Propósito**: Validar la completitud y calidad de la especificación antes de continuar con la planificación
**Creado**: 2026-09-28
**Funcionalidad**: [spec.md](../spec.md)

## Calidad del Contenido

- [x] Sin detalles de implementación (lenguajes, frameworks, APIs)
- [x] Enfocado en el valor para el usuario y las necesidades del negocio
- [x] Escrito para interesados no técnicos
- [x] Todas las secciones obligatorias completas

## Completitud de los Requisitos

- [x] No quedan marcadores [NEEDS CLARIFICATION]
- [x] Los requisitos son comprobables y no ambiguos
- [x] Los criterios de éxito son medibles
- [x] Los criterios de éxito son independientes de la tecnología (sin detalles de implementación)
- [x] Todos los escenarios de aceptación están definidos
- [x] Los casos límite están identificados
- [x] El alcance está claramente delimitado
- [x] Las dependencias y supuestos están identificados

## Preparación de la Funcionalidad

- [x] Todos los requisitos funcionales tienen criterios de aceptación claros
- [x] Los escenarios de usuario cubren los flujos principales
- [x] La funcionalidad cumple los resultados medibles definidos en los Criterios de Éxito
- [x] Ningún detalle de implementación se filtra en la especificación

## Notas

- Las tablas concretas que pidió el usuario (catálogo `symptoms` y relación `consultation_symptoms` con hijo y cuenta,
  llaves compuestas) no se escriben en la spec a propósito: la spec las describe como entidades (FR-009, Entidades
  Clave) y el diseño de datos va en `data-model.md` durante `/speckit-plan`, tal como quedó en `BACKLOG.md`.
- No hay mock: FR-019 pide diseñar móvil y web con los tokens y presentarlo para aprobación.
- Validación en una iteración; sin pendientes.
