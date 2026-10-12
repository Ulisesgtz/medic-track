# Checklist de Calidad de la Especificación: Invitación a la familia por correo

**Propósito**: Validar la completitud y calidad de la especificación antes de continuar con la planificación

**Creado**: 2026-10-12

**Funcionalidad**: [spec.md](../spec.md)

## Calidad del Contenido

- [x] Sin detalles de implementación (lenguajes, frameworks, APIs) — la spec nombra componentes ya existentes del repo (`job:mailer`, `error_logs`, specs 018/032/039) y las decisiones del dueño (Resend, hipervínculo sin acortador), como hacen las specs 018, 021 y 039; el diseño del paquete común queda en Supuestos como decisión de diseño para el plan
- [x] Enfocado en el valor para el usuario y las necesidades del negocio (que la invitación llegue sin depender de copiar la liga; que la cuota se vigile)
- [x] Escrito para interesados no técnicos
- [x] Todas las secciones obligatorias completas (Escenarios, Requisitos, Criterios de Éxito, Supuestos)

## Completitud de los Requisitos

- [x] No quedan marcadores [NEEDS CLARIFICATION] — los valores no dichos (límites de reenvío, tiempo máximo de «enviándose», umbral y tope) tienen valor por omisión en Supuestos
- [x] Los requisitos son comprobables y no ambiguos (FR-001 a FR-019, cada uno con su escenario o criterio)
- [x] Los criterios de éxito son medibles (SC-001 a SC-009: un correo por invitación, menos de 1 minuto, 0 datos de los hijos, aviso una sola vez, digest con el contador en el tope, cobertura > 90 %)
- [x] Los criterios de éxito son independientes de la tecnología
- [x] Todos los escenarios de aceptación están definidos (Historias 1 a 4)
- [x] Los casos límite están identificados (correo rechazado, reenvío con envío en curso, invitación aceptada o cancelada antes de que salga, solicitud repetida al proveedor, cambio de día, varias copias, sin clave, nombre raro)
- [x] El alcance está claramente delimitado (fuera: acortador, correo de bienvenida o de aceptación, recordatorios, plantillas con imágenes, cambiar de proveedor, plan de pago de Resend, rol Hijo)
- [x] Las dependencias y supuestos están identificados (specs 018, 032, 039; clave y dominio ya verificados)

## Preparación de la Funcionalidad

- [x] Todos los requisitos funcionales tienen criterios de aceptación claros
- [x] Los escenarios de usuario cubren los flujos principales (recibir, ver el estado y copiar la liga, falla sin estorbar, vigilar la cuota)
- [x] La funcionalidad cumple los resultados medibles definidos en los Criterios de Éxito
- [x] Ningún detalle de implementación se filtra en la especificación

## Notas

- Principios verificados: **I** (texto neutro, nada médico), **II** (el correo lleva solo nombre de pila de quien invita, rol, vencimiento y la liga; nada de los hijos; el proveedor recibe lo mínimo para entregar), **V** (pieza pequeña), **VI** (FR-019).
- Decisiones del dueño recogidas: hipervínculo sin acortador ni seguimiento (la ficha en el `#` no debe verla un tercero), cuota de 100 al día vigilada con aviso a 80 y tope a 95.
- Siguiente fase: `/speckit-plan` (no hace falta `/speckit-clarify`: no hay marcadores).
