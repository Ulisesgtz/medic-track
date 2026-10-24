# Plan de Implementación: Cartilla de vacunación del hijo

**Rama**: `feature/046-cartilla-vacunacion` | **Fecha**: 2026-10-17 | **Especificación**: [spec.md](spec.md)

**Entrada**: `specs/046-cartilla-vacunacion/spec.md` (aclarada el 2026-10-17: sin próxima dosis, huella de corrección, listas independientes, tope de 10 fotos, borrado real).

## Resumen

El padre registra las vacunas de cada hijo a mano (de una lista de nombres o «otra» escrita por él) y guarda fotos de la cartilla de papel (hasta 10), con una ayuda de lectura en el teléfono que solo propone filas editables. Se comparte con la familia por los niveles de la spec 032 (Tutor escribe, Cuidador ve). La app **registra y nunca interpreta**: sin esquema, sin «toca», sin atrasos. Enfoque técnico: tres tablas nuevas (migración `0028`: catálogo público, dosis registradas y fotos, con llaves compuestas hijo/cuenta), un paquete de backend `internal/vaccination` con rutas anidadas bajo el hijo y un catálogo servido por `internal/catalog`, y una carpeta de frontend `features/vaccinations/` que reutiliza `shrinkPhoto`, `useOcrSuggestion`, `PhotoViewer` y `ConfirmDialog`. Decisiones en [research.md](research.md).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend); TypeScript 5 + React 19 (frontend)

**Dependencias Principales**: chi, pgx/pgxpool (ya existentes); React Hook Form, TanStack Query, Tailwind v4, `tesseract.js` (ya existentes). **Ninguna dependencia nueva.**

**Almacenamiento**: PostgreSQL; fotos como `bytea` (como las recetas); migración `0028` a mano antes del backend

**Pruebas**: `go test` contra la base real; Vitest + Testing Library; Playwright (Chromium, 390 y 1280 px)

**Plataforma Objetivo**: PWA móvil y web de escritorio; API en Railway; frontend en Cloudflare Pages

**Tipo de Proyecto**: web-service + PWA

**Objetivos de Rendimiento**: lista de cartilla de 20 vacunas visible en < 2 s (SC-006); la lista de fotos no carga imágenes (solo metadatos)

**Restricciones**: sin servicios externos para leer la imagen (Principio II); los textos libres solo en cuerpos, nunca en direcciones ni `error_logs`; dentro de una transacción solo se usa `tx` (sin pedir otra conexión al pool, lección de la spec 045); todo endpoint escribe por `*httpx.Responder`

**Escala/Alcance**: hasta 10 fotos por hijo; cientos de dosis por familia como mucho; 1 migración, 9 rutas, 1 paquete de backend, 1 carpeta de frontend

## Verificación de la Constitución

*GATE: aprobado antes de la Fase 0 y vuelto a verificar tras el diseño.*

| Principio | Estado | Cómo se cumple |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Sin esquema oficial, sin «toca», sin atrasos, sin «completa/incompleta», sin colores de alerta; el catálogo son solo nombres; una prueba de redacción recorre todos los textos de la función (FR-016, FR-024) |
| II. Privacidad | ✅ | La lectura de la foto es en el teléfono; las fotos solo en la cuenta; textos libres fuera de direcciones y `error_logs`; correos nunca en respuestas; se sube la versión del aviso «Antes de empezar» y el aviso de privacidad se actualiza (paso del dueño) |
| III. Stack fijo | ⚠️ nota | Go, React PWA, PostgreSQL. **Captura de fotos:** la constitución pide `<input type="file" accept="image/*" capture>`, pero el proyecto ya decidió (specs 004/043, `frontend/CLAUDE.md`) **no usar `capture`** porque en iOS/Android fuerza la cámara y no deja elegir de la galería; esta función sigue esa práctica vigente y nunca usa `getUserMedia`. **El texto de la constitución está desactualizado y conviene enmendarlo** (no bloquea esta función) |
| IV. Freemium | ✅ | Registro y fotos en ambos planes, sin límite por volumen de vacunas; el tope de 10 fotos es un resguardo de almacenamiento igual para todos; lo registrado nunca se oculta; no hay función exclusiva del plan de pago |
| V. Simplicidad / MVP | ✅ | Sin recordatorios (backlog), sin calendario, sin enlace foto↔vacuna, sin historial, sin papelera, sin dependencias nuevas; reutiliza catálogo, foto, lectura, diálogos y permisos existentes |
| VI. Cobertura | ✅ | >90 % en backend y frontend; pruebas con base real (llaves compuestas, tope, carrera); E2E a 390 y 1280 px |

