# Plan de Implementación: Consultas del titular

**Rama**: `feature/058-consultas-del-titular` | **Fecha**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Entrada**: especificación de `specs/058-consultas-del-titular/spec.md`; el dueño aprobó los cinco supuestos el 2026-11-02.

## Resumen

La persona de la cuenta registra **sus propias consultas** con todo lo de la consulta de un hijo, en un **perfil propio** (`/yo`)
que reemplaza «Mi día». En el modelo, una consulta propia es una fila de `consultations` **sin hijo**, con la nueva columna
`account_id` (como las rutinas personales de la spec 033 parte 3). Todas las consultas SQL de un hijo filtran por `child_id`, así
que lo propio nunca entra en ellas. Solo se reescribe lo que resuelve la cuenta dueña a partir de la consulta: el acceso, los
recordatorios, el plan y el tope de fotos.

Son privadas por omisión. Con el interruptor encendido, la dueña de la familia y los Tutores las **ven, marcan y buscan** (nivel
Mark), nunca las editan ni las exportan, y sus avisos empiezan apagados. Solo el plan completo crea o recorre; con el plan vencido
lo ya registrado se ve, se marca, se edita, se finaliza y sigue avisando. Entran también el historial (spec 031) y el PDF
(spec 050) propios.

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27 (backend), TypeScript + React 19 (frontend PWA).
**Dependencias principales**: chi, pgx/pgxpool, Clerk; React Router, TanStack Query, Tailwind v4, `@react-pdf/renderer`
(ya usada por la spec 050), `tesseract.js` (ya usada). **Sin dependencias nuevas.**
**Almacenamiento**: PostgreSQL; migración `0032_own_consultations.sql`.
**Pruebas**: `go test` contra la base real (con y sin `pool_max_conns=4`), Vitest + Testing Library, Playwright (Chromium, 390
y 1280 px).
**Plataforma**: API en Railway, PWA en Cloudflare Pages.
**Tipo de proyecto**: web (backend + frontend).
**Metas de rendimiento**: las mismas que el detalle del hijo (una petición de acceso por ruta; la lista y el overview propios
con índice parcial).
**Restricciones**: Principio II (datos de salud de un adulto, privados por omisión; textos libres solo en cuerpos), el servidor
decide el acceso en cada petición, nada propio en el teléfono del hijo.
**Escala**: igual que las consultas de los hijos (decenas por persona).

Sin incógnitas abiertas: todas quedaron resueltas en [research.md](research.md) (R1–R9).

## Verificación de la Constitución

| Principio | Cómo se cumple |
|---|---|
| I. Registra, nunca interpreta | Lo propio reutiliza los textos de la consulta del hijo; los nuevos (perfil, interruptor, avisos) van en un archivo con prueba de redacción y no evalúan ni aconsejan |
| II. Privacidad | Privado por omisión; solo el dueño enciende el interruptor; Cuidador, integrante Hijo y teléfono del hijo nunca ven nada propio; acceso derivado en cada petición; avisos del Tutor con opt-in; sin acceso = 404; textos libres nunca en direcciones ni en `error_logs` (prueba); el PDF solo lo exporta el dueño |
| III. Stack fijo | Go + PostgreSQL + React PWA; sin dependencias nuevas |
| IV. Freemium disciplinado | Lo propio es del plan completo, pero con el plan vencido nada se esconde ni se borra (se ve, se marca, se edita, se finaliza y sigue avisando); la regla del plan gratuito de la spec 030 no cuenta lo propio |
| V. Simplicidad | La misma tabla de consultas con `child_id` nulo, las mismas rutas `/consultations/{id}` y las mismas pantallas con un «sujeto»; sin tablas paralelas ni un «hijo» oculto (R1) |
| VI. Cobertura | > 90 % en backend y frontend; E2E a 390 y 1280 px; pruebas de acceso por rol y de que nada propio se filtra a los hijos |

**Resultado**: sin violaciones. Re-evaluado después del diseño (Fase 1): igual. **Requiere** subir `CurrentDisclaimerVersion`
(la app ya registra la salud del adulto) y que el dueño actualice el aviso de privacidad antes de lanzarlo.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/058-consultas-del-titular/
├── spec.md
├── plan.md              # este archivo
├── research.md          # R1–R9
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md             # lo genera /speckit-tasks
```

### Código Fuente (raíz del repositorio)

```text
backend/
├── migrations/0032_own_consultations.sql          # account_id, child_id nulo, llaves, sharing, opt-in
├── internal/access/access.go                        # OnConsultation/OnAppointment con lo propio, OnPerson, OfAccountOnConsultation
├── internal/consultation/
│   ├── repository.go                                # Create sin hijo (plan personal), lista/overview por cuenta, owner desde account_id
│   ├── edit.go                                      # síntomas por la cuenta de la consulta; spec 030 solo para hijos
│   ├── search.go, export_batch.go                   # historial y lote del PDF por persona
│   ├── own.go, own_handler.go                       # rutas /accounts/{accountId}/… y my-reminders (nuevo)
│   └── sharing.go                                   # interruptor (nuevo)
├── internal/appointment/repository.go               # citas sin hijo
├── internal/historyexport/                          # sujeto persona, sin cartilla
├── internal/reminder/candidates.go, repository.go   # pares de lo propio (dueño + Tutor con opt-in), «Tomada»
├── internal/account/                                # /accounts/me: consultationSharing, sharedProfiles; CurrentDisclaimerVersion
└── internal/server/router.go (+ router_test.go)     # seesPerson/fullPerson y sus filas

frontend/src/
├── shared/subject.ts                                # { kind: 'child' | 'person' } → rutas del API y de la app (nuevo)
├── features/profile/                                # ProfilePage (dos diseños), SharedProfilePage, SharingToggle, profileText.ts (nuevo)
├── features/childDetail/                            # partes parametrizadas por sujeto
├── features/consultations/                          # nueva, detalle, edición con sujeto; «Tus avisos» de un Tutor
├── features/consultations/history…, pdfExport/      # historial y PDF con sujeto, sin cartilla
├── features/home/                                   # «Tu día» suma las tomas propias; accesos a perfiles compartidos
├── features/supplements/MyDayPage.tsx               # se retira: /mi-dia, /mis-suplementos, /mis-actividades → /yo
└── App.tsx                                          # /yo, /yo/consultas/nueva, /yo/historial, /personas/:accountId

frontend/e2e/consultas-del-titular.spec.ts
```

**Decisión de estructura**: aplicación web existente (backend + frontend); lo nuevo vive junto a lo que reutiliza.

## Fases de entrega (para `tasks.md`)

1. **Migración** `0032` y su prueba de relleno.
2. **Fundamental (backend)**: `account_id` en todas las escrituras y lecturas de la cuenta dueña; `access` con lo propio;
   pruebas de que nada propio aparece en rutas de hijos ni en `/child-device`.
3. **US1 – Mis consultas** (P1): crear, lista, overview, detalle, editar, finalizar, recorrer (plan), cita, recordatorios del
   dueño; perfil `/yo` en dos diseños, redirecciones, «Tu día».
4. **US2 – Compartir** (P2): interruptor, `OnPerson`, `sharedProfiles`, perfil compartido, «Tus avisos» con opt-in.
5. **US3 – Historial y PDF** (P3).
6. **Cierre**: E2E, aviso «Antes de empezar», mapas (`CLAUDE.md` raíz, `backend/CLAUDE.md`, `frontend/CLAUDE.md`), BACKLOG,
   Swagger, verificación completa, `/code-review` y PR a `develop`.

## Seguimiento de Complejidad

Sin violaciones que justificar.
