# Plan de Implementación: Compartir hijos y consultas con la familia (plan de pago)

**Rama**: `feature/032-compartir-con-familia` | **Fecha**: 2026-10-06 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `specs/032-compartir-con-familia/spec.md`

## Resumen

Hoy todo permiso es «¿esta sesión es dueña de esta cuenta, hijo o consulta?» y los recordatorios se reclaman **por toma** y se
mandan a la cuenta dueña. Compartir exige tres cambios de fondo: **(1) membresías**: los hijos y consultas siguen colgando de la
cuenta dueña y dos tablas nuevas (`family_members`, `family_invitations`) dicen qué personas (cuentas) tienen acceso y con qué rol,
sin copiar datos (R2); **(2) un solo resolvedor de acceso** (`internal/access`) que responde «¿qué nivel tiene esta sesión sobre
este hijo?» (`none`/`mark`/`full`) y reemplaza a `ownership` para hijos, consultas y tomas, con el tope de plan para las personas
invitadas (R3, R4); **(3) tomas con autor y recordatorios por persona**: `doses` guarda quién marcó y cuándo (la primera gana,
R6) y `dose_reminders (dose, persona)` garantiza a lo más un aviso por toma y por persona (R7). `GET /accounts/me` mezcla los hijos
compartidos con su rol y el plan de su familia (R5). Invitar es a un **correo** y la liga lleva una ficha en el **fragmento** de la
dirección (R8). La app gana «Familia», la pantalla de la invitación y «por …» en las tomas, y oculta lo que el rol no permite
(R13). Dos migraciones (0017, 0018), sin dependencias nuevas. Se entrega **por fases** dentro de la Entrega 1 (R1).

## Contexto Técnico

**Lenguaje/Versión**: Go (backend) y TypeScript + React 19 (frontend). **Dependencias**: ninguna nueva.
**Almacenamiento**: PostgreSQL; migraciones `0017` (familias, invitaciones) y `0018` (autor de la marca, `dose_reminders` con relleno).
**Pruebas**: `go test ./... -cover` (>90 %, con `DATABASE_URL`), Vitest + Testing Library (>90 %), Playwright a 390 y 1280 px
con **dos sesiones**.
**Plataforma Objetivo**: PWA (móvil y escritorio) + API en Railway; Clerk de desarrollo en las E2E.
**Tipo de Proyecto**: aplicación web (backend Go + frontend React).
**Objetivos de Rendimiento**: una marca visible para los demás en < 1 min con la app abierta (el refresco de 60 s que ya existe,
spec 013); el resolvedor de acceso es una consulta indexada por petición.
**Restricciones**: toda respuesta por `*httpx.Responder`; **cada ruta con `RequireOwner`/nivel de acceso y su fila en
`router_test.go` por rol**; la ficha de la invitación y el correo **nunca** en direcciones ni en `error_logs`; Swagger regenerado;
dos diseños (móvil/web) sin mezclar; textos del Principio I; el plan lo decide el servidor.
**Escala/Alcance**: hasta 4 personas por familia, 10 hijos; sin correo saliente (no hay proveedor): la liga se comparte a mano.

## Verificación de la Constitución

*Antes de la investigación y de nuevo tras el diseño:*

- **I (registra, nunca interpreta)**: «por Ana, 08:05» solo registra; sin alertas ni acusaciones sobre quién dio o no una dosis;
  textos neutrales. ✅
- **II (privacidad)**: el aviso «Antes de empezar» se actualiza y se confirma de nuevo; el invitado acepta sabiendo qué verá;
  el correo y la ficha no se registran; solo el nombre de pila se muestra; consentimiento del tutor guardado para el rol Hijo. ✅
  (Pendiente **legal** explícito en la spec: custodia y menores.)
- **III (stack)**: Go + React PWA + PostgreSQL. ✅
- **IV (freemium disciplinado)**: compartir es una **función** de pago; si el plan se cancela, **nada ya registrado se oculta**
  y todos siguen marcando (R3, R11). ✅
- **V (simplicidad)**: sin copiar datos ni migrar la propiedad (R2); sin correo saliente, sin dependencias; Cuidador y Hijo son
  roles sobre el mismo mecanismo; el Hijo se difiere. ✅ *(la mayor complejidad es inherente: permisos y recordatorios por persona)*
