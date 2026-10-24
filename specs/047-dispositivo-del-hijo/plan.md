# Plan de Implementación: Dispositivo del hijo

**Rama**: `feature/047-dispositivo-del-hijo` | **Fecha**: 2026-10-22 | **Especificación**: [spec.md](spec.md)

**Entrada**: `specs/047-dispositivo-del-hijo/spec.md`

## Resumen

La persona Tutora genera para un hijo una **liga de un solo uso**; el teléfono del niño la canjea por una **credencial de dispositivo** propia de ese hijo (sin correo, contraseña ni Clerk) y desde entonces ve y marca **solo** sus tomas, suplementos y actividades. El padre lista y quita dispositivos al instante; con el plan caducado el dispositivo sigue marcando; los avisos push llegan al aparato del hijo.

Enfoque técnico (detalle en [research.md](research.md)): una **segunda identidad aislada por construcción** — esquema `Authorization: Device` distinto de `Bearer`, un grupo de rutas propio `/child-device/*` con su middleware y una **lista blanca** de rutas que **reutilizan los handlers existentes** detrás de tres guardas ("es de mi hijo"). Las marcas ganan un autor-dispositivo (`taken_by_child_device_id`) y los avisos ganan destinatarios-dispositivo de forma **aditiva** (tablas nuevas, sin cambiar llaves primarias existentes). Una migración (`0029`), un paquete backend nuevo (`internal/childdevice`) y una feature de frontend nueva (`features/childDevice/`).

## Contexto Técnico

**Lenguaje/Versión**: Go 1.27.3 (backend), TypeScript / React 19 (frontend)

**Dependencias Principales**: las existentes (chi, pgx, Clerk SDK para los padres, TanStack Query, Tailwind v4, `vite-plugin-pwa`). **Ninguna nueva.** Sin variables de entorno nuevas.

**Almacenamiento**: PostgreSQL — tabla `child_device_links`, dos tablas de avisos y columnas nulas en `doses`, `supplement_doses` y `reminder_devices` (migración `0029`, solo aditiva)

**Pruebas**: `go test` contra la base real (concurrencia, tope, quitar, rotación con reloj inyectable), `router_test.go` (el dispositivo del hijo en todas las rutas), Vitest + Testing Library, Playwright a 390 y 1280 px con dos sesiones

**Plataforma Objetivo**: PWA en el teléfono del niño (iOS/Android) y navegador de escritorio de los padres

**Tipo de Proyecto**: aplicación web (API Go + PWA React)

**Objetivos de Rendimiento**: la autenticación del dispositivo es **una** consulta indexada por huella por petición; `last_seen_at` se escribe a lo más cada 10 min; quitar surte efecto en la siguiente petición (≤ 5 s)

**Restricciones**: nada de la ficha, la credencial ni el nombre del dispositivo en direcciones, registros ni `error_logs`; el menor no entrega datos; solo `tx` dentro de transacciones; todo por `*httpx.Responder`; textos neutrales (Principio I)

**Escala/Alcance**: 3 dispositivos por hijo; ~14 rutas del hijo; 1 pantalla de canje, 1 vista del hijo, 1 bloque «Acceso del hijo»

## Verificación de la Constitución

| Principio | Estado | Cómo se cumple |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Nada médico nuevo; el hijo ve y marca lo que el padre ya registró; textos sin imperativos médicos y con la prueba de redacción de la feature |
| II. Privacidad | ✅ | El menor no da correo, nombre ni edad; solo huellas, el nombre que escribe el padre y fechas; el OCR/fotos no intervienen; el aviso «Antes de empezar» sube de versión |
| III. Stack fijo | ✅ | Go + React PWA + PostgreSQL; sin dependencias nuevas; la foto no interviene |
| IV. Freemium disciplinado | ✅ | El plan solo decide quién **crea** el acceso; ver, marcar, quitar y usar nunca piden plan; con el plan caducado nada deja de registrarse |
| V. Simplicidad y MVP | ✅ | Se **reutilizan** los handlers de overview, rutinas y marcado y el patrón de fichas de la spec 032; una tabla central; aditivo en lo demás. Complejidad justificada abajo |
| VI. Cobertura (> 90 %) y E2E | ✅ | Plan de pruebas en R10; E2E con dos sesiones a 390 y 1280 px |