**Gate**: sin violaciones injustificadas. **Re-verificación tras el diseño (Fase 1)**: sin cambios; la nota del Principio III es una discrepancia de documentación ya existente.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/046-cartilla-vacunacion/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # lo crea /speckit-tasks
```

### Código Fuente

```text
backend/
├── migrations/0028_vaccination_card.sql        # catálogo + semilla, dosis, fotos
├── internal/
│   ├── vaccination/                            # NUEVO
│   │   ├── model.go  errors.go  validate.go    # tipos, errores de dominio, validación pura
│   │   ├── repository.go                       # CRUD de dosis y fotos, tope bajo bloqueo del hijo
│   │   ├── service.go  handler.go              # reglas y rutas (todas por *httpx.Responder)
│   │   └── *_test.go                           # contra la base real
│   ├── catalog/                                # + ListVaccines y GET /catalog/vaccines
│   ├── account/disclaimer.go                   # se sube CurrentDisclaimerVersion
│   └── server/router.go (+ router_test.go)     # rutas con seesChild/fullChild y su matriz
└── cmd/api/main.go                             # cableado
frontend/
├── src/features/vaccinations/                  # NUEVO
│   ├── VaccinationCardPage.tsx                 # dos diseños (useIsDesktop)
│   ├── VaccineList.tsx  VaccineGroup.tsx       # agrupado por vacuna, dosis y fechas
│   ├── VaccineDialog.tsx                       # agregar / corregir
│   ├── CardPhotos.tsx  ProposedRows.tsx        # fotos, visor, filas propuestas por la lectura
│   ├── CardEntry.tsx                           # tarjeta de entrada en la página del hijo
│   ├── groupByVaccine.ts  parseVaccineText.ts  vaccineText.ts   # lo puro y los textos
│   ├── api.ts  hooks.ts  types.ts
│   └── *.test.ts(x)
├── src/shared/catalog/                         # + useVaccines
├── src/features/consultations/PhotoViewer.tsx  # + propiedad opcional label
├── src/features/consultations/ChildDetailPage.tsx   # + CardEntry en ambos diseños
├── src/features/home/WelcomeDisclaimer.tsx     # frase nueva
├── src/App.tsx                                 # ruta /children/:childId/cartilla
└── e2e/cartilla.spec.ts                        # + helpers de siembra en e2e/helpers.ts
```

**Decisión de estructura**: aplicación web (backend Go + frontend PWA) como el resto del repositorio; un solo paquete nuevo por lado para mantener la pieza pequeña (Principio V).

## Fases (para `/speckit-tasks`)

1. **Base de datos y catálogo**: migración `0028` (tablas, llaves compuestas, CHECK, semilla de nombres), `GET /catalog/vaccines`, `useVaccines`.
2. **Dosis (backend)**: validación pura, repositorio, servicio y rutas de dosis (crear con duplicado y `allowDuplicate`, listar, corregir con huella, borrar), router y matriz de permisos.
3. **Fotos (backend)**: subida validada, tope de 10 bajo bloqueo del hijo, lista de metadatos, imagen bajo demanda, borrado; prueba de carrera con pool pequeño.
4. **Cartilla manual (frontend)**: ruta, entrada desde la página del hijo, lista agrupada, diálogo de agregar/corregir, confirmación de borrado, estados vacío/carga/error, frase neutral, prueba de redacción. Dos diseños.
5. **Fotos y ayuda de lectura (frontend)**: miniaturas, visor, subida con `shrinkPhoto`, tope, filas propuestas con `parseVaccineText` confirmables una a una.
6. **Acceso familiar y privacidad**: Cuidador solo lectura en pantalla y servidor, aviso «Antes de empezar» con versión nueva.
7. **E2E y documentación**: `cartilla.spec.ts`, CLAUDE.md (raíz, backend, frontend), `DEPLOY.md` (migración `0028` antes del backend), verificación completa, revisión de código y PR a `develop`.

## Pasos del dueño del producto (no son código)

- Aplicar la migración `0028` en la base de DEV antes de desplegar el backend.
- Validar la lista de vacunas sembrada con la Cartilla Nacional de Salud vigente (se corrige con SQL).
- Actualizar el aviso de privacidad (LFPDPPP) y revisar el texto nuevo de «Antes de empezar».
- Probar con un iPhone real la foto de una cartilla física.
- No hay mock entregado de las pantallas: revisar el resultado y, si se quiere, pedir un diseño a Claude Design.