- **VI (pruebas)**: matriz rol × ruta, carreras, recordatorios, privacidad, E2E con dos sesiones. ✅
- **Inmutabilidad de las consultas (spec 004)**: no cambia; solo se agrega autor a la **marca** de las tomas. ✅

Re-evaluación tras el diseño: sin violaciones que justificar.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/032-compartir-con-familia/
├── plan.md              # Este archivo
├── research.md          # Fase 0 (R1–R16)
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/family.md  # /family/… y los cambios aditivos a lo existente
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Código Fuente

```text
backend/migrations/
├── 0017_create_family.sql                  # family_members, family_invitations
└── 0018_dose_marks_and_reminders.sql       # doses.taken_by_account_id/taken_at, dose_reminders (+ relleno), índice
backend/internal/access/                    # NUEVO: nivel de acceso (none/mark/full) por sesión e hijo/consulta/cuenta; RequireLevel
backend/internal/family/                    # NUEVO: invitaciones, membresías, salir/quitar, tope de 4, ficha (hash), Handler `/family/…`
backend/internal/account/                   # GET /accounts/me con hijos compartidos (+ role/plan/readOnly, family); AddChild a la cuenta dueña
backend/internal/consultation/              # dosis con autor (UpdateDoseStatus con actor), takenBy en respuestas; permisos por nivel
backend/internal/reminder/                  # ClaimDueDoses por (toma, persona), destinatarios por acceso, «Tomada» a nombre del dispositivo
backend/internal/server/router.go (+ test)  # RequireLevel en cada ruta; /family; matriz rol × ruta
backend/internal/ownership/                 # queda solo para lo propio de la cuenta (aviso, recordatorios)
backend/internal/docs/                      # Swagger regenerado
backend/internal/account/disclaimer.go      # CurrentDisclaimerVersion + texto de compartir

frontend/src/
├── App.tsx                                 # rutas /familia y /familia/invitacion
├── features/family/                        # NUEVO: FamilyPage, InviteForm, MembersList, InvitationPage, api/hooks, useRole
├── features/home/, features/consultations/ # ocultar lo que el rol no permite; plan por hijo; ChildrenSidebar «Familia»
├── features/consultations/DoseChip/MedicationCard/ConsultationDetailPage/TodayDoses*  # «por Ana, 08:05»; desmarcar según permiso
├── features/home/WelcomeDisclaimer.tsx     # texto nuevo
frontend/e2e/familia.spec.ts, helpers.ts    # dos contextos; invitar→aceptar→marcar→«por …»→salir; plan cancelado
CLAUDE.md, backend/CLAUDE.md, frontend/CLAUDE.md, DEPLOY.md (migraciones 0017/0018), BACKLOG.md
```

**Decisión de Estructura**: aplicación web existente; dos paquetes de backend nuevos (`access`, `family`) y una carpeta de
frontend (`features/family`); el resto son cambios en `account`, `consultation`, `reminder` y `server`.

## Fases de la Entrega 1 (ver research R1)

1. **Base sin cambio visible**: migraciones 0017/0018, `access` (matriz probada), todas las rutas por nivel; el dueño sigue siendo el único con acceso.
2. **Quién marcó**: autor y hora, primera gana, `takenBy`, permisos de desmarcar, «por …» en la app.
3. **Familia**: invitaciones, aceptar, «Familia», `GET /accounts/me` con compartidos, rol en la interfaz, aviso nuevo.
4. **Recordatorios por persona**: `dose_reminders`, destinatarios por acceso, «Tomada» a nombre del dispositivo.
5. **Salir, quitar y plan cancelado**: desvincular, quitar, solo lectura derivada, unirse solo a familias de pago.

Entregas 2 (Cuidador) y 3 (Hijo): ver research R1 y R16.

## Seguimiento de Complejidad

Sin violaciones de la constitución; no aplica. La complejidad (permisos por rol, recordatorios por persona) viene de la propia
función y está acotada por un solo resolvedor de acceso y una sola llave primaria para los avisos.