**Reevaluación tras el diseño**: sin violaciones. Un punto de atención: el reclamo de avisos del hijo duplica las **condiciones de candidata** de `ClaimDueDoses`/`ClaimDueSupplementDoses`; se mitiga extrayéndolas a una constante SQL compartida (R5).

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/047-dispositivo-del-hijo/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api.md
├── checklists/requirements.md
└── tasks.md              # lo crea /speckit-tasks
```

### Código fuente

```text
backend/
├── migrations/0029_child_device.sql                  # tablas y columnas nulas (aditiva)
├── internal/childdevice/                             # NUEVO
│   ├── model.go  token.go  errors.go                 # Link, fichas (32 bytes, SHA-256), errores
│   ├── repository.go                                 # crear (con bloqueos), canjear, autenticar, rotar, quitar, listar
│   ├── service.go  handler.go                        # reglas y rutas del padre / del dispositivo
│   ├── middleware.go                                 # RequireChildDevice + guardas sameChild / routineOfChild / consultationOfChild
│   └── *_test.go
├── internal/access/access.go                         # Access gana ActorDeviceID
├── internal/consultation/ y internal/supplement/     # Actor gana DeviceID; autor-dispositivo en marcar/leer; "mine"
├── internal/reminder/                                # destinatarios-dispositivo: ClaimDueChildDevices, ActiveDevicesForLink, rama en MarkTakenByAction
├── internal/server/router.go (+ router_test.go)      # el grupo /child-device y el dispositivo en la matriz
├── internal/account/disclaimer.go                    # sube CurrentDisclaimerVersion
└── cmd/api/main.go                                   # cableado

frontend/
├── src/features/childDevice/                         # NUEVO
│   ├── api.ts  storage.ts  hooks.ts                  # cliente propio con su almacenamiento; rotación
│   ├── RedeemPage.tsx  ChildTodayPage.tsx            # /hijo y /hijo/hoy
│   ├── ChildAccessBlock.tsx  ChildAccessList.tsx     # «Acceso del hijo» (padres)
│   └── childText.ts + pruebas
├── src/features/consultations/ChildDetailPage.tsx    # monta el bloque en ambos diseños
├── src/features/family/FamilyPage.tsx                # enlace/explicación
├── src/features/plans/planCopy.ts                    # motivo child_device
├── src/features/home/WelcomeDisclaimer.tsx           # frase nueva
├── src/App.tsx                                       # rutas públicas /hijo y /hijo/hoy
└── e2e/hijo.spec.ts                                  # dos sesiones, 390 y 1280 px
```

**Decisión de Estructura**: un paquete nuevo con todo lo propio del dispositivo; lo existente solo se **extiende** (un campo de actor, una columna de autor, un destinatario más). Los handlers de lectura y marcado no se duplican: se montan también bajo `/child-device/*`.

## Seguimiento de Complejidad

| Elemento | Por qué es necesario | Alternativa más simple rechazada porque |
|---|---|---|
| Segundo esquema (`Device`) y grupo de rutas | Aislar las dos identidades **por construcción**: una credencial de hijo no puede tocar rutas de padres aunque alguien olvide protegerlas | Que `RequireSession` acepte ambas: cada ruta tendría que decidir si admite al hijo (lista negra) |
| Tablas de avisos aparte (`child_*_reminders`) | Un aviso por toma y dispositivo sin migrar las llaves de `dose_reminders` | Destinatario polimórfico en las llaves existentes: migración riesgosa sobre tablas con datos |
| Rotación con ventana de gracia | Hacer inútil una credencial copiada sin sacar al niño por una carrera | Sin rotación: una copia robada serviría hasta los 90 días sin uso |
