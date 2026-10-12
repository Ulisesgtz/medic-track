# Checklist de Calidad de la Especificación: Digest semanal de errores por correo

**Propósito**: Validar la completitud y calidad de la especificación antes de continuar con la planificación

**Creado**: 2026-10-12

**Funcionalidad**: [spec.md](../spec.md)

## Calidad del Contenido

- [x] Sin detalles de implementación (lenguajes, frameworks, APIs) — la spec nombra componentes ya existentes del repo (`error_logs`, `jobreport`, spec 021) y el proveedor recomendado por decisión del dueño del producto, como hacen las specs 018 y 021; no define código, tablas ni librerías
- [x] Enfocado en el valor para el usuario y las necesidades del negocio (enterarse de lo que falla en el campo sin ir a preguntar)
- [x] Escrito para interesados no técnicos (los escenarios hablan de «un correo por semana», no de cómo se programa)
- [x] Todas las secciones obligatorias completas (Escenarios, Requisitos, Criterios de Éxito, Supuestos)

## Completitud de los Requisitos

- [x] No quedan marcadores [NEEDS CLARIFICATION] — cada duda tiene un valor por omisión documentado en Supuestos (periodo, reintentos, diez grupos, zona horaria fija)
- [x] Los requisitos son comprobables y no ambiguos (FR-001 a FR-016, cada uno con su escenario o criterio)
- [x] Los criterios de éxito son medibles (SC-001 a SC-007: un correo por semana, 15 minutos, 0 duplicados, 0 datos sensibles, cobertura > 90 %)
- [x] Los criterios de éxito son independientes de la tecnología
- [x] Todos los escenarios de aceptación están definidos (Historias 1 a 3)
- [x] Los casos límite están identificados (retención corta, semana ruidosa, reinicio a la hora, zona horaria, falla del propio digest, mensajes largos, destinatario rechazado, cuentas repetidas)
- [x] El alcance está claramente delimitado (fuera de alcance: pantallas, alertas en tiempo real, panel, SMS/WhatsApp, invitaciones por correo)
- [x] Las dependencias y supuestos están identificados (specs 002, 018, 021; proveedor de correo dado de alta y verificado; DNS del dominio en Cloudflare con Email Routing)

## Preparación de la Funcionalidad

- [x] Todos los requisitos funcionales tienen criterios de aceptación claros
- [x] Los escenarios de usuario cubren los flujos principales (recibir, no duplicar ni perder, fallar con seguridad)
- [x] La funcionalidad cumple los resultados medibles definidos en los Criterios de Éxito
- [x] Ningún detalle de implementación se filtra en la especificación

## Notas

- Principios de la constitución verificados: **I** (nada médico), **II** (el proveedor de correo es un tercero pero solo recibe mensajes fijos de error y conteos; sin datos de personas ni de salud), **V** (pieza pequeña y justificada), **VI** (FR-016).
- Pendiente fuera del código (de una persona): crear la cuenta del proveedor, verificar el dominio de envío con registros propios (sin tocar el SPF ni el MX de la raíz, que administra Email Routing) y poner la clave en el entorno.
- Siguiente fase: `/speckit-clarify` (no hace falta: no hay marcadores) o `/speckit-plan`.
