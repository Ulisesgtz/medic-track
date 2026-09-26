# Especificación: Aviso informativo al crear la cuenta

**Rama**: `feature/008-autenticacion-cuenta` (se entrega junto con el PR #8; es una spec propia porque no es de autenticación)
**Estado**: Implementada (el registro de la confirmación, en la spec 010)

## Objetivo

Que quien acaba de crear su cuenta sepa, antes de usar la app, que PediTrack es una bitácora **informativa y de seguimiento**:
registra lo que el pediatra indica, **no sustituye una consulta médica** y **no interpreta** ningún dato (Principio I).
También le dice qué pasa con la foto de la receta (Principio II).

## Requisitos funcionales

- **FR-001**: Al terminar de crear la cuenta (formulario de registro o "Registrarme con Google" + completar registro), la
  persona llega a `/home` y ve, arriba del listado de hijos, un aviso titulado "Antes de empezar".
- **FR-002**: El aviso dice, en español: que la app es informativa y de seguimiento; que no sustituye una consulta médica
  ni interpreta datos; que ante cualquier duda o síntoma se acuda siempre al médico; que el texto de la receta solo se lee
  cuando está impresa (no escrita a mano), y lo que se lee se propone para que la persona lo corrija; que si una receta no está
  dentro de lo que la app puede leer, **no se interpreta y no se autollena ningún campo** (la persona los captura), para no
  interpretar nada; y que la lectura se hace en el teléfono y la foto se guarda solo en la cuenta de la persona y no se comparte.
- **FR-003**: El aviso se quita con el botón "Entendido" y no vuelve al recargar la página ni al iniciar sesión otra vez.
- **FR-004**: *(Sustituido por la spec 010.)* Al principio el aviso solo salía justo después de crear la cuenta; ahora sale
  mientras la cuenta no lo haya confirmado (también las cuentas anteriores) y la confirmación queda registrada en el backend.
- **FR-005**: Se ve igual de bien en móvil (390 px) y en web (1280 px), cada uno con su diseño (`useIsDesktop`), con los tokens
  de `specs/005-identidad-visual-front-end/design-tokens.md` (superficie `hint`, un solo botón de contorno, sin rojo).

## Decisiones

- **La foto sí se guarda.** La primera redacción pedida decía que la foto "no se guarda ni comparte". Eso no es cierto:
  la foto viaja al backend y queda en la consulta (spec 004). El aviso dice lo que pasa de verdad: el OCR se hace en el
  teléfono y la foto queda solo en la cuenta de la persona.
- **Estado y registro: ver la spec 010.** Este documento fija el texto y el diseño del aviso; que «Entendido» quede
  registrado (y por eso el aviso ya no vive en el estado de la navegación) lo define
  `specs/010-registro-aceptacion-aviso/`.

## Pruebas

- Unitarias: `WelcomeDisclaimer.test.tsx` (el texto, cuándo se muestra y qué pasa al pulsar «Entendido») y `HomePage.test.tsx`.
- E2E (`e2e/account-signup.spec.ts` y `autenticacion.spec.ts`, 390 y 1280 px): aparece tras crear la cuenta y "Entendido" lo quita (ver también la spec 010).
