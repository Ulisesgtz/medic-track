# Especificación: Aviso informativo al crear la cuenta

**Rama**: `feature/008-autenticacion-cuenta` (se entrega junto con el PR #8; es una spec propia porque no es de autenticación)
**Estado**: Implementada

## Objetivo

Que quien acaba de crear su cuenta sepa, antes de usar la app, que PediTrack es una bitácora **informativa y de seguimiento**:
registra lo que el pediatra indica, **no sustituye una consulta médica** y **no interpreta** ningún dato (Principio I).
También le dice qué pasa con la foto de la receta (Principio II).

## Requisitos funcionales

- **FR-001**: Al terminar de crear la cuenta (formulario de registro o "Registrarme con Google" + completar registro), la
  persona llega a `/home` y ve, arriba del listado de hijos, un aviso titulado "Antes de empezar".
- **FR-002**: El aviso dice, en español: que la app es informativa y de seguimiento; que no sustituye una consulta médica
  ni interpreta datos; que ante cualquier duda o síntoma se acuda siempre al médico; y que el texto de la foto de la receta
  se lee en el teléfono y la foto se guarda solo en la cuenta de la persona y no se comparte.
- **FR-003**: El aviso se quita con el botón "Entendido" y no vuelve al recargar la página ni al iniciar sesión otra vez.
- **FR-004**: Iniciar sesión, o volver al home de cualquier otra forma, **no** muestra el aviso.
- **FR-005**: Se ve igual de bien en móvil (390 px) y en web (1280 px), cada uno con su diseño (`useIsDesktop`), con los tokens
  de `specs/005-identidad-visual-front-end/design-tokens.md` (superficie `hint`, un solo botón de contorno, sin rojo).

## Decisiones

- **La foto sí se guarda.** La primera redacción pedida decía que la foto "no se guarda ni comparte". Eso no es cierto:
  la foto viaja al backend y queda en la consulta (spec 004). El aviso dice lo que pasa de verdad: el OCR se hace en el
  teléfono y la foto queda solo en la cuenta de la persona.
- **Sin almacenamiento.** El aviso vive en el `state` de la navegación (`{ welcome: true }`, `WELCOME_STATE`), no en
  `localStorage` ni en el backend: no hay tabla ni endpoint nuevos. "Entendido" limpia ese `state` con `replace`.
- No hay aceptación registrada (no es un "acepto los términos"); si algún día hace falta consentimiento verificable
  habría que guardarlo en el backend y sería otra spec.

## Pruebas

- Unitarias: `WelcomeDisclaimer.test.tsx`; el registro por correo y el de Google comprueban que el home muestra el aviso.
- E2E (`e2e/account-signup.spec.ts`, 390 y 1280 px): aparece tras crear la cuenta, "Entendido" lo quita y no vuelve al recargar.
