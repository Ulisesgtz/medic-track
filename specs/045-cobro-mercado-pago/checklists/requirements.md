# Checklist de Calidad de la Especificación: Cobro del plan completo con Mercado Pago

**Propósito**: Validar la completitud y calidad de la especificación antes de continuar con la planificación
**Creado**: 2026-10-15
**Funcionalidad**: [spec.md](../spec.md)

## Calidad del Contenido

- [x] Sin detalles de implementación (lenguajes, frameworks, APIs) — el proveedor (Mercado Pago) es una decisión de negocio del dueño; el mecanismo de avisos se dice como «aviso del proveedor», sin endpoints ni tablas
- [x] Enfocado en el valor para el usuario y las necesidades del negocio
- [x] Escrito para interesados no técnicos
- [x] Todas las secciones obligatorias completas

## Completitud de los Requisitos

- [x] No quedan marcadores [NEEDS CLARIFICATION] — el periodo de gracia (7 días), los reembolsos (por correo, sin automatismo) y las cuentas con plan dado a mano se resolvieron con supuestos documentados
- [x] Los requisitos son comprobables y no ambiguos
- [x] Los criterios de éxito son medibles
- [x] Los criterios de éxito son independientes de la tecnología (sin detalles de implementación)
- [x] Todos los escenarios de aceptación están definidos (5 historias)
- [x] Los casos límite están identificados
- [x] El alcance está claramente delimitado (ver «Fuera de alcance» en Supuestos)
- [x] Las dependencias y supuestos están identificados (cuenta del proveedor, RFC y facturación previos al primer cobro real)

## Preparación de la Funcionalidad

- [x] Todos los requisitos funcionales tienen criterios de aceptación claros
- [x] Los escenarios de usuario cubren los flujos principales (pagar, renovar o fallar, cancelar, estados, pruebas)
- [x] La funcionalidad cumple los resultados medibles definidos en los Criterios de Éxito
- [x] Ningún detalle de implementación se filtra en la especificación

## Notas

- **Decisiones del dueño que condicionan el plan** (para `/speckit-plan`): la tarjeta nunca toca el servidor; el plan se deriva de una suscripción; las cuentas con plan dado a mano no se tocan; los reembolsos se hacen a mano.
- **Pasos del dueño antes del primer cobro real** (no son código): contador (RFC, facturación, nombre legal), términos y aviso de privacidad, credenciales reales en Railway.
- **A verificar en la documentación del proveedor durante `/speckit-plan`**: cómo se captura la tarjeta sin que pase por el servidor, qué firma trae el aviso, cómo se cancela y cómo se actualiza la tarjeta de una suscripción, la comisión de las suscripciones y la liberación del dinero.
