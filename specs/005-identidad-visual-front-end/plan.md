# Plan de Implementación: Identidad visual y rediseño del front-end

**Rama**: `feature/005-identidad-visual-front-end` | **Fecha**: 2026-09-18 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/005-identidad-visual-front-end/spec.md`

## Resumen

El front-end actual usa un solo cyan claro sobre blanco para todo (bordes, badges, enlaces, tarjetas), así que ningún elemento gana jerarquía y la app se percibe apagada. Esta funcionalidad introduce un sistema visual explícito: base teal profunda `#04252b` para headers y superficies oscuras, cyan de acción para lo interactivo, emerald para lo confirmado por el padre y ámbar para lo pendiente, con Figtree en 900 para titulares y densidad amplia. Incluye el logo de la PWA (cápsula partida en diagonal) y sus exportaciones de icono. No cambia rutas, contratos, modelo de datos ni reglas de negocio — solo marcado, clases de Tailwind y assets estáticos.

## Contexto Técnico

**Lenguaje/Versión**: TypeScript + React 19 + Vite (frontend). Backend sin cambios.

**Dependencias Principales**: Tailwind CSS v4 (ya en uso, tokens vía `@theme`), Figtree vía Google Fonts (ya importada en `index.css`). Sin dependencias nuevas.

**Almacenamiento**: Sin cambios — ninguna migración.

**Pruebas**: Vitest + Testing Library (las pruebas existentes deben pasar sin cambios de comportamiento); Playwright E2E de los 3 flujos ya cubiertos como gate de no-regresión; revisión manual de contraste y de instalación de la PWA en iOS y Android.

**Plataforma Objetivo**: Misma PWA (mobile-first) + vista de escritorio con barra lateral desde 1024 px.

**Tipo de Proyecto**: Aplicación web (Opción 2) — solo `frontend/`.

**Objetivos de Rendimiento**: Sin regresión de carga; el logo se sirve como SVG inline o archivo estático, sin fuentes ni imágenes nuevas.

**Restricciones**: Estilos utility-first con Tailwind, sin CSS a medida disperso (constitución, sección React). El color no puede comunicar juicio médico (Principio I). Contraste mínimo 4.5:1 (FR-008).

**Escala/Alcance**: 5 pantallas, 2 modales, 1 conjunto de tokens, 4 archivos de icono.

## Verificación de la Constitución

*GATE: Debe aprobarse antes de la investigación de la Fase 0. Volver a verificar tras el diseño de la Fase 1.*

- **Principio I (Registra, Nunca Interpreta) — NON-NEGOTIABLE**: El sistema de color codifica únicamente estados que el padre mismo produce (marcado / sin marcar) y nunca un juicio clínico; FR-015 lo fija explícitamente y descarta rojo de alerta o semáforos de dosis. ✅ Cumple.
- **Principio II (Privacidad)**: Sin cambios en captura, envío ni almacenamiento de datos. El logo y los iconos son assets locales, sin CDN de terceros nuevo. ✅ Cumple.
- **Principio III (Stack Tecnológico Fijo)**: React + PWA + Tailwind, sin librerías nuevas; el `manifest` y el service worker se tratan como parte del build, no como añadido (constitución, sección PWA). ✅ Cumple.
- **Principio IV (Freemium Disciplinado)**: El modal de límite freemium conserva su función y su copy; el rediseño no agrega gates ni presiones de compra nuevas. ✅ Cumple.
- **Principio V (Simplicidad y MVP Real)**: Sin sistema de design tokens en runtime, sin librería de componentes, sin modo oscuro (diferido a Adiciones Futuras). Los tokens viven en el `@theme` que Tailwind ya provee. ✅ Cumple.
- **Principio VI (Cobertura de Pruebas Obligatoria)**: Al no haber lógica nueva, el gate se cumple manteniendo la cobertura existente >90% y los E2E en verde; toda aserción que deba cambiar por renombre de texto queda listada en `tasks.md`. ✅ Cumple.

**Resultado**: Aprobado. Sin excepciones que requieran Seguimiento de Complejidad.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/005-identidad-visual-front-end/
├── plan.md             # Este archivo
├── spec.md             # Requisitos
├── design-tokens.md    # Paleta, tipografía, componentes base, uso del logo
└── tasks.md            # Tareas de implementación
```

### Código Fuente (raíz del repositorio)

```text
frontend/
├── index.html                                   # <title>PediTrack</title>, theme-color, link al manifest y favicon
├── public/
│   ├── favicon.svg                              # NUEVO — reemplaza el de Vite
│   ├── icon-192.png, icon-512.png               # NUEVO — iconos de la PWA
│   ├── icon-maskable-512.png                    # NUEVO — safe area de 20%
│   └── manifest.webmanifest                     # NUEVO — name, short_name, theme_color, iconos
├── src/index.css                                # Tokens de color en @theme + reset de body
├── src/shared/ui/Logo.tsx                       # NUEVO — el logo como componente SVG (header, registro)
├── src/features/account-signup/
│   ├── AccountSignupForm.tsx                    # Encabezado oscuro con logo, campos, CTA primaria
│   └── ChildFieldset.tsx                        # Tarjeta de hijo con badge y campos
├── src/features/home/
│   ├── HomePage.tsx                             # Header oscuro, saludo, tarjetas de hijo, sidebar en escritorio
│   ├── ChildCard.tsx                            # Avatar de inicial, edad, chips de resumen
│   └── AddChildModal.tsx                        # Patrón de modal de FR-010
└── src/features/consultations/
    ├── ChildDetailPage.tsx                      # Header oscuro del hijo, bloque de tomas de hoy, lista de consultas
    ├── ConsultationCard.tsx                     # Tarjeta con barra de acento a la izquierda
    ├── ConsultationDetailPage.tsx               # Receta, síntomas, medicamentos con chips de toma
    ├── ConsultationForm.tsx                     # Panel de OCR sobre fondo oscuro, campos sugeridos marcados
    ├── MedicationFieldset.tsx                   # Badge de medicamento, campos en dos columnas
    └── DoseCheckbox.tsx                         # Chip emerald (tomada) / ámbar (pendiente)
```

**Decisión de Estructura**: El logo se extrae a `src/shared/ui/Logo.tsx` porque lo consumen dos features distintas (registro y home/header) — mismo criterio que `shared/age.ts`. No se crea una carpeta `components/` global (la constitución exige estructura por feature); `shared/ui/` queda reservado a piezas verdaderamente transversales y de presentación pura.

## Fases

- **Fase 0 — Tokens y logo**: declarar la paleta en `@theme`, crear los assets de icono y el `manifest`. Bloquea todo lo demás.
- **Fase 1 — Pantallas móviles**: registro, home, detalle del hijo, detalle de consulta, formulario con OCR.
- **Fase 2 — Modales**: `AddChildModal` y `FreemiumLimitModal` al patrón de FR-010, preservando foco y scroll.
- **Fase 3 — Escritorio**: barra lateral de hijos y rejilla de resumen desde 1024 px.
- **Fase 4 — Verificación**: contraste, áreas táctiles, 320–1920 px sin scroll horizontal, cobertura y E2E en verde, instalación de la PWA en iOS y Android.

## Seguimiento de Complejidad

*Sin violaciones que justificar — ver Verificación de la Constitución arriba.*
